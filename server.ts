import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";
import admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fetchMksVyskovProgram } from "./src/lib/cinemaScraper";
import { scrapeCineStarOlomouc } from "./src/lib/cineStarOlomouc";
import { scrapeKudyZnudy } from "./src/services/scrapers/kudyZnudy";
import { scrapeJizniMorava } from "./src/services/scrapers/jizniMorava";
import { generateBikeRoute, BikeRouteDifficulty } from "./src/lib/bikeRoutes";

dotenv.config();
console.log('[API DEBUG] Prvních 10 znaků Gemini klíče:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) : 'CHYBÍ KLÍČ!');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL}/auth/callback`
);

// Inicializace Firebase Admin pro push notifikace
try {
  const serviceAccountPath = path.join(process.cwd(), 'vikendovnik-firebase-adminsdk-fbsvc-62ecb71cd3.json');
  let serviceAccount;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else if (fs.existsSync(serviceAccountPath)) {
    serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
  }

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin initialized successfully.");

    const db = admin.firestore();
    const startTime = admin.firestore.Timestamp.now();
    const suggestionsStatusMap = new Map<string, string>();

    db.collection('suggestions').where('createdAt', '>', startTime).onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        const docId = change.doc.id;
        const newData = change.doc.data();

        if (change.type === 'added') {
          suggestionsStatusMap.set(docId, newData.status);
          if (newData.status !== 'draft') {
            sendPushNotification(newData);
          }
        } else if (change.type === 'modified') {
          const prevStatus = suggestionsStatusMap.get(docId);
          suggestionsStatusMap.set(docId, newData.status);

          // Pokud se stav dokumentu změnil z draft na cokoliv jiného, notifikaci odešli teprve teď
          if (prevStatus === 'draft' && newData.status !== 'draft') {
            sendPushNotification(newData);
          }
        }
      });
    }, (error) => {
      console.error("Firestore listen error:", error);
    });
  } else {
    console.warn("Service account key not found, push notifications won't work.");
  }
} catch (error) {
  console.error("Failed to initialize Firebase Admin", error);
}

async function sendPushNotification(newData: any) {
  console.log("[NOTIFIKACE] Pokus o odeslání. Status aktivity:", newData.status);
  if (newData.status === 'draft') return; // Neupozorňovat na soukromé návrhy
  try {
    const db = admin.firestore();
    const usersSnapshot = await db.collection('users').get();

    const tokens: string[] = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if ((userData.email === 'zefran3@gmail.com' || userData.email === 'eva.kubartova@gmail.com') && userData.fcmToken) {
        if (!tokens.includes(userData.fcmToken)) {
          tokens.push(userData.fcmToken);
        }
      }
    });

    if (tokens.length > 0) {
      const title = newData.type === 'ride' ? 'Nová žádost o odvoz 🚗' : 'Nový návrh aktivity 🎉';
      const body = `${newData.childName}: ${newData.title}`;

      const message = {
        data: {
          title: title,
          body: body
        },
        android: { priority: 'high' as const },
        webpush: { headers: { Urgency: 'high' } },
        tokens: tokens
      };

      await admin.messaging().sendEachForMulticast(message);
      console.log('Push notifications sent successfully.');
    }
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}

async function sendBroadcastNotification(title: string, body: string) {
  try {
    const db = admin.firestore();
    const usersSnapshot = await db.collection('users').get();

    const tokens: string[] = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.fcmToken && !tokens.includes(userData.fcmToken)) {
        tokens.push(userData.fcmToken);
      }
    });

    if (tokens.length > 0) {
      const message = {
        data: { title, body },
        android: { priority: 'high' as const },
        webpush: { headers: { Urgency: 'high' } },
        tokens: tokens
      };
      await admin.messaging().sendEachForMulticast(message);
    }
  } catch (error) {
    console.error('Error sending broadcast notification:', error);
  }
}

export async function addAdminLog(type: 'SUCCESS' | 'ERROR' | 'LIMIT' | 'SCRAPER', message: string, details?: any) {
  if (admin.apps.length > 0) {
    try {
      await admin.firestore().collection('admin_logs').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        type,
        message,
        details: details || null
      });
    } catch (e) {
      console.error("Nepodařilo se zapsat admin log:", e);
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  app.get("/api/auth/google/url", (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/calendar"],
      prompt: "consent",
    });
    res.json({ url });
  });

  app.get("/auth/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      const tokensBase64 = Buffer.from(JSON.stringify(tokens)).toString('base64');
      const encodedTokens = encodeURIComponent(tokensBase64);
      res.redirect(`/?auth_tokens=${encodedTokens}`);
    } catch (error) {
      console.error("Error exchanging code for tokens:", error);
      res.status(500).send("Authentication failed");
    }
  });

  async function getTargetCalendarId(calendar: any): Promise<string> {
    if (process.env.GOOGLE_CALENDAR_ID) return process.env.GOOGLE_CALENDAR_ID;
    try {
      const response = await calendar.calendarList.list();
      const calendars = response.data.items || [];
      const efkoCalendar = calendars.find((c: any) => c.summary && c.summary.toLowerCase() === "efko");
      if (efkoCalendar?.id) return efkoCalendar.id;
    } catch (error) {
      console.error("Chyba při hledání kalendáře EFko:", error);
    }
    return "primary";
  }

  app.post("/api/calendar/events", async (req, res) => {
    const { tokens, knownIds = [] } = req.body;
    if (!tokens) return res.status(401).json({ error: "No tokens" });

    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const targetCalendarId = await getTargetCalendarId(calendar);

    try {
      const response = await calendar.events.list({
        calendarId: targetCalendarId,
        timeMin: new Date().toISOString(),
        maxResults: 150,
        singleEvents: true,
        orderBy: "startTime",
      });

      const allEvents = response.data.items || [];
      const filteredEvents = allEvents.filter(e => {
        if (knownIds.includes(e.id)) return true;
        if (e.extendedProperties?.private?.app === 'vikendovnik') return true;
        if (e.summary && e.summary.toLowerCase().includes("děti")) return true;
        return false;
      });

      res.json(filteredEvents.slice(0, 10));
    } catch (error: any) {
      if (error.message?.includes('invalid_grant') || error.code === 401) {
        return res.status(401).json({ error: "Vypršelo připojení ke Google kalendáři." });
      }
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.post("/api/calendar/create", async (req, res) => {
    const { tokens, event } = req.body;
    if (!tokens) return res.status(401).json({ error: "No tokens" });
    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const targetCalendarId = await getTargetCalendarId(calendar);
    try {
      const response = await calendar.events.insert({ calendarId: targetCalendarId, requestBody: event });
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/calendar/delete", async (req, res) => {
    const { tokens, eventId } = req.body;
    if (!tokens || !eventId) return res.status(400).json({ error: "Missing data" });
    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const targetCalendarId = await getTargetCalendarId(calendar);
    try {
      await calendar.events.delete({ calendarId: targetCalendarId, eventId });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  type StatusCallback = (msg: string) => void;

  async function generateInspirations(userLocation?: string, onStatus?: StatusCallback) {
    const emit = onStatus ?? (() => {});
    if (!process.env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");

    let ageRules = "";
    if (admin.apps.length > 0) {
      try {
        const db = admin.firestore();
        const usersSnapshot = await db.collection('users').where('role', '==', 'child').get();
        let childrenAgesText = "";
        let hasTeenagers = false;
        let hasToddlers = false;

        usersSnapshot.forEach(doc => {
          const user = doc.data();
          const age = user.age !== undefined ? user.age : (user.birthYear ? new Date().getFullYear() - user.birthYear : null);
          if (age !== null) {
            childrenAgesText += `- ${user.displayName || user.email || 'Dítě'}: ${age} let\n`;
            if (age >= 13) hasTeenagers = true;
            if (age <= 5) hasToddlers = true;
          }
        });

        if (childrenAgesText) {
          ageRules = `VĚKOVÝ PROFIL DĚTÍ V RODINĚ:\n${childrenAgesText}`;
          if (hasTeenagers) ageRules += `⚠️ PRAVIDLO PRO TEENAGERY: Dětem je 13 a více let. Zahrň do výběru i akce pro starší.\n`;
          if (hasToddlers) ageRules += `⚠️ PRAVIDLO PRO NEJMENŠÍ: V rodině je dítě do 5 let. Prioritizuj hřiště a bezpečné akce.\n`;
        }
      } catch (err) { console.error("Chyba při načítání věku:", err); }
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    emit('Spouštím scrapery (Kina, Kudy z nudy, Jižní Morava)...');
    
    const [mksResult, cineStarData, kudyData, jizniMoravaData] = await Promise.all([
      (async () => { 
        console.log('[MKS Vyškov] Spouštím scraper...'); 
        return fetchMksVyskovProgram().catch(e => { console.error('[MKS Vyškov] Chyba:', e); return { cinema: [], events: [] }; });
      })(),
      (async () => { 
        console.log('[CineStar Olomouc] Spouštím scraper...'); 
        return scrapeCineStarOlomouc().catch(e => { console.error('[CineStar Olomouc] Chyba:', e); return []; });
      })(),
      (async () => { 
        console.log('[Kudy z nudy] Spouštím scraper...'); 
        return scrapeKudyZnudy().catch(e => { console.error('[Kudy z nudy] Chyba:', e); return []; });
      })(),
      (async () => { 
        console.log('[Jižní Morava] Spouštím scraper...'); 
        return scrapeJizniMorava().catch(e => { console.error('[Jižní Morava] Chyba:', e); return []; });
      })()
    ]);

    const mksCinema = (mksResult as any)?.cinema || [];
    const mksEvents = (mksResult as any)?.events || [];
    const cinemaDataString = JSON.stringify(mksCinema, null, 2);
    const mksEventsString = JSON.stringify(mksEvents, null, 2);
    const cineStarString = JSON.stringify(cineStarData, null, 2);
    const kudyString = JSON.stringify(kudyData, null, 2);
    const jizniMoravaString = JSON.stringify(jizniMoravaData, null, 2);

    const now = new Date();
    const todayStr = now.toLocaleDateString('cs-CZ', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' });
    const dayOfWeek = now.getDay();
    const daysUntilSat = dayOfWeek === 6 ? 0 : (6 - dayOfWeek);
    const daysUntilSun = dayOfWeek === 0 ? 0 : (7 - dayOfWeek);
    const nextSat = new Date(now); nextSat.setDate(now.getDate() + daysUntilSat);
    const nextSun = new Date(now); nextSun.setDate(now.getDate() + daysUntilSun);
    const fmtDate = (d: Date) => d.toLocaleDateString('cs-CZ', { day: '2-digit', month: 'long', year: 'numeric' });
    const weekendStr = `${fmtDate(nextSat)} (sobota) – ${fmtDate(nextSun)} (neděle)`;

    const prompt = `Jsi organizátor rodinných aktivit Víkendovník. 📅 DNEŠNÍ DATUM: ${todayStr}, 🗓️ VÍKEND: ${weekendStr}.
    Vyhledej akce v Jihomoravském kraji (Brno, Vyškov, Olomouc). ${userLocation ? `LOKALITA: ${userLocation}.` : ""}
    MKS Vyškov: ${cinemaDataString}. ${mksEvents.length > 0 ? `Další akce MKS: ${mksEventsString}` : ""}
    CineStar Olomouc: ${cineStarString}.
    Kudy z nudy: ${kudyString}.
    Jižní Morava: ${jizniMoravaString}.
    
    PRAVIDLA:
    1. Emma (dcera) nesnáší hrady a historii.
    2. František (syn) nesnáší vodu, miluje hokej (Kometa) a PlayStation.
    3. CineStar a ZOO mají přednost.
    4. Formát: JSON pole objektů s poli: title, description, target, location, is_vyskov, date, time, time_type, opening_hours, price, duration, url, indoor, age_recommendation, ticket_url, cinema_listings.
    5. Vrať přesně 10 akcí.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    let suggestions = [];
    try {
      emit('AI skládá víkendový plán...');
      const fullPrompt = prompt + "\n\nDŮLEŽITÉ: Vrať POUZE validní JSON formát. Nepřidávej žádný vysvětlující text a NEPOUŽÍVEJ markdownové značky jako ```json. Výstup musí začínat znakem [ nebo { a končit ] nebo }.";
      const result = await model.generateContent(fullPrompt);
      const responseText = result.response.text();
      suggestions = JSON.parse(responseText.replace(/```json|```/g, '').trim());
    } catch (err) {
      console.error("AI Generation Error:", err);
      suggestions = [];
    }

    if (admin.apps.length > 0 && suggestions.length > 0) {
      const db = admin.firestore();
      const oldInspirations = await db.collection('inspirations').where('status', 'not-in', ['draft', 'proposed']).get();
      const batch = db.batch();
      oldInspirations.docs.forEach(doc => batch.delete(doc.ref));

      suggestions.forEach((s: any) => {
        const docRef = db.collection('inspirations').doc();
        batch.set(docRef, { ...s, status: 'approved', createdAt: admin.firestore.FieldValue.serverTimestamp() });
      });
      await batch.commit();
      addAdminLog('SUCCESS', `Vygenerováno ${suggestions.length} tipů.`);
    }

    return suggestions;
  }

  const isAdmin = async (uid: string) => {
    if (!uid) return false;
    try {
      const userDoc = await admin.firestore().collection('users').doc(uid).get();
      return userDoc.exists && userDoc.data()?.role === 'admin';
    } catch (e) { return false; }
  };

  app.get("/api/agent/generate/stream", async (req, res) => {
    const { location, uid } = req.query;
    if (!uid || !(await isAdmin(uid as string))) return res.status(403).json({ error: "Forbidden" });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    try {
      const suggestions = await generateInspirations(location as string, (msg) => send('status', { message: msg }));
      send('done', { success: true, suggestions });
    } catch (error: any) {
      send('error', { error: error.message });
    } finally { res.end(); }
  });

  // POST – přístupný všem přihlášeným uživatelům (ne jen adminům)
  app.post("/api/agent/generate-bike/stream", async (req, res) => {
    const { location, uid, distance, difficulty, isRandom, authorName } = req.body;

    // Ověříme, že uid existuje (user je přihlášen) — admin oprávnění NENÍ vyžadováno
    if (!uid) return res.status(401).json({ error: "Přihlášení je vyžadováno." });

    // Ověříme uid přes Firebase Auth
    try {
      await admin.auth().getUser(uid);
    } catch {
      return res.status(401).json({ error: "Neplatné UID." });
    }

    if (!process.env.ORS_API_KEY) {
      return res.status(500).json({ error: "Služba pro generování tras není nakonfigurována na serveru." });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const parsedDistance = distance ? Math.min(80, Math.max(5, Number(distance))) : 20;
    const parsedDifficulty: BikeRouteDifficulty =
      ["easy", "medium", "hard"].includes(difficulty) ? difficulty as BikeRouteDifficulty : "medium";

    try {
      const bikeSuggestion = await generateBikeRoute({
        location: location as string,
        userId: uid as string,
        distance: parsedDistance,
        difficulty: parsedDifficulty,
        isRandom: !!isRandom,
        authorName: authorName as string,
        emit: (msg) => send('status', { message: msg })
      });
      send('done', { success: true, suggestion: bikeSuggestion });
    } catch (error: any) {
      console.error("[SERVER] Chyba při generování cyklotrasy:", error);
      send('error', { error: error.message || "Nepodařilo se vygenerovat trasu." });
    } finally { res.end(); }
  });

  app.post("/api/agent/generate", async (req, res) => {
    const { location, uid } = req.body;
    if (!uid || !(await isAdmin(uid))) return res.status(403).json({ error: "Forbidden" });
    try {
      const suggestions = await generateInspirations(location);
      res.json({ success: true, suggestions });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/inspirations/:id/propose", async (req, res) => {
    const { uid } = req.body;
    const { id } = req.params;
    try {
      const docRef = admin.firestore().collection('inspirations').doc(id);
      const doc = await docRef.get();
      if (!doc.exists) return res.status(404).json({ error: "Nenalezeno" });
      if (doc.data()?.userId !== uid) return res.status(403).json({ error: "Forbidden" });
      await docRef.update({ status: 'proposed' });
      res.json({ success: true });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/inspirations/:id/approve", async (req, res) => {
    const { uid } = req.body;
    const { id } = req.params;
    if (!uid || !(await isAdmin(uid))) return res.status(403).json({ error: "Forbidden" });
    try {
      await admin.firestore().collection('inspirations').doc(id).update({ status: 'approved' });
      res.json({ success: true });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.get("/api/gpx/:id", async (req, res) => {
    try {
      const doc = await admin.firestore().collection('inspirations').doc(req.params.id).get();
      if (!doc.exists || !doc.data()?.gpx_content) return res.status(404).send("GPX nenalezeno");
      res.setHeader('Content-Type', 'application/gpx+xml');
      res.setHeader('Content-Disposition', `attachment; filename="cyklotrasa_${req.params.id}.gpx"`);
      res.send(doc.data()?.gpx_content);
    } catch (error) { res.status(500).send("Chyba serveru"); }
  });

  // POST – endpoint pro spouštění středečního generování z GitHub Actions
  app.post("/api/cron/generate", async (req, res) => {
    const authHeader = req.headers.authorization;
    const expectedToken = process.env.CRON_SECRET_TOKEN;

    if (!expectedToken) {
      console.error("[CRON ERROR] CRON_SECRET_TOKEN není nastaven v proměnných prostředí Renderu!");
      return res.status(500).json({ error: "Chyba konfigurace serveru." });
    }

    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      console.warn("[CRON WARNING] Pokus o neoprávněný přístup k plánovanému generování.");
      return res.status(401).json({ error: "Nepovolený přístup (Unauthorized)." });
    }

    try {
      console.log("[CRON] Generování inspirací spouštěno externím triggerem z GitHubu...");
      
      const suggestions = await generateInspirations();
      
      if (suggestions && suggestions.length > 0) {
        await sendBroadcastNotification("✨ Nové tipy na víkend!", "AI agent právě našel čerstvé nápady.");
        return res.json({ success: true, count: suggestions.length });
      } else {
        return res.status(500).json({ error: "Generování nevrátilo žádné inspirace." });
      }
    } catch (error: any) {
      console.error("[CRON ERROR] Kritická chyba při spuštění generování:", error);
      return res.status(500).json({ error: error.message || "Chyba generování" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}

startServer();
