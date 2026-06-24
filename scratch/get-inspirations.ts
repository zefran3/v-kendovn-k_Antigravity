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
  console.log("Fetching all inspirations from firestore...");
  const snapshot = await db.collection('inspirations').get();
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`Title: ${data.title}`);
    console.log(`URL: ${data.url}`);
    console.log(`Location: ${data.location}`);
    console.log("------------------------");
  });
}

run().catch(console.error).finally(() => process.exit(0));
