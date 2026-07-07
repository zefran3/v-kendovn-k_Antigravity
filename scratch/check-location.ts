import fetch from "node-fetch";

async function checkCoords(lat: number, lon: number, label: string) {
  const query = `
    [out:json][timeout:5];
    node(around:500, ${lat}, ${lon});
    out center;
  `;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Vikendovnik-Checking"
      },
      body: "data=" + encodeURIComponent(query)
    });
    if (!res.ok) {
      console.log(`Failed to query ${label}`);
      return;
    }
    const data: any = await res.json();
    console.log(`\n=== Features around ${label} (${lat}, ${lon}) ===`);
    const elements = data.elements || [];
    for (const el of elements.slice(0, 10)) {
      console.log(`- ${el.tags?.name || "Unnamed"} (${el.tags?.place || el.tags?.highway || el.tags?.tourism || el.tags?.historic || "other"})`);
    }
  } catch (err) {
    console.error(err);
  }
}

async function run() {
  await checkCoords(49.3005, 17.0271, "Drnovice (in DB)");
  await checkCoords(49.3088, 17.0163, "Chocholík (in DB)");
}

run();
