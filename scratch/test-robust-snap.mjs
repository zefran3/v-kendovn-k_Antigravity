import fetch from 'node-fetch';

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

const points = [
  { lat: 49.3789, lon: 16.9427, name: "Jedovnice" },
  { lat: 49.3808, lon: 17.0683, name: "Krásensko" },
  { lat: 49.3081, lon: 17.1352, name: "Dědice" },
  { lat: 49.2069, lon: 17.0694, name: "Račice" }
];

function getDistance(lat1, lon1, lat2, lon2) {
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

async function snapMultipleWaypoints(waypoints) {
  // Generování Overpass dotazu pro všechny body
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

  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    console.log(`Zkouším Overpass endpoint: ${endpoint}...`);
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

      if (response.ok) {
        const data = await response.json();
        if (data.elements && data.elements.length > 0) {
          console.log(`Úspěch s ${endpoint}. Nalezeno ${data.elements.length} elementů.`);
          return data.elements;
        }
      } else {
        console.warn(`Endpoint ${endpoint} vrátil status ${response.status}`);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`Endpoint ${endpoint} selhal: ${err.message}`);
      lastError = err;
    }
  }
  return null;
}

async function run() {
  console.log("Spouštím hromadné snapování...");
  const elements = await snapMultipleWaypoints(points);
  
  if (!elements) {
    console.error("Nepodařilo se načíst žádné elementy z Overpass.");
    return;
  }

  const snappedPoints = [];
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
      snappedPoints.push({
        name,
        lat: eLat,
        lon: eLon,
        originalName: wp.name,
        distance: Math.round(bestDist)
      });
    } else {
      snappedPoints.push({
        ...wp,
        originalName: wp.name,
        distance: null,
        fallback: true
      });
    }
  }

  console.log("Výsledky snapování:");
  console.log(JSON.stringify(snappedPoints, null, 2));
}

run().catch(console.error);
