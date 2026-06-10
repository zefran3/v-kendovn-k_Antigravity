import fetch from 'node-fetch';

const points = [
  { lat: 49.3789, lon: 16.9427, name: "Jedovnice" },
  { lat: 49.3808, lon: 17.0683, name: "Krásensko" },
  { lat: 49.3081, lon: 17.1352, name: "Dědice" },
  { lat: 49.2069, lon: 17.0694, name: "Račice" }
];

async function snap(lat, lon) {
  const query = `
    [out:json][timeout:5];
    (
      way["highway"~"cycleway|path|track|residential|tertiary|secondary"](around:2000, ${lat}, ${lon});
      node["place"~"village|suburb"](around:2000, ${lat}, ${lon});
      node["tourism"~"viewpoint|picnic_site|information"](around:2000, ${lat}, ${lon});
    );
    out center 1;
  `;

  const start = Date.now();
  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Vikendovnik-App (zefram.net@gmail.com)"
      },
      body: "data=" + encodeURIComponent(query)
    });
    const duration = Date.now() - start;
    if (response.ok) {
      const data = await response.json();
      return { success: true, duration, elements: data.elements };
    } else {
      return { success: false, duration, status: response.status, text: await response.text() };
    }
  } catch (err) {
    return { success: false, duration: Date.now() - start, error: err.message };
  }
}

async function run() {
  for (const pt of points) {
    console.log(`Testuji bod: ${pt.name} (${pt.lat}, ${pt.lon})...`);
    const res = await snap(pt.lat, pt.lon);
    console.log(`Výsledek pro ${pt.name}:`, JSON.stringify(res, null, 2));
    console.log("---------------------------------------");
  }
}

run().catch(console.error);
