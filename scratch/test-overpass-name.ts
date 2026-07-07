import fetch from "node-fetch"; // or standard fetch if using Node 18+

const HOME_LAT = 49.2844189;
const HOME_LON = 16.9890503;

async function geocodeWithName(name: string): Promise<{ lat: number; lon: number } | null> {
  const query = `
    [out:json][timeout:5];
    (
      node["name"~"${name}",i](around:25000, ${HOME_LAT}, ${HOME_LON});
      way["name"~"${name}",i](around:25000, ${HOME_LAT}, ${HOME_LON});
      relation["name"~"${name}",i](around:25000, ${HOME_LAT}, ${HOME_LON});
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
    const coords = await geocodeWithName(name);
    console.log(`Result for "${name}":`, coords);
  }
}

test();
