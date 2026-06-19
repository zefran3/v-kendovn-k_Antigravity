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
  const snapshot = await db.collection('admin_logs').orderBy('timestamp', 'desc').limit(10).get();
  console.log(`Total admin logs: ${snapshot.size}`);
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`- ID: ${doc.id} | Level: ${data.level} | Message: ${data.message} | Timestamp: ${data.timestamp?.toDate()}`);
    if (data.details) {
      console.log(`  Details: ${JSON.stringify(data.details, null, 2)}`);
    }
  });
}

run().catch(console.error).finally(() => process.exit(0));
