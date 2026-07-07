import fetch from "node-fetch";

const BBOX = "49.08,16.68,49.48,17.28";

async function geocodeWithNameBbox(name: string): Promise<{ lat: number; lon: number } | null> {
  const query = `
    [out:json][timeout:5];
    (
      node["name"~"${name}",i](${BBOX});
      way["name"~"${name}",i](${BBOX});
      relation["name"~"${name}",i](${BBOX});
    );
    out center;
  `;
  
  const url = "https://overpass-api.de/api/interpreter";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Vikendovnik-App-Test"
      },
      body: "data=" + encodeURIComponent(query)
    });
    
    if (!res.ok) return null;
    const data: any = await res.json();
    const elem = data.elements?.[0];
    if (elem) {
      const lat = elem.lat ?? elem.center?.lat;
      const lon = elem.lon ?? elem.center?.lon;
      return { lat, lon };
    }
  } catch (err) {
    console.error("Geocoding query failed:", err);
  }
  return null;
}

async function test() {
  const testNames = ["Chocholík", "Pístovický rybník", "Rousínovec", "Letecké muzeum"];
  for (const name of testNames) {
    console.log(`Geocoding "${name}"...`);
    const start = Date.now();
    const coords = await geocodeWithNameBbox(name);
    console.log(`Result for "${name}":`, coords, `(took ${Date.now() - start}ms)`);
  }
}

test();
