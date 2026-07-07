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

// OSRM – vzdálenost a čas jízdy
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

function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  let brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

interface WaypointItem {
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  bearing: number;
  description: string;
}

// Komplexní databáze reálných bodů v okolí Vyškova (62 položek)
const WAYPOINTS_DB: WaypointItem[] = [
  { name: "Podivice", lat: 49.3789, lon: 17.0286, distanceKm: 10.9, bearing: 15, description: "lesní obec hluboko v Drahanské vrchovině" },
  { name: "Radslavice", lat: 49.3242, lon: 17.0090, distanceKm: 4.7, bearing: 18, description: "obec pod Zelenou horou" },
  { name: "Zelená Hora", lat: 49.3278, lon: 17.0242, distanceKm: 5.5, bearing: 28, description: "obec na kopci s dalekým výhledem" },
  { name: "Pustiměř", lat: 49.3182, lon: 17.0463, distanceKm: 5.6, bearing: 48, description: "obec s rotundou sv. Pantaleona" },
  { name: "Drnovice", lat: 49.2763, lon: 16.9515, distanceKm: 2.9, bearing: 253, description: "obec s expozicí vojenské techniky a větrným mlýnem" },
  { name: "Topolany", lat: 49.2706, lon: 17.0395, distanceKm: 4.1, bearing: 77, description: "obec na řece Hané" },
  { name: "Křižanovice u Vyškova", lat: 49.2920, lon: 17.0383, distanceKm: 3.9, bearing: 53, description: "obec na úpatí Litenčické pahorkatiny" },
  { name: "Kozlany", lat: 49.2041, lon: 17.0352, distanceKm: 9.7, bearing: 164, description: "obec s vodní nádrží Kozlany" },
  { name: "Bohdalice", lat: 49.2126, lon: 17.0281, distanceKm: 8.2, bearing: 160, description: "obec se zámkem a parkem" },
  { name: "Kučerov", lat: 49.2186, lon: 17.0053, distanceKm: 7.3, bearing: 170, description: "obec s lidovým domem a muzeem" },
  { name: "Bučovice", lat: 49.1485, lon: 17.0022, distanceKm: 15.1, bearing: 176, description: "město s unikátním renesančním zámkem" },
  { name: "Lysovice", lat: 49.2133, lon: 16.9693, distanceKm: 8.2, bearing: 200, description: "pámková zóna s doškovými domy" },
  { name: "Hlubočany", lat: 49.2370, lon: 16.9982, distanceKm: 5.3, bearing: 158, description: "obec v údolí Hlubočanského potoka" },
  { name: "Letonice", lat: 49.1678, lon: 16.9610, distanceKm: 13.1, bearing: 189, description: "obec s barokním kostelem sv. Mikuláše" },
  { name: "Dražovice", lat: 49.1865, lon: 16.9535, distanceKm: 11.2, bearing: 193, description: "obec s kaplí sv. Václava" },
  { name: "Rostěnice", lat: 49.2363, lon: 16.9629, distanceKm: 5.5, bearing: 198, description: "obec s dochovanou lidovou architekturou" },
  { name: "Slavkov u Brna", lat: 49.1542, lon: 16.8767, distanceKm: 16.6, bearing: 209, description: "barokní zámek Slavkov, bojiště bitvy u Austerlitz" },
  { name: "Komořany", lat: 49.2198, lon: 16.9183, distanceKm: 8.8, bearing: 216, description: "obec na úpatí kopečků" },
  { name: "Rousínov", lat: 49.2045, lon: 16.8778, distanceKm: 12.0, bearing: 222, description: "město známé výrobou nábytku" },
  { name: "Tučapy", lat: 49.2333, lon: 16.9184, distanceKm: 7.8, bearing: 218, description: "obec s kaplí sv. Floriána" },
  { name: "Habrovany", lat: 49.2310, lon: 16.8790, distanceKm: 10.0, bearing: 233, description: "obec se zámkem a zámeckým parkem" },
  { name: "Nemojany", lat: 49.2520, lon: 16.9189, distanceKm: 6.2, bearing: 235, description: "obec s Nemojanským mlýnem a rybníkem" },
  { name: "Luleč", lat: 49.2558, lon: 16.9238, distanceKm: 5.7, bearing: 236, description: "obec s přírodním koupalištěm U Libuše a kostelem sv. Martina" },
  { name: "Viničné Šumice", lat: 49.2178, lon: 16.8190, distanceKm: 14.4, bearing: 239, description: "vinařská obec pod kopci" },
  { name: "Kovalovice", lat: 49.2268, lon: 16.8295, distanceKm: 13.2, bearing: 241, description: "obec u Kovalovického biotopu" },
  { name: "Olšany", lat: 49.2593, lon: 16.8441, distanceKm: 10.6, bearing: 250, description: "obec blízko Farmy Bolka Polívky a lesů" },
  { name: "Račice", lat: 49.2817, lon: 16.8641, distanceKm: 9.5, bearing: 258, description: "obec pod zámkem Račice" },
  { name: "Pístovice", lat: 49.2806, lon: 16.9036, distanceKm: 5.8, bearing: 282, description: "rekreační obec u rybnika" },
  { name: "Bukovinka", lat: 49.2882, lon: 16.8165, distanceKm: 12.5, bearing: 272, description: "lesní obec v Drahanské vrchovině" },
  { name: "Křtiny", lat: 49.2965, lon: 16.7432, distanceKm: 17.9, bearing: 274, description: "poutní obec s barokním chrámem" },
  { name: "Ježkovice", lat: 49.3045, lon: 16.8833, distanceKm: 8.0, bearing: 286, description: "obec blízko Pístovického rybníka" },
  { name: "Ruprechtov", lat: 49.3287, lon: 16.8514, distanceKm: 11.5, bearing: 294, description: "obec s větrným mlýnem a rybnikem" },
  { name: "Jedovnice", lat: 49.3425, lon: 16.7602, distanceKm: 17.8, bearing: 291, description: "turistické centrum u rybníka Olšovec v Moravském krasu" },
  { name: "Krásensko", lat: 49.3645, lon: 16.8299, distanceKm: 14.4, bearing: 307, description: "obec na náhorní plošině Drahané vrchoviny" },
  { name: "Lhota", lat: 49.3023, lon: 16.9602, distanceKm: 2.9, bearing: 314, description: "obec u lesů Vojenského újezdu" },
  { name: "Rychtářov", lat: 49.3242, lon: 16.9288, distanceKm: 6.2, bearing: 315, description: "vstupní brána do Vojenského újezdu Březina" },
  { name: "Studnice", lat: 49.3768, lon: 16.8805, distanceKm: 12.9, bearing: 323, description: "nejvýše položená obec Vyškovska" },
  { name: "Dědice", lat: 49.2985, lon: 16.9745, distanceKm: 1.9, bearing: 326, description: "předměstí Vyškova s kostelem" },
  { name: "Hamiltony", lat: 49.3059, lon: 16.9698, distanceKm: 2.8, bearing: 330, description: "klidná část Vyškova u lesa" },
  { name: "Opatovice", lat: 49.3030, lon: 16.9549, distanceKm: 2.8, bearing: 307, description: "obec u Opatovické přehrady" },
  // Turistické cíle a zajímavosti
  { name: "Rozhledna Chocholík", lat: 49.2797, lon: 16.9377, distanceKm: 3.8, bearing: 262, description: "vyhledávaná ocelová rozhledna na kopci Chocholík u Drnovice" },
  { name: "Pístovický rybnik", lat: 49.2719, lon: 16.9015, distanceKm: 5.8, bearing: 266, description: "oblíbené rekreační místo s koupáním a občerstvením" },
  { name: "Ruprechtovský rybník", lat: 49.3170, lon: 16.8485, distanceKm: 10.8, bearing: 290, description: "rybník vhodný k odpočinku u obce Ruprechtov" },
  { name: "Větrný mlýn Ruprechtov", lat: 49.3327, lon: 16.8480, distanceKm: 11.7, bearing: 295, description: "unikátní větrný mlýn s Halladayovou turbínou" },
  { name: "Zřícenina hradu Melice", lat: 49.3242, lon: 16.9658, distanceKm: 4.7, bearing: 337, description: "zřícenina biskupského hradu v lesích u Rychtářova" },
  { name: "Opatovická přehrada", lat: 49.3235, lon: 16.9698, distanceKm: 4.6, bearing: 342, description: "vodní nádrž na pitnou vodu obklopená lesy" },
  { name: "Farma Bolka Polívky", lat: 49.2409, lon: 16.8721, distanceKm: 11.5, bearing: 237, description: "známá rekreační farma s restaurací a chovem koní" },
  { name: "Koupaliště U Libuše", lat: 49.2558, lon: 16.9238, distanceKm: 5.7, bearing: 236, description: "přírodní zatopený lom v Lulči s čistou vodou" },
  { name: "Letecké muzeum Vyškov", lat: 49.3024, lon: 17.0235, distanceKm: 4.2, bearing: 49, description: "expozice vojenské i civilní letecké techniky u Pustiměře" },
  { name: "Zámek Račice", lat: 49.2752, lon: 16.8695, distanceKm: 9.3, bearing: 256, description: "renesancni zamek v obci Račice" },
  { name: "Zámek Bučovice", lat: 49.1485, lon: 17.0022, distanceKm: 15.1, bearing: 176, description: "unikátní renesanční zámek s arkádovým nádvořím" },
  { name: "Zámek Slavkov", lat: 49.1542, lon: 16.8767, distanceKm: 16.6, bearing: 209, description: "barokní zámek spojený s bitvou u Slavkova (Austerlitz)" },
  { name: "Biotop Kovalovice", lat: 49.2268, lon: 16.8295, distanceKm: 13.2, bearing: 241, description: "přírodní koupaliště s čistou biologicky čištěnou vodou" },
  { name: "Rybník Olšovec", lat: 49.3425, lon: 16.7602, distanceKm: 17.8, bearing: 291, description: "velký rekreační rybník v Jedovnicích" },
  { name: "Jeskyně Výpustek", lat: 49.2905, lon: 16.7235, distanceKm: 19.3, bearing: 278, description: "zpřístupněná jeskyně s bohatou vojenskou historií" },
  { name: "Arboretum Křtiny", lat: 49.3175, lon: 16.7455, distanceKm: 17.9, bearing: 281, description: "rozsáhlá sbírka dřevin a rašeliniště u Křtin" },
  { name: "Rakovecké údolí", lat: 49.3005, lon: 16.8480, distanceKm: 10.4, bearing: 280, description: "nádherné zalesněné údolí oblíbené cyklisty" },
  { name: "Údolí Malé Hané", lat: 49.3150, lon: 16.9388, distanceKm: 4.9, bearing: 314, description: "malebné lesní údolí podél toku Malé Hané" },
  { name: "Kačenec Luleč", lat: 49.2505, lon: 16.9205, distanceKm: 6.2, bearing: 232, description: "přírodní jezírko a klidné okolí" },
  { name: "Singletrail Jedovnice", lat: 49.3448, lon: 16.7582, distanceKm: 17.9, bearing: 291, description: "jednosměrné terénní stezky pro horská kola v lesích" }
];

function getCandidateWaypoints(distanceKm: number): WaypointItem[] {
  // Vypočítáme cílový poloměr na základě geometrie okruhu (R ≈ D / 9.5)
  const rAvg = distanceKm / 9.5;
  const minR = Math.max(1.0, rAvg - 2.0);
  const maxR = rAvg + 2.0;

  const filtered = WAYPOINTS_DB.filter(
    wp => wp.distanceKm >= minR && wp.distanceKm <= maxR
  );

  // Ochrana proti stereotypu: náhodně promíchat a poslat AI pouze podmnožinu 11 bodů
  const shuffled = [...filtered].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 11);
}

async function snapMultipleWaypoints(waypoints: any[]): Promise<any[] | null> {
  const aroundStatements = waypoints.map(wp => `
    // Turistické a historické body
    node["tourism"~"viewpoint|museum|attraction|information|picnic_site|theme_park"](around:400, ${wp.lat}, ${wp.lon});
    way["tourism"~"viewpoint|museum|attraction|information|picnic_site|theme_park"](around:400, ${wp.lat}, ${wp.lon});
    node["historic"~"castle|ruins|monument|memorial|archaeological_site"](around:400, ${wp.lat}, ${wp.lon});
    way["historic"~"castle|ruins|monument|memorial|archaeological_site"](around:400, ${wp.lat}, ${wp.lon});

    // Přírodní body a občerstvení
    node["natural"~"peak|spring|cave_entrance"](around:400, ${wp.lat}, ${wp.lon});
    node["amenity"~"restaurant|pub|cafe"](around:400, ${wp.lat}, ${wp.lon});

    // Obce
    node["place"~"village|suburb|town"](around:400, ${wp.lat}, ${wp.lon});

    // Cesty (jako záloha)
    way["highway"~"cycleway|path|track|residential|tertiary|secondary"](around:400, ${wp.lat}, ${wp.lon});
  `).join("\n");

  const query = `
    [out:json][timeout:8];
    (
      ${aroundStatements}
    );
    out center;
  `;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
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
  
  let finalDistance = Math.min(80, distance);
  let finalDifficulty = difficulty;

  if (isRandom) {
    finalDistance = Math.floor(Math.random() * (75 - 15 + 1)) + 15;
    const diffs: BikeRouteDifficulty[] = ["easy", "medium", "hard"];
    finalDifficulty = diffs[Math.floor(Math.random() * diffs.length)];
    emit?.(`🎲 Generuji náhodnou trasu: ${finalDistance} km...`);
  }

  const diffLabel = DIFFICULTY_MAP[finalDifficulty].label;
  const diffHint  = DIFFICULTY_PROMPT_HINT[finalDifficulty];

  // Dynamický počet průjezdních bodů podle délky trasy.
  const waypointCount: { min: number; max: number } =
    finalDistance <= 15 ? { min: 4, max: 5  } :
    finalDistance <= 30 ? { min: 5, max: 6  } :
    finalDistance <= 50 ? { min: 6, max: 8  } :
                          { min: 8, max: 10 };

  console.log(`[BIKE GENERATOR] Délka ${finalDistance} km → průjezdní body: ${waypointCount.min}–${waypointCount.max}`);

  emit?.("AI navrhuje trasu a průjezdní body...");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

  // Získat náhodný podvýběr cílů z DB
  const candidates = getCandidateWaypoints(finalDistance);
  const candidatesStr = JSON.stringify(candidates.map(c => ({
    name: c.name,
    distanceKm: c.distanceKm,
    bearing: c.bearing,
    description: c.description
  })), null, 2);

  const systemPrompt = `Jsi expert na cyklistiku na jižní Moravě a plánovač tras.
Uživatel požaduje cyklotrasu o délce ${finalDistance} km a obtížnosti ${diffLabel}. Tvá úloha je vybrat průjezdní body (waypoints) tak, aby po jejich spojení do okruhu (start -> body -> cíl) trasa měřila přibližně tuto vzdálenost.

Pravidla pro výběr:
- Start a cíl je na souřadnicích 49.2844N, 16.989E (Vyškov).
- Vyber z níže uvedeného seznamu kandidátů přesně ${waypointCount.min} až ${waypointCount.max} bodů, které tvoří logický okruh.
- ZAKÁZÁNO: Vybírat body, které nejsou v seznamu kandidátů! Musíš vybrat výhradně ze seznamu.
- ZAKÁZÁNO: Body nesmí ležet těsně vedle sebe! Vyber je tak, aby byly rovnoměrně rozprostřeny po trase.
- POVINNÉ: Seřaď vybrané body v poli "waypoints" podle úhlu 'bearing' vzestupně (např. 15 -> 48 -> 176 -> 236 -> 326) tak, aby po sobě jdoucí body tvořily plynulý okruh po směru hodinových ručiček a trasa se nekřížila.
- Odhad délky: Součet vzdušných vzdáleností z Vyškova do prvního bodu, mezi body a z posledního bodu zpět do Vyškova by měl odpovídat přibližně 70-80 % požadované délky (tj. cca ${Math.round(finalDistance * 0.75)} km vzdušnou čarou), protože reálná trasa po silnicích je cca o 30-40 % delší.

Seznam dostupných kandidátů:
${candidatesStr}

VÝSTUP MUSÍ BÝT JSON OBJEKT:
{
  "title": "Stručný název (max 5 slov)",
  "description": "Motivační popis trasy (2-3 věty). ${diffHint}",
  "waypoints": [
    {"name": "Název vybraného místa 1"}
  ]
}

DŮLEŽITÉ: Vrať POUZE validní JSON bez markdownu.`;

  let bikeData: any;
  const PRIMARY_MODEL   = "gemini-3.5-flash";
  const FALLBACK_MODEL  = "gemini-2.5-flash";

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
      throw new Error(`Generování tras selhalo na obou modelech. Primární: ${primaryErr.message}. Fallback: ${fallbackErr.message}`);
    }
  }

  // HYBRIDNÍ MODEL: Mapování a přitažení reálných bodů
  const geminiWaypoints = bikeData.waypoints || [];
  emit?.("Hledám reálná místa na trase...");

  // Rezoluce bodů z naší přesné databáze podle názvu
  const resolvedWaypoints: any[] = geminiWaypoints.map((wp: any) => {
    const dbMatch = WAYPOINTS_DB.find(w => w.name.toLowerCase() === wp.name.toLowerCase());
    if (dbMatch) {
      return {
        name: dbMatch.name,
        lat: dbMatch.lat,
        lon: dbMatch.lon
      };
    }
    // Pokud nenašel v DB (nemělo by se stát), přeskočíme
    console.warn(`[BIKE GENERATOR] Waypoint "${wp.name}" nenalezen v DB.`);
    return null;
  }).filter(Boolean);

  const elements = await snapMultipleWaypoints(resolvedWaypoints);
  const snappedWaypoints: any[] = [];
  const usedElementIds = new Set<string>();

  for (const wp of resolvedWaypoints) {
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
        if (dist > 400) continue; // Úzký okruh pro snapping

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
        usedElementIds.add(best.key);

        let name = wp.name;
        if (selectedCat === "A" || selectedCat === "B") {
          name = elem.tags?.name || elem.tags?.tourism || elem.tags?.historic || wp.name;
        }
        console.log(`[BIKE GENERATOR] Snap WP "${wp.name}" → "${name}" (kat. ${selectedCat}, ${Math.round(best.dist)}m)`);
        candidate = { ...wp, lat: best.lat, lon: best.lon, name };
      } else {
        console.log(`[BIKE GENERATOR] Snap WP "${wp.name}" → žádný kandidát, fallback na DB souřadnice`);
      }
    }

    if (snappedWaypoints.length > 0) {
      const last = snappedWaypoints[snappedWaypoints.length - 1];
      if (last.lat === candidate.lat && last.lon === candidate.lon) {
        console.warn(`[BIKE GENERATOR] Duplicitní waypoint "${candidate.name}" po snappingu – přeskakuji`);
        continue;
      }
    }

    snappedWaypoints.push(candidate);
  }

  // Zamezení křížení: seřadit body podle úhlu bearing od Vyškova
  snappedWaypoints.sort((a, b) => {
    const bearingA = getBearing(HOME_COORDS[1], HOME_COORDS[0], a.lat, a.lon);
    const bearingB = getBearing(HOME_COORDS[1], HOME_COORDS[0], b.lat, b.lon);
    return bearingA - bearingB;
  });

  // Příprava souřadnic pro OSRM/ORS: Start -> Snapped Waypoints -> Cíl
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
    
    // Výpočet realistického času cyklisty (rychlost podle obtížnosti)
    const speedMap: Record<BikeRouteDifficulty, number> = { easy: 14, medium: 17, hard: 20 };
    const speed = speedMap[finalDifficulty] || 17;
    const totalHours = actualDistanceNum / speed;
    const hrs = Math.floor(totalHours);
    const mins = Math.round((totalHours - hrs) * 60);
    durationText = hrs > 0 ? `${hrs}:${mins.toString().padStart(2, "0")} h` : `${mins} min`;
    console.log(`[BIKE GENERATOR] OSRM vzdálenost: ${distanceText}, vypočtený čas cyklisty: ${durationText}`);
  }

  // ORS – převýšení s detekcí spiků a realistickým fallback odhadem
  let orsSummary: any = null;
  if (orsResult.status === "fulfilled" && orsResult.value) {
    orsSummary = orsResult.value;
  }

  const maxReasonableAscent = actualDistanceNum * 22; // max 22m/km stoupání v okolí Vyškova
  if (orsSummary && orsSummary.ascent && orsSummary.ascent <= maxReasonableAscent) {
    elevationText = `${Math.round(orsSummary.ascent)} m`;
  } else {
    // Fallback odhad výšky na základě délky a obtížnosti
    const multiplier = finalDifficulty === "easy" ? 6 : finalDifficulty === "medium" ? 11 : 16;
    const estimatedAscent = Math.round(actualDistanceNum * multiplier);
    elevationText = `${estimatedAscent} m (odhad)`;
    if (orsSummary && orsSummary.ascent) {
      console.warn(`[BIKE GENERATOR] ORS prevyseni ${Math.round(orsSummary.ascent)}m odmítnuto (max ${Math.round(maxReasonableAscent)}m pro ${actualDistanceNum}km trasu) – SRTM spike.`);
    }
    console.log(`[BIKE GENERATOR] Použit odhad stoupání: ${elevationText}`);
  }

  // Fallback vzdálenosti, pokud OSRM selhal
  if (!actualDistanceNum && orsSummary && orsSummary.distance) {
    actualDistanceNum = Math.round(orsSummary.distance / 100) / 10;
    distanceText = `${actualDistanceNum} km (odhad)`;
    
    const speedMap: Record<BikeRouteDifficulty, number> = { easy: 14, medium: 17, hard: 20 };
    const speed = speedMap[finalDifficulty] || 17;
    const totalHours = actualDistanceNum / speed;
    const hrs = Math.floor(totalHours);
    const mins = Math.round((totalHours - hrs) * 60);
    durationText = hrs > 0 ? `${hrs}:${mins.toString().padStart(2, "0")} h` : `${mins} min`;
  } else if (!actualDistanceNum) {
    console.warn(`[BIKE GENERATOR] ORS a OSRM nedostupné.`);
  }

  // Sestavení Mapy.cz URL s názvy průjezdních bodů
  // Mapy.cz turistický plánovač s routeType a pojmenovanými body (zobrazí se v bočním panelu)
  const MAPY_ROUTE_TYPE: Record<BikeRouteDifficulty, string> = {
    easy:   "bike_road",
    medium: "bike_mountain",
    hard:   "bike_mountain",
  };
  const routeType = MAPY_ROUTE_TYPE[finalDifficulty];
  const mapyUrl = `https://mapy.cz/fnc/v1/route?routeType=${routeType}&start=${HOME_COORDS[0]},${HOME_COORDS[1]}&end=${HOME_COORDS[0]},${HOME_COORDS[1]}${snappedWaypoints.length > 0 ? "&waypoints=" + snappedWaypoints.map((p: any) => `${p.lon},${p.lat}`).join(";") : ""}`;

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
