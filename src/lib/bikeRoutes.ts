import { GoogleGenerativeAI } from "@google/generative-ai";
import admin from "firebase-admin";

export type BikeRouteDifficulty = "easy" | "medium" | "hard";

export interface BikeRouteParams {
  location?: string;
  userId?: string;
  distance?: number;          // km, default 20
  difficulty?: BikeRouteDifficulty; // default "medium"
  isRandom?: boolean;
  authorName?: string;
  emit?: (msg: string) => void;
}

// ORS profil slouží POUZE pro výpočet převýšení
const DIFFICULTY_MAP: Record<BikeRouteDifficulty, { orsProfile: string; label: string }> = {
  easy:   { orsProfile: "cycling-regular",  label: "Lehká (Rodinná)" },
  medium: { orsProfile: "cycling-mountain", label: "Střední (Hobby)" },
  hard:   { orsProfile: "cycling-mountain", label: "Těžká (Sportovní)" },
};

// OSRM – vzdálenost a čas jízdy (nejbližší aproximace Mapy.cz)
async function verifyRouteWithOSRM(coords: number[][]): Promise<{ distanceKm: number; durationText: string } | null> {
  const coordsStr = coords.map(c => `${c[0]},${c[1]}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/bike/${coordsStr}?overview=false&alternatives=false&steps=false`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return null;
    const distanceKm = Math.round(route.distance / 100) / 10;
    const totalSec = route.duration;
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const durationText = hrs > 0 ? `${hrs}:${mins.toString().padStart(2, "0")} h` : `${mins} min`;
    return { distanceKm, durationText };
  } catch {
    clearTimeout(timeoutId);
    console.warn("[BIKE GENERATOR] OSRM selhalo.");
    return null;
  }
}

const DIFFICULTY_PROMPT_HINT: Record<BikeRouteDifficulty, string> = {
  easy:  "Zdůrazni bezpečnost, pohodové tempo a vhodnost pro rodiny s dětmi. Vyhni se náročným stoupáním.",
  medium: "Popiš trasu jako skvělou volbu pro hobby cyklisty — balanc výkonu a zážitku.",
  hard:  "Popiš trasu jako sportovní výzvu. Zdůrazni stoupání, délku a fyzickou náročnost.",
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // m
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function snapMultipleWaypoints(waypoints: any[]): Promise<any[] | null> {
  const aroundStatements = waypoints.map(wp => `
    // Turistické a historické body
    node["tourism"~"viewpoint|museum|attraction|information|picnic_site|theme_park"](around:1200, ${wp.lat}, ${wp.lon});
    way["tourism"~"viewpoint|museum|attraction|information|picnic_site|theme_park"](around:1200, ${wp.lat}, ${wp.lon});
    node["historic"~"castle|ruins|monument|memorial|archaeological_site"](around:1200, ${wp.lat}, ${wp.lon});
    way["historic"~"castle|ruins|monument|memorial|archaeological_site"](around:1200, ${wp.lat}, ${wp.lon});

    // Přírodní body a občerstvení
    node["natural"~"peak|spring|cave_entrance"](around:1200, ${wp.lat}, ${wp.lon});
    node["amenity"~"restaurant|pub|cafe"](around:1200, ${wp.lat}, ${wp.lon});

    // Obce
    node["place"~"village|suburb|town"](around:1200, ${wp.lat}, ${wp.lon});

    // Cesty (jako záloha)
    way["highway"~"cycleway|path|track|residential|tertiary|secondary"](around:1200, ${wp.lat}, ${wp.lon});
  `).join("\n");

  // FIX 2: Overpass timeout snížen na 8s; AbortController má 12s buffer
  // (dříve: timeout:10 + AbortController 6s → klient přerušoval před Overpassem)
  const query = `
    [out:json][timeout:8];
    (
      ${aroundStatements}
    );
    out center;
  `;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // FIX 2: bylo 6000
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Vikendovnik-App (zefram.net@gmail.com)"
        },
        body: "data=" + encodeURIComponent(query),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.elements && data.elements.length > 0) {
          console.log(`[BIKE GENERATOR] Overpass úspěch (${endpoint}): ${data.elements.length} elementů`);
          return data.elements;
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[BIKE GENERATOR] Overpass endpoint ${endpoint} selhal, zkouším další...`);
    }
  }
  return null;
}


export async function generateBikeRoute({
  location: userLocation,
  userId,
  distance = 20,
  difficulty = "medium",
  isRandom = false,
  authorName,
  emit,
}: BikeRouteParams) {
  let actualDistanceNum = 0;
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    throw new Error("Služba pro generování tras není správně nakonfigurována (chybí API klíč).");
  }

  // PŘESNÉ DOMÁCÍ SOUŘADNICE (Vyškov)
  const HOME_COORDS = [16.9890503, 49.2844189]; // [lon, lat]
  
  let finalDistance = distance;
  let finalDifficulty = difficulty;

  if (isRandom) {
    finalDistance = Math.floor(Math.random() * (60 - 15 + 1)) + 15;
    const diffs: BikeRouteDifficulty[] = ["easy", "medium", "hard"];
    finalDifficulty = diffs[Math.floor(Math.random() * diffs.length)];
    emit?.(`🎲 Generuji náhodnou trasu: ${finalDistance} km...`);
  }

  const diffLabel = DIFFICULTY_MAP[finalDifficulty].label;
  const diffHint  = DIFFICULTY_PROMPT_HINT[finalDifficulty];

  // Dynamický počet průjezdních bodů podle délky trasy.
  // Kotvy: ≤15 km = min 4, 51–80 km = min 8 (zadání uživatele).
  // Střední vzdálenosti lineárně interpolovány.
  const waypointCount: { min: number; max: number } =
    finalDistance <= 15 ? { min: 4, max: 5  } :
    finalDistance <= 30 ? { min: 5, max: 6  } :
    finalDistance <= 50 ? { min: 6, max: 8  } :
                          { min: 8, max: 10 };

  console.log(`[BIKE GENERATOR] Délka ${finalDistance} km → průjezdní body: ${waypointCount.min}–${waypointCount.max}`);

  emit?.("AI navrhuje trasu a průjezdní body...");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

  // FIX 6: Poloměr kružnice vypočítáme server-side – AI nemůže dělat matematiku spolehlivě.
  // Geometrická logika: okruh N bodů na kružnici poloměru r má délku ≈ 2π·r,
  // průměrné waypointCount.max bodů → r ≈ distance / (2 · sin(π/N) · N) ≈ distance / 6.3
  const radiusKm = Math.round((finalDistance / 6.3) * 10) / 10;

  // FIX 4: Upřesněný prompt – AI musí volit souřadnice středů obcí, ne krajiny
  const systemPrompt = `Jsi expert na cyklistiku na jižní Moravě a plánovač tras.
Uživatel požaduje cyklotrasu o délce ${finalDistance} km a obtížnosti ${diffLabel}. Tvá úloha je vygenerovat průjezdní body (waypoints) tak, aby po jejich spojení do okruhu (start -> body -> cíl) trasa měřila přibližně tuto vzdálenost.

Pravidla pro výpočet:
- Start a cíl je na souřadnicích 49.2844N, 16.989E (Vyškov). Průjezdní body musí být vzdáleny od této polohy přibližně ${radiusKm} km vzdušnou čarou (ne méně než ${Math.max(1, radiusKm - 2)} km, ne více než ${radiusKm + 3} km).
- Vygeneruj přesně ${waypointCount.min} až ${waypointCount.max} bodů tak, aby tvořily logický okruh (postupně ve směru hodinových ručiček nebo i proti). Trasu můžeš plánovat kterýmkoliv směrem. Delší trasa = více bodů rovnoměrně po celém obvodu.
- ZAKÁZÁNO: Body nesmí ležet těsně vedle sebe! Musí být rovnoměrně rozprostřeny po trase.
- ZAKÁZÁNO: Vyhni se dálnici D1. Nikdy negeneruj body, které leží přímo na dálničním tělese, v dálničních křižovatkách nebo na dálničních sjezdech.
- ZAKÁZÁNO: Negeneruj body uvnitř uzavřených pěších zón, placených areálů nebo v Zoo Vyškov!
- POVINNÉ: Každý bod MUSÍ být umístěn na souřadnice STŘEDU konkrétní obce nebo reálné turistické atrakce. NIKDY neumísťuj body do otevřené krajiny, polí nebo lesů bez sídla. Příklady správných bodů v okolí Vyškova: střed obce Drnovice (49.300, 17.027), střed obce Ivanovice na Hané (49.305, 17.097), střed obce Bučovice (49.148, 17.002), střed obce Křižanovice (49.265, 17.044), střed obce Pustiměř (49.318, 17.046), střed obce Olšany u Prostějova (49.389, 17.062). Takto konkrétně vol i ostatní body.
- Start ani cíl do výstupu nepiš, vrať POUZE průjezdní body v poli "waypoints".

VÝSTUP MUSÍ BÝT JSON OBJEKT:
{
  "title": "Stručný název (max 5 slov)",
  "description": "Motivační popis trasy (2-3 věty). ${diffHint}",
  "waypoints": [
    {"lon": 16.123, "lat": 49.123, "name": "Název místa 1"}
  ]
}

DŮLEŽITÉ: Vrať POUZE validní JSON bez markdownu.`;

  // FIX 9: Fallback model pro případ selhání primárního (kvóta, timeout, neplatný model).
  // Bez fallbacku by jakákoliv chyba Gemini shodila celé generování.
  let bikeData: any;
  const PRIMARY_MODEL   = "gemini-3.1-flash-lite";
  const FALLBACK_MODEL  = "gemini-3.1-flash-lite-preview";

  const parseGeminiResponse = (text: string) => {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  };

  try {
    console.log(`[BIKE GENERATOR] Generuji trasu modelem ${PRIMARY_MODEL}...`);
    const primaryModel = genAI.getGenerativeModel({ model: PRIMARY_MODEL });
    const result = await primaryModel.generateContent(systemPrompt);
    const responseText = result.response.text();
    bikeData = parseGeminiResponse(responseText);
    if (!bikeData?.waypoints?.length) throw new Error("Prázdné waypoints od primárního modelu");
    console.log(`[BIKE GENERATOR] ${PRIMARY_MODEL} vrátil ${bikeData.waypoints.length} bodů.`);
  } catch (primaryErr: any) {
    console.warn(`[BIKE GENERATOR] ${PRIMARY_MODEL} selhal (${primaryErr.message}), zkouším fallback ${FALLBACK_MODEL}...`);
    emit?.("Přepínám na záložní model...");
    try {
      const fallbackModel = genAI.getGenerativeModel({ model: FALLBACK_MODEL });
      const fallbackResult = await fallbackModel.generateContent(systemPrompt);
      const fallbackText = fallbackResult.response.text();
      bikeData = parseGeminiResponse(fallbackText);
      if (!bikeData?.waypoints?.length) throw new Error("Prázdné waypoints od fallback modelu");
      console.log(`[BIKE GENERATOR] Fallback ${FALLBACK_MODEL} vrátil ${bikeData.waypoints.length} bodů.`);
    } catch (fallbackErr: any) {
      throw new Error(`Generování tras selhal o na oběma modelech. Primární: ${primaryErr.message}. Fallback: ${fallbackErr.message}`);
    }
  }

  // HYBRIDNÍ MODEL: Přitažení bodů z Gemini k realitě přes Overpass (hromadně)
  const geminiWaypoints = bikeData.waypoints || [];
  emit?.("Hledám reálná místa na trase...");
  const elements = await snapMultipleWaypoints(geminiWaypoints);
  const snappedWaypoints: any[] = [];

  // FIX 1: Sledujeme použitá OSM ID, aby dva různé waypoints neskončily na stejném místě.
  // Klíč: "${type}/${id}" – unikátní pro každý OSM element.
  const usedElementIds = new Set<string>();

  for (const wp of geminiWaypoints) {
    let candidate = wp;
    if (elements && elements.length > 0) {
      const catA: any[] = []; // památky, turistické body, gastro, přírodní cíle
      const catB: any[] = []; // obce
      const catC: any[] = []; // cesty/silnice (highway)

      for (const elem of elements) {
        const eLat = elem.lat || elem.center?.lat;
        const eLon = elem.lon || elem.center?.lon;
        if (eLat === undefined || eLon === undefined) continue;

        const dist = getDistance(wp.lat, wp.lon, eLat, eLon);
        if (dist > 1200) continue;

        // FIX 1: Přeskočit elementy již použité jiným waypointem
        const elemKey = `${elem.type}/${elem.id}`;
        if (usedElementIds.has(elemKey)) continue;

        const tags = elem.tags || {};
        const hasAttr = tags.tourism || tags.historic || tags.natural || tags.amenity;
        const isPlace = tags.place;
        const isRoad  = tags.highway;

        const item = { elem, dist, lat: eLat, lon: eLon, key: elemKey };

        if (hasAttr) {
          catA.push(item);
        } else if (isPlace) {
          catB.push(item);
        } else if (isRoad) {
          catC.push(item);
        }
      }

      // Výběr podle priorit
      let best: any = null;
      let selectedCat = "";

      if (catA.length > 0) {
        catA.sort((a, b) => a.dist - b.dist);
        best = catA[0];
        selectedCat = "A";
      } else if (catB.length > 0) {
        catB.sort((a, b) => a.dist - b.dist);
        best = catB[0];
        selectedCat = "B";
      } else if (catC.length > 0) {
        catC.sort((a, b) => a.dist - b.dist);
        best = catC[0];
        selectedCat = "C";
      }

      if (best) {
        const elem = best.elem;
        // FIX 1: Zaregistrovat použité OSM ID
        usedElementIds.add(best.key);

        // Název: z Kategorie A a B vezmeme reálný název z OSM,
        // z Kategorie C (cesty) ponecháme původní název z Gemini, aby to nebylo obecné "Zajímavé místo"
        let name = wp.name;
        if (selectedCat === "A" || selectedCat === "B") {
          name = elem.tags?.name || elem.tags?.tourism || elem.tags?.historic || wp.name;
        }
        console.log(`[BIKE GENERATOR] Snap WP "${wp.name}" → "${name}" (kat. ${selectedCat}, ${Math.round(best.dist)}m)`);
        candidate = { ...wp, lat: best.lat, lon: best.lon, name };
      } else {
        console.log(`[BIKE GENERATOR] Snap WP "${wp.name}" → žádný kandidát, fallback na AI souřadnice`);
      }
    }

    // Pokud už pole snappedWaypoints něco obsahuje, porovnej lat a lon posledního bodu s kandidátem
    if (snappedWaypoints.length > 0) {
      const last = snappedWaypoints[snappedWaypoints.length - 1];
      if (last.lat === candidate.lat && last.lon === candidate.lon) {
        console.warn(`[BIKE GENERATOR] Duplicitní waypoint "${candidate.name}" po snappingu – přeskakuji`);
        continue;
      }
    }

    snappedWaypoints.push(candidate);
  }

  // Příprava souřadnic pro ORS: Start -> Snapped Waypoints -> Cíl
  const coords = [HOME_COORDS, ...snappedWaypoints.map((p: any) => [p.lon, p.lat]), HOME_COORDS];

  emit?.("Ověřuji trasu a výšku...");
  const diffConfig = DIFFICULTY_MAP[finalDifficulty];
  let distanceText = "";
  let elevationText = "";
  let durationText = "";

  // Paralelní volání: OSRM (vzdálenost + čas) + ORS (převýšení)
  const [osrmResult, orsResult] = await Promise.allSettled([
    verifyRouteWithOSRM(coords),
    (async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        const orsResponse = await fetch(
          `https://api.openrouteservice.org/v2/directions/${diffConfig.orsProfile}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": apiKey
            },
            body: JSON.stringify({ coordinates: coords, elevation: true, instructions: false }),
            signal: controller.signal
          }
        );
        clearTimeout(timeoutId);
        if (!orsResponse.ok) {
          const errText = await orsResponse.text();
          console.warn(`[BIKE GENERATOR] ORS HTTP ${orsResponse.status}: ${errText.substring(0, 200)}`);
          return null;
        }
        const orsData = await orsResponse.json();
        // FIX 3: ORS /v2/directions vrací { routes: [{ summary }] }.
        // Ověřeno živým testem — routes[0].summary je primární cesta.
        // Fallback na features[0].properties.summary pro případ budoucí změny formátu.
        const summary =
          orsData.routes?.[0]?.summary ??
          orsData.features?.[0]?.properties?.summary ??
          null;
        if (summary) {
          console.log(`[BIKE GENERATOR] ORS summary: dist=${Math.round(summary.distance)}m, ascent=${Math.round(summary.ascent)}m`);
        } else {
          console.warn("[BIKE GENERATOR] ORS: summary nenalezeno. Klíče:", Object.keys(orsData));
        }
        return summary;
      } catch {
        clearTimeout(timeoutId);
        console.warn("[BIKE GENERATOR] ORS selhalo, výška nebude k dispozici.");
        return null;
      }
    })()
  ]);

  // OSRM – vzdálenost a čas
  if (osrmResult.status === "fulfilled" && osrmResult.value) {
    actualDistanceNum = osrmResult.value.distanceKm;
    distanceText = `${actualDistanceNum} km`;
    durationText = osrmResult.value.durationText;
    console.log(`[BIKE GENERATOR] OSRM vzdálenost: ${distanceText}, čas: ${durationText}`);
  }

  // ORS – pouze převýšení
  if (orsResult.status === "fulfilled" && orsResult.value) {
    const orsSummary = orsResult.value;
    // Sanity check: max 40 m/km průměrného stoupání (Tour de France horská etapa).
    // Cokoli více = datový spike v ORS SRTM modelu → ignorujeme.
    const maxReasonableAscent = actualDistanceNum * 40;
    if (orsSummary.ascent && orsSummary.ascent <= maxReasonableAscent) {
      elevationText = `${Math.round(orsSummary.ascent)} m`;
    } else if (orsSummary.ascent) {
      console.warn(`[BIKE GENERATOR] ORS prevyseni ${Math.round(orsSummary.ascent)}m odmítnuto (max ${Math.round(maxReasonableAscent)}m pro ${actualDistanceNum}km trasu) – SRTM spike.`);
    }
    // Fallback vzdálenosti, pokud OSRM selhal
    if (!actualDistanceNum && orsSummary.distance) {
      actualDistanceNum = Math.round(orsSummary.distance / 100) / 10;
      distanceText = `${actualDistanceNum} km (odhad)`;
    }
    console.log(`[BIKE GENERATOR] ORS převýšení: ${elevationText || "odmítnuto (spike)"}`);
  } else {
    const reason = orsResult.status === "rejected" ? orsResult.reason?.message : "null response";
    console.warn(`[BIKE GENERATOR] ORS nedostupné: ${reason}`);
  }

  // Sestavení Mapy.cz URL (použijeme snappedWaypoints pro reálné cíle)
  const wpParam = snappedWaypoints.map((p: any) => `${p.lon},${p.lat}`).join(";");
  // FIX 5: routeType odpovídá obtížnosti – easy = asfaltové/turistické cyklotrasy,
  // medium/hard = horské trasy (smíšený povrch)
  const MAPY_ROUTE_TYPE: Record<BikeRouteDifficulty, string> = {
    easy:   "bike_road",
    medium: "bike_mountain",
    hard:   "bike_mountain",
  };
  const routeType = MAPY_ROUTE_TYPE[finalDifficulty];
  const mapyUrl = `https://mapy.cz/fnc/v1/route?routeType=${routeType}&start=${HOME_COORDS[0]},${HOME_COORDS[1]}&end=${HOME_COORDS[0]},${HOME_COORDS[1]}${wpParam ? "&waypoints=" + wpParam : ""}`;

  const suggestion = {
    title: bikeData.title,
    description: bikeData.description,
    target: "pro_vsechny",
    location: userLocation || "Vyškov a okolí",
    url: mapyUrl,
    cycling_info: {
      distance: distanceText || `${finalDistance} km`,
      elevation: elevationText || "N/A",
      duration: durationText || "odhad",
      difficulty: diffLabel
    },
    date: new Date().toISOString().split("T")[0],
    time_type: "flexible",
    is_vyskov: true,
    indoor: false,
    userId: userId || "anonymous",
    authorId: userId || "anonymous",
    childName: authorName || "Uživatel",
    type: "activity",
    status: "draft",
    requestedDistance: finalDistance,
    requestedDifficulty: finalDifficulty,
    distance: actualDistanceNum || finalDistance,
    actualDistance: actualDistanceNum || finalDistance,
    routeType: isRandom ? 'random' : 'custom',
    isRandom: isRandom,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  if (admin.apps.length > 0) {
    const db = admin.firestore();
    const docRef = await db.collection("suggestions").add(suggestion);
    return { ...suggestion, id: docRef.id };
  }

  return suggestion;
}
