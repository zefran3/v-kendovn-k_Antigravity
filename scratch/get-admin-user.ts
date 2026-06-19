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
  
  const snapshot = await db.collection('users').where('role', '==', 'admin').get();
  console.log(`Total admin users: ${snapshot.size}`);
  
  snapshot.forEach(doc => {
    console.log(`Admin user: ID=${doc.id}, Email=${doc.data().email}, Role=${doc.data().role}`);
  });
}

run().catch(console.error).finally(() => process.exit(0));
