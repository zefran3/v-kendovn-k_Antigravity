import fetch from "node-fetch";

// Coords of Vyškov
const HOME_LAT = 49.2844189;
const HOME_LON = 16.9890503;

// Import database content statically to verify
const WAYPOINTS_DB = [
  { name: "Podivice", lat: 49.3789, lon: 17.0286 },
  { name: "Radslavice", lat: 49.3242, lon: 17.0090 },
  { name: "Zelená Hora", lat: 49.3278, lon: 17.0242 },
  { name: "Pustiměř", lat: 49.3182, lon: 17.0463 },
  { name: "Drnovice", lat: 49.3005, lon: 17.0271 },
  { name: "Topolany", lat: 49.2885, lon: 17.0315 },
  { name: "Křižanovice u Vyškova", lat: 49.2652, lon: 17.0441 },
  { name: "Kozlany", lat: 49.1915, lon: 17.0422 },
  { name: "Bohdalice", lat: 49.1996, lon: 17.0317 },
  { name: "Kučerov", lat: 49.2062, lon: 17.0035 },
  { name: "Bučovice", lat: 49.1485, lon: 17.0022 },
  { name: "Lysovice", lat: 49.2152, lon: 16.9942 },
  { name: "Hlubočany", lat: 49.2215, lon: 16.9790 },
  { name: "Letonice", lat: 49.1678, lon: 16.9610 },
  { name: "Dražovice", lat: 49.1865, lon: 16.9535 },
  { name: "Rostěnice", lat: 49.2482, lon: 16.9749 },
  { name: "Slavkov u Brna", lat: 49.1542, lon: 16.8767 },
  { name: "Komořany", lat: 49.2198, lon: 16.9183 },
  { name: "Rousínov", lat: 49.2045, lon: 16.8778 },
  { name: "Tučapy", lat: 49.2415, lon: 16.9038 },
  { name: "Habrovany", lat: 49.2310, lon: 16.8790 },
  { name: "Nemojany", lat: 49.2520, lon: 16.9189 },
  { name: "Luleč", lat: 49.2558, lon: 16.9238 },
  { name: "Viničné Šumice", lat: 49.2178, lon: 16.8190 },
  { name: "Kovalovice", lat: 49.2268, lon: 16.8295 },
  { name: "Olšany", lat: 49.2472, lon: 16.8576 },
  { name: "Račice", lat: 49.2765, lon: 16.8875 },
  { name: "Pístovice", lat: 49.2760, lon: 16.8660 },
  { name: "Bukovinka", lat: 49.2882, lon: 16.8165 },
  { name: "Křtiny", lat: 49.2965, lon: 16.7432 },
  { name: "Ježkovice", lat: 49.3045, lon: 16.8833 },
  { name: "Ruprechtov", lat: 49.3175, lon: 16.8488 },
  { name: "Jedovnice", lat: 49.3425, lon: 16.7602 },
  { name: "Krásensko", lat: 49.3495, lon: 16.8542 },
  { name: "Lhota", lat: 49.3023, lon: 16.9602 },
  { name: "Rychtářov", lat: 49.3242, lon: 16.9288 },
  { name: "Studnice", lat: 49.3768, lon: 16.8805 },
  { name: "Dědice", lat: 49.2985, lon: 16.9745 },
  { name: "Hamiltony", lat: 49.3059, lon: 16.9698 },
  { name: "Opatovice", lat: 49.3235, lon: 16.9698 },
  { name: "Rozhledna Chocholík", lat: 49.3088, lon: 17.0163 },
  { name: "Pístovický rybník", lat: 49.2760, lon: 16.8660 },
  { name: "Ruprechtovský rybník", lat: 49.3170, lon: 16.8485 },
  { name: "Větrný mlýn Ruprechtov", lat: 49.3175, lon: 16.8488 },
  { name: "Zámek Račice", lat: 49.2765, lon: 16.8875 },
  { name: "Přírodní park Rakovec", lat: 49.3420, lon: 16.8550 },
  { name: "Biotop Kovalovice", lat: 49.2268, lon: 16.8295 },
  { name: "Farma Bolka Polívky", lat: 49.2472, lon: 16.8576 },
  { name: "Zoosko Vyškov", lat: 49.2750, lon: 16.9960 },
  { name: "Zámek Bučovice", lat: 49.1485, lon: 17.0022 },
  { name: "Zámek Slavkov", lat: 49.1542, lon: 16.8767 },
  { name: "Barokní chrám Křtiny", lat: 49.2965, lon: 16.7432 },
  { name: "Zřícenina hradu Melice", lat: 49.3242, lon: 16.9658 },
  { name: "Zřícenina hradu Kuchlov", lat: 49.3510, lon: 16.8890 },
  { name: "Opatovická přehrada", lat: 49.3235, lon: 16.9698 },
  { name: "Vodní nádrž Kozlany", lat: 49.1915, lon: 17.0422 },
  { name: "Letecké muzeum Vyškov", lat: 49.2680, lon: 16.9840 },
  { name: "Rybník Kačenec", lat: 49.2505, lon: 16.9205 },
  { name: "Rybník Olšovec", lat: 49.3425, lon: 16.7602 },
  { name: "Jeskyně Výpustek", lat: 49.2905, lon: 16.7235 },
  { name: "Arboretum Křtiny", lat: 49.3175, lon: 16.7455 },
  { name: "Rakovecké údolí", lat: 49.3005, lon: 16.8480 },
  { name: "Údolí Malé Hané", lat: 49.3150, lon: 16.9388 },
  { name: "Kačenec Luleč", lat: 49.2505, lon: 16.9205 },
  { name: "Singletrail Jedovnice", lat: 49.3448, lon: 16.7582 }
];

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function verifyAll() {
  console.log("Starting coordinate verification from Nominatim...");
  
  for (const wp of WAYPOINTS_DB) {
    let query = wp.name;
    // Add context to search query if it is a village or generic name
    if (
      !wp.name.includes("Vyškov") && 
      !wp.name.includes("Křtiny") && 
      !wp.name.includes("Jedovnice") && 
      !wp.name.includes("Bučovice") && 
      !wp.name.includes("Slavkov")
    ) {
      query += ", okres Vyškov";
    }
    query += ", Česko";

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Vikendovnik-Coordinate-Verifier (zefram.net@gmail.com)"
        }
      });
      
      if (!res.ok) {
        console.warn(`[WARN] HTTP error for ${wp.name}: ${res.status}`);
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      
      const data: any = await res.json();
      const match = data[0];
      
      if (match) {
        const realLat = parseFloat(match.lat);
        const realLon = parseFloat(match.lon);
        const diffKm = getDistance(wp.lat, wp.lon, realLat, realLon);
        
        if (diffKm > 1.2) {
          console.log(`❌ ERROR IN DB: "${wp.name}" is geocoded ${diffKm.toFixed(1)} km away!`);
          console.log(`   DB coordinates: ${wp.lat}, ${wp.lon}`);
          console.log(`   Real OSM coordinates: ${realLat}, ${realLon}`);
          console.log(`   Nominatim display name: ${match.display_name}`);
        } else {
          console.log(`✅ OK: "${wp.name}" (${diffKm.toFixed(2)} km diff)`);
        }
      } else {
        console.log(`❓ UNRESOLVED: Could not find Nominatim match for "${wp.name}" (query: "${query}")`);
      }
      
    } catch (err: any) {
      console.error(`Query failed for ${wp.name}:`, err.message);
    }
    
    // Respect Nominatim usage policy (1 request per second max)
    await new Promise(r => setTimeout(r, 1200));
  }
  
  console.log("Verification finished.");
}

verifyAll();
