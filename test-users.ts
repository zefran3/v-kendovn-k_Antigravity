import admin from "firebase-admin";
import fs from "fs";
import path from "path";

const serviceAccountPath = path.join(process.cwd(), 'vikendovnik-firebase-adminsdk-fbsvc-62ecb71cd3.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function run() {
  const db = admin.firestore();
  const usersSnapshot = await db.collection('users').get();
  usersSnapshot.forEach(doc => {
    console.log(doc.id, doc.data());
  });
}

run().catch(console.error).finally(() => process.exit(0));
