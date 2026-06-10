import fetch from 'node-fetch';

async function test() {
  const lat = 49.3808;
  const lon = 17.0683;
  const query = `
    [out:json][timeout:5];
    (
      way["highway"~"cycleway|path|track|residential|tertiary|secondary"](around:2000, ${lat}, ${lon});
      node["place"~"village|suburb"](around:2000, ${lat}, ${lon});
      node["tourism"~"viewpoint|picnic_site|information"](around:2000, ${lat}, ${lon});
    );
    out center 1;
  `;

  console.log("Posílám dotaz do Overpass...");
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Vikendovnik-App (zefram.net@gmail.com)"
    },
    body: "data=" + encodeURIComponent(query)
  });

  if (response.ok) {
    const data = await response.json();
    console.log("Výsledek:", JSON.stringify(data, null, 2));
  } else {
    console.log("Chyba:", response.status, response.statusText);
    console.log(await response.text());
  }
}

test().catch(console.error);
