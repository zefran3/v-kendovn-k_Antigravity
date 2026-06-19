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
  const snapshot = await db.collection('inspirations').get();
  console.log(`Total inspirations: ${snapshot.size}`);
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`- ID: ${doc.id}`);
    console.log(`  Title: ${data.title}`);
    console.log(`  Location: ${data.location}`);
    console.log(`  URL: ${data.url}`);
    console.log(`  Cinema listings: ${JSON.stringify(data.cinema_listings)}`);
  });
}

run().catch(console.error).finally(() => process.exit(0));
