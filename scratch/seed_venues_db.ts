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

const db = admin.firestore();

async function run() {
  const appPath = path.join(process.cwd(), 'src', 'App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf-8');

  // Extract the DEFAULT_SPORTS_VENUES array text
  const startMarker = '  const DEFAULT_SPORTS_VENUES: Omit<SportsVenue, "createdAt">[] = [';
  const startIndex = appContent.indexOf(startMarker);
  if (startIndex === -1) {
    throw new Error('DEFAULT_SPORTS_VENUES not found in App.tsx');
  }

  // Find the end marker or closing bracket
  const remaining = appContent.substring(startIndex + startMarker.length);
  const endMarker = '  const handleSeedSportsVenues = async () => {';
  const endMarkerIndex = remaining.indexOf(endMarker);
  if (endMarkerIndex === -1) {
    throw new Error('handleSeedSportsVenues marker not found');
  }
  const arrayTextOnly = remaining.substring(0, remaining.lastIndexOf('];', endMarkerIndex) + 2);

  // We can write it as an ES module exporting default
  const cleanJsText = `
    const venues = [
      ${arrayTextOnly}
    export default venues;
  `;
  
  const tempFile = path.join(process.cwd(), 'scratch', `temp_venues_${Date.now()}.js`);
  fs.writeFileSync(tempFile, cleanJsText, 'utf-8');
  
  // Dynamically import the ES module
  // Using file URL format for import in Windows
  const fileUrl = `file://${tempFile.replace(/\\/g, '/')}`;
  const module = await import(fileUrl);
  const defaultVenues = module.default;
  
  // Clean up
  fs.unlinkSync(tempFile);

  console.log(`Loaded ${defaultVenues.length} default venues from App.tsx`);

  // Clear existing venues
  const snapshot = await db.collection('sports_venues').get();
  const batchDelete = db.batch();
  snapshot.docs.forEach(doc => {
    batchDelete.delete(doc.ref);
  });
  await batchDelete.commit();
  console.log(`Deleted ${snapshot.size} existing venues from Firestore.`);

  // Write new venues
  const batchWrite = db.batch();
  const sportsRef = db.collection('sports_venues');
  defaultVenues.forEach((venue: any) => {
    const docRef = sportsRef.doc();
    batchWrite.set(docRef, {
      ...venue,
      createdAt: Date.now()
    });
  });
  await batchWrite.commit();
  console.log(`Successfully seeded ${defaultVenues.length} venues into Firestore.`);
}

run().catch(console.error).finally(() => process.exit(0));
