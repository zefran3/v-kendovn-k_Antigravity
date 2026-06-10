import fetch from 'node-fetch';

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

// Přesné souřadnice z testu 610
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
    way["highway"~"cycleway|path|track|residential|tertiary|secondary"](around:1200, ${wp.lat}, ${wp.lon});
    node["place"~"village|suburb"](around:1200, ${wp.lat}, ${wp.lon});
    node["tourism"~"viewpoint|picnic_site|information"](around:1200, ${wp.lat}, ${wp.lon});
  `).join("\n");

  const query = `
    [out:json][timeout:8];
    (
      ${aroundStatements}
    );
    out center;
  `;

  console.log("Generovaný Overpass dotaz:\n", query);

  for (const endpoint of OVERPASS_ENDPOINTS) {
    console.log(`Zkouším endpoint: ${endpoint}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
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

      console.log(`Response status od ${endpoint}:`, response.status);
      if (response.ok) {
        const data = await response.json();
        console.log(`Úspěch! Počet elementů:`, data.elements?.length || 0);
        return data.elements;
      } else {
        console.log("Raw error response:", await response.text());
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`Endpoint ${endpoint} selhal s chybou: ${err.message}`);
    }
  }
  return null;
}

async function run() {
  const elements = await snapMultipleWaypoints(points);
  if (!elements) {
    console.log("SNAP SELHAL: Vráceno null z snapMultipleWaypoints.");
    return;
  }

  console.log("Procházím body a zkouším snapovat...");
  for (const wp of points) {
    let bestDist = Infinity;
    let bestElem = null;

    for (const elem of elements) {
      const eLat = elem.lat || elem.center?.lat;
      const eLon = elem.lon || elem.center?.lon;
      if (eLat === undefined || eLon === undefined) continue;

      const dist = getDistance(wp.lat, wp.lon, eLat, eLon);
      if (dist < bestDist) {
        bestDist = dist;
        bestElem = elem;
      }
    }

    if (bestElem && bestDist <= 1200) {
      const eLat = bestElem.lat || bestElem.center?.lat;
      const eLon = bestElem.lon || bestElem.center?.lon;
      const name = bestElem.tags?.name || bestElem.tags?.tourism || bestElem.tags?.historic || wp.name;
      console.log(`BOD ${wp.name}: Snapnut na "${name}" (${eLat}, ${eLon}) ve vzdálenosti ${Math.round(bestDist)}m`);
    } else {
      console.log(`BOD ${wp.name}: Selhal snap, fallback na původní (${wp.lat}, ${wp.lon})`);
    }
  }
}

run().catch(console.error);
