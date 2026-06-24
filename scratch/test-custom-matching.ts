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

const normalizeStr = (str: string) =>
  str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, "") // remove special chars and spaces
    .trim();

async function run() {
  const db = admin.firestore();
  
  console.log("1. Adding 'Klub Kotelna Vyškov' to known_locations...");
  const docRef = await db.collection('known_locations').add({
    name: "Klub Kotelna Vyškov",
    keywords: ["kotelna", "klub kotelna"],
    exactLocation: "Brněnská 12, Vyškov",
    exactUrl: "https://www.kotelna.cz",
    isVyskov: true
  });
  console.log(`Location added with ID: ${docRef.id}`);

  console.log("2. Fetching all known locations...");
  const snapshot = await db.collection('known_locations').get();
  const knownLocations: any[] = [];
  snapshot.forEach(doc => {
    knownLocations.push({ id: doc.id, ...doc.data() });
  });
  console.log(`Loaded ${knownLocations.length} locations.`);

  console.log("3. Simulating AI suggested tip matching...");
  const testSuggestions = [
    {
      title: "Parádní rockový koncert v Klubu Kotelna!",
      location: "Vyškov, Kotelna",
      url: "",
      is_vyskov: false
    },
    {
      title: "Výlet: Punkevní jeskyně a plavba lodí",
      location: "Vavřinec",
      url: "https://www.caves.cz",
      is_vyskov: false
    }
  ];

  const BARE_DOMAINS = [
    'https://www.kudyznudy.cz',
    'https://kudyznudy.cz',
    'https://www.jizni-morava.cz',
    'https://www.mksvyskov.cz',
    'https://mksvyskov.cz',
    'https://www.caves.cz',
    'https://caves.cz',
  ];

  const processed = testSuggestions.map((s: any) => {
    const normTitle = normalizeStr(s.title || '');
    const matchedLocation = knownLocations.find(loc => {
      const keywords = Array.isArray(loc.keywords) ? loc.keywords : [];
      return keywords.some((kw: string) => normTitle.includes(normalizeStr(kw)));
    });

    if (matchedLocation) {
      console.log(`[Test Match] Nalezena shoda pro "${s.title}" -> známé místo "${matchedLocation.name}"`);
      if (matchedLocation.exactLocation) {
        s.location = matchedLocation.exactLocation;
      }
      const isBareUrl = !s.url || s.url.trim() === '' || BARE_DOMAINS.some(domain => s.url === domain || s.url === domain + '/');
      if (matchedLocation.exactUrl && isBareUrl) {
        s.url = matchedLocation.exactUrl;
      }
      if (matchedLocation.isVyskov !== undefined) {
        s.is_vyskov = matchedLocation.isVyskov;
      }
    }
    return s;
  });

  console.log("Processed Suggestion Output:");
  console.log(JSON.stringify(processed, null, 2));

  // Assertions
  const matched1 = processed[0];
  const matched2 = processed[1];
  const success1 = matched1.location === "Brněnská 12, Vyškov" &&
                   matched1.url === "https://www.kotelna.cz" &&
                   matched1.is_vyskov === true;
  const success2 = matched2.location === "Punkevní jeskyně, Vavřinec 117, Blansko" &&
                   matched2.url === "https://punkevni.caves.cz/" &&
                   matched2.is_vyskov === false;

  if (success1 && success2) {
    console.log("✅ SUCCESS: Custom location matching works perfectly!");
  } else {
    console.error("❌ FAILURE: Custom location matching values are incorrect!");
  }

  console.log("4. Cleaning up added test location...");
  await db.collection('known_locations').doc(docRef.id).delete();
  console.log("Cleanup complete!");
}

run().catch(console.error).finally(() => process.exit(0));
