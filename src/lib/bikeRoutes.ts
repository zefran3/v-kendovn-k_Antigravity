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

// Mapování obtížnosti na ORS profil a český popis
const DIFFICULTY_MAP: Record<BikeRouteDifficulty, { orsProfile: string; label: string }> = {
  easy:   { orsProfile: "cycling-regular",  label: "Lehká (Rodinná)" },
  medium: { orsProfile: "cycling-regular",  label: "Střední (Hobby)" },
  hard:   { orsProfile: "cycling-mountain", label: "Těžká (Sportovní)" },
};

const DIFFICULTY_PROMPT_HINT: Record<BikeRouteDifficulty, string> = {
  easy:  "Zdůrazni bezpečnost, pohodové tempo a vhodnost pro rodiny s dětmi. Vyhni se náročným stoupáním.",
  medium: "Popiš trasu jako skvělou volbu pro hobby cyklisty — balanc výkonu a zážitku.",
  hard:  "Popiš trasu jako sportovní výzvu. Zdůrazni stoupání, délku a fyzickou náročnost.",
};

async function snapToRealPlace(lat: number, lon: number): Promise<{lat: number, lon: number, name: string} | null> {
  const query = `
    [out:json][timeout:5];
    (
      node["place"~"village|town|suburb"](around:5000, ${lat}, ${lon});
      node["tourism"](around:5000, ${lat}, ${lon});
      node["historic"](around:5000, ${lat}, ${lon});
      node["leisure"~"park|nature_reserve"](around:5000, ${lat}, ${lon});
    );
    out center 1;
  `;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
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
      const element = data.elements?.[0];
      if (element) {
        return {
          lat: element.lat || element.center?.lat,
          lon: element.lon || element.center?.lon,
          name: element.tags?.name || element.tags?.tourism || element.tags?.historic || "Zajímavé místo"
        };
      }
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("[BIKE GENERATOR] Overpass snap selhal nebo vypršel čas.");
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

  emit?.("AI navrhuje trasu a průjezdní body...");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const systemPrompt = `Jsi expert na cyklistiku na jižní Moravě a plánovač tras. 
Uživatel požaduje cyklotrasu o délce ${finalDistance} km a obtížnosti ${diffLabel}. Tvá úloha je vygenerovat průjezdní body (waypoints) tak, aby po jejich spojení do okruhu (start -> body -> cíl) trasa měřila přibližně tuto vzdálenost.

Pravidla pro výpočet:
- Představ si kružnici kolem startu. Průjezdní body musí ležet na obvodu této kružnice, kde poloměr je zhruba ${finalDistance} / 3 km.
- Vygeneruj 3 až 5 bodů tak, aby tvořily logický okruh (např. postupně ve směru hodinových ručiček).
- ZAKÁZÁNO: Body nesmí ležet těsně vedle sebe! Musí být rovnoměrně rozprostřeny po trase.
- ZAKÁZÁNO: Negeneruj body uvnitř uzavřených pěších zón, placených areálů nebo v Zoo Vyškov! Vybírej reálné cyklistické cíle (sousední vesnice, lesní cesty, přírodní památky, rozcestí) v okolí do vzdálenosti dané poloměrem.
- Start a cíl je na souřadnicích 49.2844189N, 16.9890503E. Tyto body do výstupu nepiš, vrať POUZE průjezdní body v poli "waypoints".

VÝSTUP MUSÍ BÝT JSON OBJEKT:
{
  "title": "Stručný název (max 5 slov)",
  "description": "Motivační popis trasy (2-3 věty). ${diffHint}",
  "waypoints": [
    {"lon": 16.123, "lat": 49.123, "name": "Název místa 1"},
    ...
  ]
}

DŮLEŽITÉ: Vrať POUZE validní JSON bez markdownu.`;

  const result = await model.generateContent(systemPrompt);
  const responseText = result.response.text();
  const bikeData = JSON.parse(responseText.replace(/```json|```/g, "").trim());

  // HYBRIDNÍ MODEL: Přitažení bodů z Gemini k realitě přes Overpass
  const geminiWaypoints = bikeData.waypoints || [];
  const snappedWaypoints: any[] = [];
  
  for (const wp of geminiWaypoints) {
    emit?.(`Hledám reálné místo: ${wp.name}...`);
    const snapped = await snapToRealPlace(wp.lat, wp.lon);
    
    // Nový bod - buď reálně přitažený z Overpass, nebo fallback na původní bod
    const candidate = snapped
      ? { ...wp, lat: snapped.lat, lon: snapped.lon, name: snapped.name }
      : wp;

    // Pokud už pole snappedWaypoints něco obsahuje, porovnej lat a lon posledního bodu s kandidátem
    if (snappedWaypoints.length > 0) {
      const last = snappedWaypoints[snappedWaypoints.length - 1];
      if (last.lat === candidate.lat && last.lon === candidate.lon) {
        continue; // Duplicitní souřadnice po sobě jdoucích bodů by crashly Mapy.cz
      }
    }

    snappedWaypoints.push(candidate);
  }

  // Příprava souřadnic pro ORS: Start -> Snapped Waypoints -> Cíl
  const coords = [HOME_COORDS, ...snappedWaypoints.map((p: any) => [p.lon, p.lat]), HOME_COORDS];

  emit?.("Ověřuji trasu přes OpenRouteService...");
  const diffConfig = DIFFICULTY_MAP[finalDifficulty];
  let distanceText = "";
  let elevationText = "";
  let durationText = "";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

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

    if (orsResponse.ok) {
      const orsData = await orsResponse.json();
      const summary = orsData.features?.[0]?.properties?.summary;
      if (summary) {
        actualDistanceNum = summary.distance ? Math.round(summary.distance / 100) / 10 : 0;
        distanceText = `${actualDistanceNum} km`;
        elevationText = summary.ascent ? `${Math.round(summary.ascent)} m` : "N/A";
        const hrs = Math.floor(summary.duration / 3600);
        const mins = Math.floor((summary.duration % 3600) / 60);
        durationText = hrs > 0 ? `${hrs}:${mins.toString().padStart(2, "0")} h` : `${mins} min`;
      }
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("[BIKE GENERATOR] ORS selhalo, používám odhad.");
  }

  // Sestavení Mapy.cz URL (použijeme snappedWaypoints pro reálné cíle)
  const wpParam = snappedWaypoints.map((p: any) => `${p.lon},${p.lat}`).join(";");
  const routeType = finalDifficulty === "easy" ? "bike_road" : "bike_mountain";
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
