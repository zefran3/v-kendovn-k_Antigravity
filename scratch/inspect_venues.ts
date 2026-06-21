import admin from "firebase-admin";
import fs from "fs";
import path from "path";

const serviceAccountPath = path.join(process.cwd(), 'vikendovnik-firebase-adminsdk-fbsvc-62ecb71cd3.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

async function run() {
  const db = admin.firestore();
  const snapshot = await db.collection('sports_venues').get();
  console.log(`Total venues in database: ${snapshot.size}`);
  
  const types: Record<string, number> = {};
  const sampleVenues: string[] = [];
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const type = data.type || 'unknown';
    types[type] = (types[type] || 0) + 1;
    sampleVenues.push(`${data.name} (${data.type}) in ${data.location}`);
  });
  
  console.log("Types breakdown:", types);
  console.log("First 10 venues in database:");
  sampleVenues.slice(0, 10).forEach(v => console.log(` - ${v}`));
  
  console.log("Olomouc venues count:", sampleVenues.filter(v => v.toLowerCase().includes("olomouc")).length);
  console.log("Zlín venues count:", sampleVenues.filter(v => v.toLowerCase().includes("zlín") || v.toLowerCase().includes("zlin")).length);
}

run().catch(console.error).finally(() => process.exit(0));
