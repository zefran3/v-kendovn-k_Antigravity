const HOME_LON = 16.9890503;
const HOME_LAT = 49.2844189;

interface RawWaypoint {
  name: string;
  lat: number;
  lon: number;
  description: string;
}

const rawWaypoints: RawWaypoint[] = [
  { name: "Drnovice", lat: 49.3005, lon: 17.0271, description: "obec s leteckým muzeem a zámkem" },
  { name: "Pustiměř", lat: 49.3182, lon: 17.0463, description: "obec s rotundou sv. Pantaleona" },
  { name: "Luleč", lat: 49.2558, lon: 16.9238, description: "přírodní koupaliště U Libuše, kostel sv. Martina" },
  { name: "Rostěnice", lat: 49.2482, lon: 16.9749, description: "obec s dochovanou lidovou architekturou" },
  { name: "Křižanovice u Vyškova", lat: 49.2652, lon: 17.0441, description: "obec na úpatí Litenčické pahorkatiny" },
  { name: "Topolany", lat: 49.2885, lon: 17.0315, description: "obec na řece Hané" },
  { name: "Lhota", lat: 49.3023, lon: 16.9602, description: "obec u lesů Vojenského újezdu" },
  { name: "Hamiltony", lat: 49.3059, lon: 16.9698, description: "předměstí Vyškova u lesa" },
  { name: "Radslavice", lat: 49.3242, lon: 17.0090, description: "obec pod Zelenou horou" },
  { name: "Zelená Hora", lat: 49.3278, lon: 17.0242, description: "obec na kopci s dalekým výhledem" },
  { name: "Podivice", lat: 49.3789, lon: 17.0286, description: "lesní obec hluboko v Drahanské vrchovině" },
  { name: "Ježkovice", lat: 49.3045, lon: 16.8833, description: "obec blízko Pístovického rybníka" },
  { name: "Pístovice", lat: 49.2760, lon: 16.8660, description: "rekreační oblast s Pístovickým rybníkem" },
  { name: "Račice", lat: 49.2765, lon: 16.8875, description: "obec se zámkem Račice" },
  { name: "Nemojany", lat: 49.2520, lon: 16.9189, description: "obec s Nemojanským mlýnem a rybníkem" },
  { name: "Tučapy", lat: 49.2415, lon: 16.9038, description: "obec s kaplí sv. Floriána" },
  { name: "Komořany", lat: 49.2198, lon: 16.9183, description: "obec na úpatí kopečků" },
  { name: "Rousínov", lat: 49.2045, lon: 16.8778, description: "město známé výrobou nábytku" },
  { name: "Habrovany", lat: 49.2310, lon: 16.8790, description: "obec se zámkem a zámeckým parkem" },
  { name: "Olšany", lat: 49.2472, lon: 16.8576, description: "Farma Bolka Polívky, lesní okolí" },
  { name: "Lysovice", lat: 49.2152, lon: 16.9942, description: "památková zóna s doškovými domy" },
  { name: "Kučerov", lat: 49.2062, lon: 17.0035, description: "obec s lidovým domem a muzeem" },
  { name: "Hlubočany", lat: 49.2215, lon: 16.9790, description: "obec v údolí Hlubočanského potoka" },
  { name: "Bohdalice", lat: 49.1996, lon: 17.0317, description: "obec se zámkem a parkem" },
  { name: "Kozlany", lat: 49.1915, lon: 17.0422, description: "obec s vodní nádrží Kozlany" },
  { name: "Bučovice", lat: 49.1485, lon: 17.0022, description: "město s unikátním renesančním zámkem" },
  { name: "Letonice", lat: 49.1678, lon: 16.9610, description: "obec s barokním kostelem sv. Mikuláše" },
  { name: "Dražovice", lat: 49.1865, lon: 16.9535, description: "obec s kaplí sv. Václava" },
  { name: "Slavkov u Brna", lat: 49.1542, lon: 16.8767, description: "barokní zámek Slavkov, bojiště bitvy u Austerlitz" },
  { name: "Kovalovice", lat: 49.2268, lon: 16.8295, description: "přírodní biotop Kovalovice" },
  { name: "Viničné Šumice", lat: 49.2178, lon: 16.8190, description: "vinařská obec pod kopci" },
  { name: "Krásensko", lat: 49.3495, lon: 16.8542, description: "obec na náhorní plošině Drahanské vrchoviny" },
  { name: "Studnice", lat: 49.3768, lon: 16.8805, description: "nejvýše položená obec Vyškovska (570 m)" },
  { name: "Jedovnice", lat: 49.3425, lon: 16.7602, description: "rybník Olšovec, singletracky Jedovnice" },
  { name: "Křtiny", lat: 49.2965, lon: 16.7432, description: "barokní chrám Jména Panny Marie" },
  { name: "Bukovinka", lat: 49.2882, lon: 16.8165, description: "lesní obec v Drahanské vrchovině" },
  { name: "Ruprechtov", lat: 49.3175, lon: 16.8488, description: "větrný mlýn halladayova typu, Ruprechtovský rybník" },
  { name: "Rychtářov", lat: 49.3242, lon: 16.9288, description: "vstupní brána do Vojenského újezdu Březina" },
  { name: "Opatovice", lat: 49.3235, lon: 16.9698, description: "obec u Opatovické přehrady" },
  { name: "Dědice", lat: 49.2985, lon: 16.9745, description: "předměstí Vyškova s kostelem Nejsvětější Trojice" }
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

function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  let brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

const computed = rawWaypoints.map(wp => {
  const dist = Math.round(getDistance(HOME_LAT, HOME_LON, wp.lat, wp.lon) * 10) / 10;
  const bearing = Math.round(getBearing(HOME_LAT, HOME_LON, wp.lat, wp.lon));
  return {
    name: wp.name,
    lat: wp.lat,
    lon: wp.lon,
    distanceKm: dist,
    bearing: bearing,
    description: wp.description
  };
});

computed.sort((a, b) => a.bearing - b.bearing);

console.log(JSON.stringify(computed, null, 2));
