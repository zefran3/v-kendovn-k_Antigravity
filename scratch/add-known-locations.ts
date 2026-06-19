import admin from "firebase-admin";
import fs from "fs";
import path from "path";

const serviceAccountPath = path.join(process.cwd(), 'vikendovnik-firebase-adminsdk-fbsvc-62ecb71cd3.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const locationsToAdd = [
  {
    name: "Letecké muzeum Vyškov",
    keywords: ["letecke muzeum vyskov", "letecke muzeum ve vyskove", "muzeum letecke a pozemni techniky", "letecke muzeum"],
    exactLocation: "Letecké muzeum Vyškov, Letiště Vyškov, Vyškov",
    exactUrl: "http://www.lhs-vyskov.cz",
    isVyskov: true
  },
  {
    name: "Tron Laser Aréna Brno",
    keywords: ["laser game brno", "tron laser arena", "laser game v brne", "laser game"],
    exactLocation: "Tron Laser Aréna, Brno",
    exactUrl: "https://www.tronlaserarena.cz",
    isVyskov: false
  },
  {
    name: "ZOO Brno",
    keywords: ["zoo brno", "brnenska zoo"],
    exactLocation: "ZOO Brno, U Zoologické zahrady 46, Brno-Bystrc",
    exactUrl: "https://www.zoobrno.cz",
    isVyskov: false
  },
  {
    name: "Vědecké centrum VIDA! Brno",
    keywords: ["vida brno", "vida science centrum", "vedecke centrum vida", "vida!"],
    exactLocation: "VIDA! science centrum, Křížkovského 554/55, Brno",
    exactUrl: "https://vida.cz",
    isVyskov: false
  }
];

async function run() {
  const db = admin.firestore();
  
  for (const loc of locationsToAdd) {
    // Zkontrolujeme, zda už neexistuje stejný název
    const existing = await db.collection('known_locations').where('name', '==', loc.name).get();
    if (existing.size > 0) {
      console.log(`Location "${loc.name}" already exists. Skipping.`);
    } else {
      await db.collection('known_locations').add(loc);
      console.log(`Added location: ${loc.name}`);
    }
  }
}

run().catch(console.error).finally(() => process.exit(0));
