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

async function run() {
  const db = admin.firestore();
  console.log("Fetching known_locations containing 'jeskyne' or 'punkevni' or 'macocha'...");
  const snapshot = await db.collection('known_locations').get();
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id}`);
    console.log(JSON.stringify(data, null, 2));
    console.log("------------------------");
  });
}

run().catch(console.error).finally(() => process.exit(0));
