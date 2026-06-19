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
  
  console.log("=== INSPECTING INSPIRATIONS COLLECTION ===");
  const inspirationsSnapshot = await db.collection('inspirations').get();
  console.log(`Total inspirations: ${inspirationsSnapshot.size}`);
  
  const inspirations = [];
  inspirationsSnapshot.forEach(doc => {
    const data = doc.data();
    inspirations.push({
      id: doc.id,
      title: data.title,
      status: data.status,
      source: data.source,
      date: data.date,
      generatedAt: data.generatedAt ? (data.generatedAt.toDate ? data.generatedAt.toDate().toISOString() : data.generatedAt) : null,
      is_vyskov: data.is_vyskov,
      target: data.target
    });
  });
  
  console.log(JSON.stringify(inspirations, null, 2));
  
  console.log("\n=== INSPECTING LATEST 10 ADMIN LOGS ===");
  const logsSnapshot = await db.collection('admin_logs')
    .orderBy('timestamp', 'desc')
    .limit(10)
    .get();
    
  logsSnapshot.forEach(doc => {
    const data = doc.data();
    const ts = data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate().toISOString() : data.timestamp) : null;
    console.log(`[${ts}] [${data.type}] ${data.message}`);
    if (data.details) {
      console.log(`  Details:`, JSON.stringify(data.details));
    }
  });
}

run().catch(console.error).finally(() => process.exit(0));
