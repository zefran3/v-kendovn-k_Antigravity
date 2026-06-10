import fetch from 'node-fetch';

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

// Použijeme body z testu 610
const points = [
  { lat: 49.2558, lon: 16.9734, name: "Hostěnice" },
  { lat: 49.2891, lon: 16.9312, name: "Pístovice" },
  { lat: 49.3142, lon: 16.9795, name: "Račice" },
  { lat: 49.2985, lon: 17.0256, name: "Drnovice" }
];

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function snapMultipleWaypoints(waypoints) {
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

  const query = `
    [out:json][timeout:10];
    (
      ${aroundStatements}
    );
    out center;
  `;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    console.log(`Zkouším endpoint: ${endpoint}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
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
        return data.elements;
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`Endpoint ${endpoint} selhal: ${err.message}`);
    }
  }
  return null;
}

async function run() {
  console.log("Stahuji data z Overpass...");
  const elements = await snapMultipleWaypoints(points);
  if (!elements) {
    console.error("Snapování selhalo.");
    return;
  }

  console.log(`Staženo ${elements.length} elementů. Spouštím prioritní snapování...`);
  
  for (const wp of points) {
    // Rozdělíme elementy v okruhu 1200m do 3 prioritních kategorií
    const catA = []; // Atrakce, jídlo, příroda, památky
    const catB = []; // Obce
    const catC = []; // Cesty

    for (const elem of elements) {
      const eLat = elem.lat || elem.center?.lat;
      const eLon = elem.lon || elem.center?.lon;
      if (eLat === undefined || eLon === undefined) continue;

      const dist = getDistance(wp.lat, wp.lon, eLat, eLon);
      if (dist > 1200) continue;

      const tags = elem.tags || {};
      const hasAttr = tags.tourism || tags.historic || tags.natural || tags.amenity;
      const isPlace = tags.place;
      const isRoad  = tags.highway;

      const item = { elem, dist, lat: eLat, lon: eLon };

      if (hasAttr) {
        catA.push(item);
      } else if (isPlace) {
        catB.push(item);
      } else if (isRoad) {
        catC.push(item);
      }
    }

    // Najdeme nejlepší prvek podle priorit
    let best = null;
    let selectedCat = "";

    if (catA.length > 0) {
      catA.sort((a, b) => a.dist - b.dist);
      best = catA[0];
      selectedCat = "A (Atrakce)";
    } else if (catB.length > 0) {
      catB.sort((a, b) => a.dist - b.dist);
      best = catB[0];
      selectedCat = "B (Obec)";
    } else if (catC.length > 0) {
      catC.sort((a, b) => a.dist - b.dist);
      best = catC[0];
      selectedCat = "C (Cesta)";
    }

    if (best) {
      const elem = best.elem;
      const name = elem.tags?.name || elem.tags?.tourism || elem.tags?.historic || wp.name;
      console.log(`BOD ${wp.name}: Snapnut na "${name}" (${best.lat}, ${best.lon}) ve vzdálenosti ${Math.round(best.dist)}m přes Kategorii ${selectedCat}`);
    } else {
      console.log(`BOD ${wp.name}: Selhal snap, fallback na původní (${wp.lat}, ${wp.lon})`);
    }
  }
}

run().catch(console.error);
