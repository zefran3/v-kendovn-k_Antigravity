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
  const PORT = Number(process.env.PORT) || 3000;

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

  app.post("/api/calendar/list-day", async (req, res) => {
    const { tokens, timeMin, timeMax } = req.body;
    if (!tokens) return res.status(401).json({ error: "No tokens" });
    if (!timeMin || !timeMax) return res.status(400).json({ error: "Missing time range" });

    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const targetCalendarId = await getTargetCalendarId(calendar);

    try {
      const response = await calendar.events.list({
        calendarId: targetCalendarId,
        timeMin: timeMin,
        timeMax: timeMax,
        singleEvents: true,
        orderBy: "startTime",
      });
      res.json(response.data.items || []);
    } catch (error: any) {
      if (error.message?.includes('invalid_grant') || error.code === 401) {
        return res.status(401).json({ error: "Vypršelo připojení ke Google kalendáři." });
      }
      res.status(500).json({ error: error.message || "Failed to fetch events" });
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

    let knownLocations: any[] = [];
    let ageRules = "";
    let daughterSection = "";
    let sonSection = "";

    if (admin.apps.length > 0) {
      try {
        const db = admin.firestore();
        const usersSnapshot = await db.collection('users').where('role', '==', 'child').get();
        let childrenAgesText = "";
        let hasTeenagers = false;
        let hasToddlers = false;

        usersSnapshot.forEach(doc => {
          const user = doc.data();
          const name = user.adminAlias || user.displayName || (user.email ? user.email.split('@')[0] : 'Dítě');
          
          let age = user.age !== undefined ? user.age : null;
          if (age === null) {
            if (user.birthYear) {
              age = new Date().getFullYear() - user.birthYear;
            } else if (user.targetGroup === 'pro_dceru') {
              age = 14;
            } else if (user.targetGroup === 'pro_syna') {
              age = 15;
            }
          }

          if (age !== null) {
            childrenAgesText += `- ${name}: ${age} let\n`;
            if (age >= 13) hasTeenagers = true;
            if (age <= 5) hasToddlers = true;
          }

          const ageStr = age !== null ? `, ${age} let` : "";
          if (user.targetGroup === 'pro_dceru') {
            daughterSection += `👧 ${name} (dcera${ageStr}):
  NEMÁ RÁDA (nemá smysl jí je nutit): prohlídky hradů, zámků a obecně akce týkající se prohlídek historických památek.
  MÁ RÁDA: hudební koncerty (jak festivaly v přírodě, tak klasické koncerty v hale), návštěvy koupališť a aquaparků.
`;
          } else if (user.targetGroup === 'pro_syna') {
            sonSection += `👦 ${name} (syn${ageStr}):
  NEMÁ RÁD: ležení u vody a rodinné výlety na koupaliště (s kamarády by mu to nevadilo, ale s rodinou ne).
  MÁ RÁD: hokej — zejména HC Kometa Brno a hokej obecně, vojenskou techniku a armádní akce (Dny NATO jsou pro něj svátek), počítačové hry (Kingdom Come: Deliverance) a PlayStation hry všeho druhu.
  POZNÁMKA 1: Herní centrum PlayStation ve Vyškově NEEXISTUJE — nikdy jej nenabízej jako konkrétní místo.
`;
          }
        });

        if (childrenAgesText) {
          ageRules = `VĚKOVÝ PROFIL DĚTÍ V RODINĚ:\n${childrenAgesText}`;
          if (hasTeenagers) ageRules += `⚠️ PRAVIDLO PRO TEENAGERY: Dětem je 13 a více let. Zahrň do výběru i akce pro starší.\n`;
          if (hasToddlers) ageRules += `⚠️ PRAVIDLO PRO NEJMENŠÍ: V rodině je dítě do 5 let. Prioritizuj hřiště a bezpečné akce.\n`;
        }
      } catch (err) { console.error("Chyba při načítání věku a profilů dětí:", err); }

      // Načtení a případný seeding známých míst (známých URL)
      try {
        const db = admin.firestore();
        const locationsSnapshot = await db.collection('known_locations').get();
        if (locationsSnapshot.empty) {
          console.log("[DB SEED] Kolekce 'known_locations' je prázdná. Provádím inicializační seed...");
          const defaultLocations = [
            {
              name: "ZOO Zlín - Lešná",
              keywords: ["zoo zlin", "zoo lesna", "lesna"],
              exactLocation: "ZOO Zlín - Lešná, Lukovská 112, Zlín",
              exactUrl: "https://www.zoozlin.eu",
              isVyskov: false
            },
            {
              name: "Punkevní jeskyně",
              keywords: ["punkevni jeskyne", "punkevni", "propast macocha", "macocha"],
              exactLocation: "Punkevní jeskyně, Vavřinec 117, Blansko",
              exactUrl: "https://www.caves.cz",
              isVyskov: false
            },
            {
              name: "Aquapark Vyškov",
              keywords: ["aquapark vyskov", "aquapark ve vyskove", "bazen vyskov"],
              exactLocation: "Aquapark Vyškov, Sportovní 758/5, Vyškov",
              exactUrl: "https://www.aquaparkvyskov.cz",
              isVyskov: true
            },
            {
              name: "Státní hrad Veveří",
              keywords: ["hrad veveri", "veveri"],
              exactLocation: "Státní hrad Veveří, Hrad Veveří, Brno",
              exactUrl: "https://www.hradveveri.cz",
              isVyskov: false
            },
            {
              name: "CineStar Olomouc",
              keywords: ["cinestar", "cinestar olomouc"],
              exactLocation: "CineStar Olomouc, OC Olomouc City, Pražská 255/41, Olomouc",
              exactUrl: "https://cinestar.cz/cz/olomouc/program",
              isVyskov: false
            },
            {
              name: "Kino Sokolský dům Vyškov",
              keywords: ["sokolsky dum", "kino vyskov", "mks kino"],
              exactLocation: "Kino Sokolský dům Vyškov, Purkyňova 405/2, Vyškov",
              exactUrl: "https://www.mksvyskov.cz/filmy",
              isVyskov: true
            }
          ];
          const batch = db.batch();
          defaultLocations.forEach(loc => {
            const docRef = db.collection('known_locations').doc();
            batch.set(docRef, loc);
            knownLocations.push({ id: docRef.id, ...loc });
          });
          await batch.commit();
          console.log(`[DB SEED] Úspěšně naseedováno ${defaultLocations.length} známých míst.`);
        } else {
          locationsSnapshot.forEach(doc => {
            knownLocations.push({ id: doc.id, ...doc.data() });
          });
        }
      } catch (err) {
        console.error("Chyba při načítání/seeding známých míst z Firestore:", err);
      }
    }

    // Default fallbacks if no child is configured with targetGroup in DB
    if (!daughterSection) {
      daughterSection = `👧 Emma (dcera, 14 let):
  NEMÁ RÁDA (nemá smysl jí je nutit): prohlídky hradů, zámků a obecně akce týkající se prohlídek historických památek.
  MÁ RÁDA: hudební koncerty (jak festivaly v přírodě, tak klasické koncerty v hale), návštěvy koupališť a aquaparků.
`;
    }
    if (!sonSection) {
      sonSection = `👦 František (syn, 15 let):
  NEMÁ RÁD: ležení u vody a rodinné výlety na koupaliště (s kamarády by mu to nevadilo, ale s rodinou ne).
  MÁ RÁD: hokej — zejména HC Kometa Brno a hokej obecně, vojenskou techniku a armádní akce (Dny NATO jsou pro něj svátek), počítačové hry (Kingdom Come: Deliverance) a PlayStation hry všeho druhu.
  POZNÁMKA 1: Herní centrum PlayStation ve Vyškově NEEXISTUJE — nikdy jej nenabízej jako konkrétní místo.
`;
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

    // ── Diagnostika: kolik položek každý scraper vrátil ──────────────────────
    const mksCinemaCount = Array.isArray(mksCinema) ? mksCinema.length : (mksCinema?.cinema_listings?.length ?? 0);
    const mksEventsCount = mksEvents.length;
    const cineStarCount = (cineStarData as any[]).length;
    const kudyCount = (kudyData as any[]).length;
    const jizniMoravaCount = (jizniMoravaData as any[]).length;
    const totalScraped = mksCinemaCount + mksEventsCount + cineStarCount + kudyCount + jizniMoravaCount;

    console.log(`[AI Agent] Scraper diagnostika:
      MKS Kino: ${mksCinemaCount} filmů
      MKS Akce: ${mksEventsCount} akcí
      CineStar:  ${cineStarCount} položek
      KudyZNudy: ${kudyCount} položek
      JižníMorava: ${jizniMoravaCount} položek
      CELKEM: ${totalScraped} položek pro AI`);

    addAdminLog('SCRAPER', `Scraped: MKS kino=${mksCinemaCount}, MKS akce=${mksEventsCount}, CineStar=${cineStarCount}, KudyZNudy=${kudyCount}, JižníMorava=${jizniMoravaCount}`, { totalScraped });

    // ── Výpočet dat víkendu (sdíleno pro pre-processing i prompt) ─────────────
    const pragueTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Prague" }));
    const dow = pragueTime.getDay(); // 0=Ne, 1=Po, ..., 6=So
    const hour = pragueTime.getHours();

    const formatDateISO = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const tempSat = new Date(pragueTime);
    tempSat.setDate(pragueTime.getDate() + (dow === 6 ? 0 : (dow === 0 ? -1 : 6 - dow)));
    const tempSun = new Date(tempSat);
    tempSun.setDate(tempSat.getDate() + 1);

    const satISO = formatDateISO(tempSat);
    const sunISO = formatDateISO(tempSun);

    let targetDates: string[] = [];
    if (dow === 6) { // Sobota
      if (hour >= 18) {
        targetDates = [sunISO];
      } else {
        targetDates = [satISO, sunISO];
      }
    } else if (dow === 0) { // Neděle
      if (hour >= 18) {
        const nextSatDate = new Date(tempSat);
        nextSatDate.setDate(tempSat.getDate() + 7);
        const nextSunDate = new Date(nextSatDate);
        nextSunDate.setDate(nextSatDate.getDate() + 1);
        targetDates = [formatDateISO(nextSatDate), formatDateISO(nextSunDate)];
      } else {
        targetDates = [sunISO];
      }
    } else {
      targetDates = [satISO, sunISO];
    }

    const nextSatISO = targetDates[0];
    const todayStr = pragueTime.toLocaleDateString('cs-CZ', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' });
    const fmtDate = (dStr: string) => {
      const d = new Date(dStr);
      return d.toLocaleDateString('cs-CZ', { day: '2-digit', month: 'long', year: 'numeric' });
    };
    const weekendStr = targetDates.length > 1
      ? `${fmtDate(targetDates[0])} (sobota) – ${fmtDate(targetDates[1])} (neděle)`
      : `${fmtDate(targetDates[0])} (${new Date(targetDates[0]).getDay() === 0 ? 'neděle' : 'sobota'})`;

    // Filtrování dat pouze pro cílové dny víkendu, abychom zmenšili prompt a zamezili akcím v minulosti
    const filterWeekendEvents = (events: any[]) =>
      events.filter(e => e.date && targetDates.includes(e.date));

    const weekendMksCinema = filterWeekendEvents(mksCinema);
    const weekendCineStar = filterWeekendEvents(cineStarData);
    const weekendMksEvents = filterWeekendEvents(mksEvents);

    // ── Pre-processing dat před promptem ───────────────────────────
    const enrichItems = (items: any[], sourceName: string) => {
      const filtered = items.filter(item => !item.date || targetDates.includes(item.date));
      return filtered.map(item => ({
        ...item,
        date: item.date && item.date.trim() ? item.date.trim() : nextSatISO,
        description: (!item.description || item.description.trim().length < 10 ||
                      item.description === `Akce v Jihomoravském kraji – ${item.title}`)
          ? `Tip z ${sourceName}: ${item.title}. Více informací na webu akce.`
          : item.description.trim(),
      }));
    };

    const enrichedKudy = enrichItems(Array.isArray(kudyData) ? kudyData as any[] : [], 'Kudy z nudy');
    const enrichedJizni = enrichItems(Array.isArray(jizniMoravaData) ? jizniMoravaData as any[] : [], 'Jižní Morava');

    // ── Sestavení datových bloků pro AI prompt ─────────────────────────────────
    const cinemaDataString  = weekendMksCinema.length > 0 ? JSON.stringify(weekendMksCinema, null, 2) : 'ŽÁDNÁ DATA (scraper selhal nebo nenašel nic)';
    const mksEventsString   = weekendMksEvents.length > 0  ? JSON.stringify(weekendMksEvents, null, 2) : 'ŽÁDNÁ DATA';
    const cineStarString    = weekendCineStar.length > 0   ? JSON.stringify(weekendCineStar, null, 2) : 'ŽÁDNÁ DATA';
    const kudyString        = enrichedKudy.length > 0 ? JSON.stringify(enrichedKudy, null, 2) : 'ŽÁDNÁ DATA';
    const jizniMoravaString = enrichedJizni.length > 0 ? JSON.stringify(enrichedJizni, null, 2) : 'ŽÁDNÁ DATA';



    const prompt = `Jsi organizátor rodinných aktivit Víkendovník. 📅 DNEŠNÍ DATUM: ${todayStr}, 🗓️ VÍKEND: ${weekendStr}.
Lokalita rodiny: ${userLocation || 'Vyškov, Jihomoravský kraj'}.

━━━ SCRAPED DATA Z INTERNETU (aktuální, ověřená) ━━━
[MKS Vyškov – Kino]: ${cinemaDataString}
[MKS Vyškov – Akce]: ${mksEventsString}
[CineStar Olomouc]: ${cineStarString}
[Kudy z nudy – JM kraj]: ${kudyString}
[Jižní Morava – Akce]: ${jizniMoravaString}
━━━ KONEC DAT ━━━

Celkem scraped položek pro tento výběr: ${totalScraped}

${ageRules}

━━━ PROFILY ČLENŮ RODINY ━━━

${daughterSection}
${sonSection}

━━━ PRAVIDLA PRO POLE target ━━━
Každý tip musí mít hodnotu target:
- "pro_dceru"   → tip je ideální hlavně pro dceru (koncert, aquapark, kreativní kurzy)
- "pro_syna"    → tip je ideální hlavně pro syna (hokej, armáda, tech)
- "pro_vsechny" → tip je vhodný pro celou rodinu (kino, ZOO, festival, výlet, muzeum)
Distribuce: ideálně 3 tipy "pro_dceru", 3 tipy "pro_syna", zbytek "pro_vsechny".

━━━ ABSOLUTNÍ PRAVIDLA ━━━

1. ⛔ Data scraperů výše jsou tvůj primární zdroj. Pro aktivity s konkrétním datem, časem a cenou čerpej VÝHRADNĚ z těchto dat — nevymýšlej detaily pro akce které v datech nejsou.

2. ⛔ Navrhuj POUZE místa která jsou buď (a) přímo ve scraped datech výše, nebo (b) reálně existující místa o jejichž existenci jsi zcela jistý ze svých znalostí (Aquapark Vyškov, ZOO Lešná apod. jsou reálná místa). NIKDY nevymýšlej neexistující zařízení — typické příklady halucinací: „Herna PlayStation Vyškov", „Minigolf park Vyškov centrum". Pokud si nejsi jistý existencí konkrétního místa, NENAPIŠ HO.

3. ✅ Pokud scraper vrátil "ŽÁDNÁ DATA" — zcela ho ignoruj. Přejdi na scraper který data má. NEČERPEJ z prázdného scraperu vůbec nic.

4. ⛔ Generuj VŽDY 6–8 tipů pokud je celkový počet scraped položek > 5. Prázdné pole [] je přípustné POUZE tehdy, když všechny scrapery vrátily "ŽÁDNÁ DATA". Nikdy negeneruj méně než 4 tipy pokud existují reálná data.

5. ✅ Priorita zdrojů: CineStar Olomouc a ZOO mají přednost pro dceru. MKS Vyškov Kino zařaď jako tip pro celou rodinu.

6. ✅ Formát výstupu: JSON pole objektů. Každý objekt musí mít PŘESNĚ tato pole:
   title, description, target, location, is_vyskov, date, time, time_type, opening_hours, price, duration, url, indoor, age_recommendation, ticket_url, cinema_listings
   - ⛔ U všech aktivit, které nejsou kinem CineStar Olomouc nebo Kino Sokolský dům Vyškov, MUSÍ být pole 'cinema_listings' prázdné pole [].

7. ✅ Maximálně 10 akcí. Pokud je reálných dat méně — vrať méně. Nikdy více než 10.

8. ⛔ DATUM: Pole "date" NESMÍ být v minulosti. Dnešní datum je ${pragueTime.toISOString().split('T')[0]}. Pokud ze scraperu nemáš přesné datum, použij datum nejbližšího víkendu: ${targetDates[0]}.

9. ⛔ URL PRAVIDLA:
   a) Pro akce se scraped URL (source_url, url z dat) → VŽDY použij tuto URL přímo.
   b) Pro obecně známá místa (ZOO, jeskyně, hrady, aquaparky, muzea, galerie) → VŽDY
      zkus uvést jejich oficiální web ze svých znalostí. Příklady:
      - ZOO Lešná Zlín → https://www.zoozlin.eu
      - Punkevní jeskyně / Macocha → https://www.caves.cz
      - Aquapark Vyškov → https://www.aquaparkvyskov.cz
      - Letecké muzeum Vyškov → http://www.lhs-vyskov.cz
      - Hrad Veveří → https://www.hradveveri.cz (nebo podobná logická URL)
      Pokud si oficiálním webem nejsi absolutně jistý → nech url: "" (NIKDY
      nepiš URL o které víš že je chybná).
   c) NIKDY nepoužívej holou doménu bez cesty pro scraper-akce (např.
      https://www.kudyznudy.cz/ bez slug je zakázáno).

10. ⛔ PRO KINA PLATÍ PŘÍSNÝ ZÁKAZ SAMOSTATNÝCH KARET PRO JEDNOTLIVÉ FILMY:
    - ⛔ NIKDY negeneruj samostatné karty pro konkrétní filmy z těchto kin (např. samostatná karta pro film 'Mandalorian a Grogu' nebo 'Lumpík Špuntík' je přísně zakázána!). Všechny filmy z programu daného kina pro daný víkendový den (sobota nebo neděle) musí být sloučeny do jediné celkové karty kina pro daný den.
    - Pro kino CineStar Olomouc vygeneruj nejvýše 1 celkovou kartu pro sobotu a nejvýše 1 celkovou kartu pro neděli (target='pro_vsechny').
    - Pro Kino Sokolský dům Vyškov vygeneruj nejvýše 1 celkovou kartu pro sobotu a nejvýše 1 celkovou kartu pro neděli (target='pro_vsechny').
    - ✅ UVEĎ KOMPLETNÍ PROGRAM: V poli 'cinema_listings' dané karty uveď VŠECHNY dostupné filmy, které se v daném kině v daný den promítají. Nic nezkracuj ani nevynechávej! Uveď všechny filmy ze scraped dat pro daný den.
    - Každá položka v poli 'cinema_listings' musí mít přesně tuto strukturu objektu: {"film": "Název filmu", "time": "Časy promítání (např. 17:00, 19:30)", "url": "URL odkaz na detail/nákup vstupenek z dat"}.
    - ⛔ ADRESY MÍST (location):
      * Pro kartu kina CineStar Olomouc musí být pole 'location' nastaveno PŘESNĚ a doslova na: "CineStar Olomouc, OC Olomouc City, Pražská 255/41, Olomouc"
      * Pro kartu kina Kino Sokolský dům Vyškov musí být pole 'location' nastaveno PŘESNĚ a doslova na: "Kino Sokolský dům Vyškov, Purkyňova 405/2, Vyškov"
      * NIKDY nezkracuj adresy ani nepoužívej obecné názvy v poli 'location'.
    - ⛔ NIKDY nemíchej ani nekopíruj filmy, časy nebo odkazy z dat jednoho kina do karty druhého kina. Filmy pro CineStar Olomouc musí pocházet výhradně z bloku [CineStar Olomouc] a filmy pro Kino Sokolský dům Vyškov z bloku [MKS Vyškov – Kino].
    - ⛔ Pokud u filmu chybí konkrétní časy promítání (např. 17:00), zahrň ho do cinema_listings s time="viz web kina". NEVYNECHÁVEJ filmy pouze kvůli chybějícímu času.

11. ✅ POVINNÉ POUŽITÍ BLOKU [Kudy z nudy – JM kraj]:
    - Z tohoto bloku VŽDY vygeneruj alespoň 2 tipy (výlety, přírodní atrakce, festivaly, muzea v JM kraji).
    - Datum je již předvyplněno (pre-processed). Pokud datum vypadá jako ISO date (YYYY-MM-DD), použij ho přímo.
    - Description je připravena — uprav ji do lákavé formy pro rodinu.
    - target nastaň dle povahy aktivity: výlet příroda → 'pro_vsechny', kulturní akce → 'pro_dceru', sport → 'pro_syna'.
    - url nastav z pole source_url položky.
    - is_vyskov: false.
    - ⛔ NIKDY tento blok zcela neignoruj.

12. ✅ POVINNÉ POUŽITÍ BLOKU [Jižní Morava – Akce]:
    - Z tohoto bloku VŽDY vygeneruj alespoň 1 tip.
    - Datum je již předvyplněno. Použij ho přímo.
    - url nastav z pole source_url položky.
    - is_vyskov: false.
    - ⛔ NIKDY tento blok zcela neignoruj.

13. ⛔ ZÁKAZ OBECNÝCH TIPŮ — KAŽDÝ TIP MUSÍ BÝT KONKRÉTNÍ MÍSTO NEBO AKCE:
    - Zakazuji obecné regiony nebo oblasti jako cíl výletu.
    - ❌ ZAKÁZÁNO: "Výlet do Moravského krasu", "Objevte Jihomoravský kraj", "Výlet do přírody"
    - ✅ POVOLENO: "Punkevní jeskyně – plavba na lodičkách", "Propast Macocha – výhled z mostu",
      "Hrad Buchlov – prohlídka", "Muzeum Brněnského podzemí"
    - Pokud scraped data jsou příliš obecná (region, kraj) → vyber z dané oblasti
      KONKRÉTNÍ atrakci ze svých znalostí (jen pokud existuje a jsi si jist).
    - Každý tip MUSÍ mít v poli 'location' konkrétní adresu nebo alespoň konkrétní
      název místa (ne kraj ani region jako jediný identifikátor).

14. ⛔ ABSOLUTNÍ ZÁKAZ CYKLOTRAS Z AI:
    - NIKDY negeneruj tipy jejichž hlavní náplní je cyklistika, cyklovýlet nebo cyklotrasa.
    - Aplikace Víkendovník má vlastní generátor cyklotras — AI tipy pro cyklo jsou zbytečné
      a matou uživatele.
    - Klíčová slova k ignorování: cyklotrasa, cyklovýlet, cyklistika, kolo, bike, bikování.
    - Pokud scraper vrátí cykloakci → PŘESKOČ ji a vyber jinou aktivitu ze stejné oblasti.

15. ⛔ GEOGRAFICKÉ OMEZENÍ PRO AI TIPY (MIMO SCRAPERY):
    - Pokud navrhuješ místo ze svých vlastních znalostí (bod 2b - např. ZOO, muzea, zábavní parky, hrady, sportovní centra), toto místo se MUSÍ nacházet v rozumné dojezdové vzdálenosti od Vyškova (max. 80-100 km). Typicky Jihomoravský kraj, Zlínský kraj (např. ZOO Lešná) nebo Olomoucký kraj (OC City Olomouc).
    - PŘÍSNÝ ZÁKAZ doporučovat místa v Čechách nebo na druhém konci republiky (např. Plzeň, Praha, Liberec, Králíky atd.). Pokud nemáš vhodný lokální tip v tomto okruhu, raději vygeneruj méně tipů.`;

    // Primární model: gemini-2.5-flash (stabilní, funguje, dostatečná kvóta)
    // Fallback: gemini-2.0-flash (separátní kvóta – odlišná generace modelu)
    // Poznámka: gemini-2.5-pro byl přesunut z primárního kvůli opakovaným 429 chybám.
    // responseMimeType: 'application/json' = model vrátí čistý JSON bez markdownu
    const JSON_GENERATION_CONFIG = { responseMimeType: 'application/json' as const };
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite', generationConfig: JSON_GENERATION_CONFIG });
    let suggestions: any[] = [];
    let usedModel = 'gemini-3.1-flash-lite';
    const withTimeout = (promise: Promise<any>, timeoutMs: number) => {
      let timeoutId: any;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Timeout: API call took longer than ${timeoutMs / 1000} seconds`));
        }, timeoutMs);
      });
      return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
    };

    try {
      emit('AI skládá víkendový plán...');
      const result = await withTimeout(model.generateContent(prompt), 30000) as any;
      const finishReason = result.response.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        throw new Error(`Neočekávaný finishReason od primárního modelu: ${finishReason}`);
      }
      const responseText = result.response.text();
      suggestions = JSON.parse(responseText.replace(/```json|```/g, '').trim());
      // Prázdné pole [] = model odmítl generovat → považujeme za chybu a spustíme fallback
      if (!Array.isArray(suggestions) || suggestions.length === 0) {
        console.warn(`[AI] ${usedModel} vrátil prázdné pole. Raw: ${responseText.substring(0, 300)}`);
        throw new Error(`${usedModel} vrátil prázdné pole tipů (raw: ${responseText.substring(0, 100)})`);
      }
      console.log(`[AI] ${usedModel} úspěšně vygeneroval ${suggestions.length} tipů.`);
    } catch (err: any) {
      // Fallback na gemini-3.1-flash-lite-preview – má separátní kvótu a jiné rate limity
      const errInfo = `status=${err?.status}, msg=${String(err).substring(0, 200)}`;
      console.warn(`[AI] ${usedModel} selhalo (${errInfo}), zkouším fallback na gemini-3.1-flash-lite-preview...`);
      emit('Přepínám na záložní model...');
      addAdminLog('ERROR', `[AI] ${usedModel} selhalo, spouštím fallback.`, { error: errInfo });
      try {
        usedModel = 'gemini-3.1-flash-lite-preview';
        const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview', generationConfig: JSON_GENERATION_CONFIG });
        const fallbackResult = await withTimeout(fallbackModel.generateContent(prompt), 30000) as any;
        const fallbackFinishReason = fallbackResult.response.candidates?.[0]?.finishReason;
        if (fallbackFinishReason && fallbackFinishReason !== 'STOP') {
          throw new Error(`Neočekávaný finishReason od fallbacku: ${fallbackFinishReason}`);
        }
        const fallbackText = fallbackResult.response.text();
        suggestions = JSON.parse(fallbackText.replace(/```json|```/g, '').trim());
        if (!Array.isArray(suggestions) || suggestions.length === 0) {
          console.warn(`[AI] Fallback ${usedModel} vrátil prázdné pole. Raw: ${fallbackText.substring(0, 300)}`);
          throw new Error(`Fallback ${usedModel} vrátil prázdné pole tipů`);
        }
        console.log(`[AI] Fallback ${usedModel} úspěšně vygeneroval ${suggestions.length} tipů.`);
      } catch (fallbackErr: any) {
        const fallbackErrInfo = `status=${fallbackErr?.status}, msg=${String(fallbackErr).substring(0, 300)}`;
        console.error(`[AI] Fallback ${usedModel} také selhal: ${fallbackErrInfo}`);
        addAdminLog('ERROR', `[AI] Fallback ${usedModel} selhal.`, { error: fallbackErrInfo });
        suggestions = [];
      }
    }

    // ── Server-side post-processing: záchranná síť pro datum a URL ──────────
    const todayISO = formatDateISO(pragueTime);
    const weekendISO = targetDates[0];

    // Domény, jejichž holá URL (bez cesty za /) je nepřijatelná
    const BARE_DOMAINS = [
      'https://www.kudyznudy.cz',
      'https://kudyznudy.cz',
      'https://www.jizni-morava.cz',
      'https://www.mksvyskov.cz',
      'https://mksvyskov.cz',
    ];

    // Shromáždění všech reálných URL adres ze scraperů pro ochranu před halucinacemi
    const scrapedUrls = new Set<string>();
    const collectUrls = (arr: any[]) => {
      if (!Array.isArray(arr)) return;
      arr.forEach(item => {
        if (item.url) scrapedUrls.add(item.url.trim());
        if (item.source_url) scrapedUrls.add(item.source_url.trim());
        if (item.ticket_url) scrapedUrls.add(item.ticket_url.trim());
        if (Array.isArray(item.cinema_listings)) {
          item.cinema_listings.forEach((cl: any) => {
            if (cl.url) scrapedUrls.add(cl.url.trim());
          });
        }
      });
    };

    collectUrls(mksCinema);
    collectUrls(mksEvents);
    collectUrls(cineStarData);
    collectUrls(kudyData);
    collectUrls(jizniMoravaData);

    // Důvěryhodné domény (portály a ověřené weby), u nichž povolujeme jakékoliv podstránky i bez přímého výskytu ve scraped datech
    const TRUSTED_DOMAINS = [
      'kudyznudy.cz',
      'jizni-morava.cz',
      'mksvyskov.cz',
      'cinestar.cz',
      'mapy.cz',
      'aquaparkvyskov.cz',
      'zoozlin.eu',
      'caves.cz',
      'hradveveri.cz',
      'google.com',
      'google.cz',
      'lhs-vyskov.cz',
      'tronlaserarena.cz',
      'zoobrno.cz',
      'vida.cz',
      'hvezdarna.cz'
    ];

    const isUrlSafe = (urlStr: string) => {
      if (!urlStr || urlStr.trim() === '') return true;
      const trimmed = urlStr.trim();
      if (scrapedUrls.has(trimmed)) return true;
      
      const targetDomain = trimmed.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").split('/')[0].toLowerCase();
      
      // 1. Kontrola proti seznamu důvěryhodných domén
      const isTrusted = TRUSTED_DOMAINS.some(domain => {
        return targetDomain === domain || targetDomain.endsWith('.' + domain);
      });
      if (isTrusted) return true;
      
      // 2. Kontrola proti známým registrovaným místům ve Firestore
      const matchedKnown = knownLocations.some(loc => {
        if (!loc.exactUrl) return false;
        const knownDomain = loc.exactUrl.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").split('/')[0].toLowerCase();
        return knownDomain && targetDomain && (knownDomain === targetDomain || targetDomain.endsWith('.' + knownDomain));
      });
      return matchedKnown;
    };

    suggestions = suggestions.map((s: any) => {
      const normalizeStr = (str: string) =>
        str
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "") // odstranění diakritiky
          .replace(/[^a-z0-9]/g, "") // odstranění speciálních znaků a mezer
          .trim();

      // Vyhledání a obohacení podle známých míst z Firestore
      const normTitle = normalizeStr(s.title || '');
      const matchedLocation = knownLocations.find(loc => {
        const keywords = Array.isArray(loc.keywords) ? loc.keywords : [];
        return keywords.some((kw: string) => normTitle.includes(normalizeStr(kw)));
      });

      if (matchedLocation) {
        console.log(`[Post-process] Nalezena shoda pro "${s.title}" -> známé místo "${matchedLocation.name}"`);
        if (matchedLocation.exactLocation) {
          s.location = matchedLocation.exactLocation;
        }
        // Pokud AI nevygenerovala specifickou cestu na detail (má jen prázdný řetězec nebo holou doménu),
        // použijeme oficiální domovskou URL ze známých míst.
        const isBareUrl = !s.url || s.url.trim() === '' || BARE_DOMAINS.some(domain => s.url === domain || s.url === domain + '/');
        if (matchedLocation.exactUrl && isBareUrl) {
          s.url = matchedLocation.exactUrl;
        }
        if (matchedLocation.isVyskov !== undefined) {
          s.is_vyskov = matchedLocation.isVyskov;
        }
      }

      // 1. Oprava data v minulosti
      if (s.date) {
        // Pokus o parsování data z různých formátů (ISO nebo česky)
        const isoMatch = s.date.match(/(\d{4}-\d{2}-\d{2})/);
        if (isoMatch) {
          const eventDate = isoMatch[1];
          if (eventDate < todayISO) {
            console.warn(`[Post-process] Datum v minulosti: "${s.date}" → nahrazuji ${weekendISO}`);
            s.date = weekendISO;
          }
        }
      }

      // 2. Programmatická injektáž kompletního programu pro kina (zabranění useknutí ze strany AI)
      const isCineStar = (s.location && s.location.includes('CineStar')) || normalizeStr(s.title || '').includes('cinestar');
      const isMks = (s.location && (s.location.includes('Sokolský dům') || s.location.includes('Sokolsky dum') || s.location.includes('Purkyňova 405'))) || 
                    normalizeStr(s.title || '').includes('sokolskydum') || 
                    normalizeStr(s.title || '').includes('kinovyskov');

      if (isCineStar || isMks) {
        const sourceData = isCineStar ? weekendCineStar : weekendMksCinema;
        const matchingDay = sourceData.find((d: any) => d.date === s.date);
        if (matchingDay && Array.isArray(matchingDay.cinema_listings)) {
          console.log(`[Post-process] Nahrazuji cinema_listings kompletním programem pro ${s.location} dne ${s.date} (${matchingDay.cinema_listings.length} filmů)`);
          s.cinema_listings = matchingDay.cinema_listings.map((item: any) => ({
            film: item.film || item.film_title,
            time: item.time || item.showtimes,
            url: item.url || (isCineStar ? 'https://cinestar.cz/cz/olomouc/program' : 'https://www.mksvyskov.cz/filmy'),
            times: item.times || []
          }));
        }
      } else {
        // Záchranná síť: u všech ostatních aktivit, které nejsou kiny, vyčistíme program kina
        s.cinema_listings = [];
      }

      // 3. Kontrola bezpečnosti URL adresy (ochrana před halucinacemi, expirovanými doménami a nevhodným obsahem)
      if (s.url && !isUrlSafe(s.url)) {
        console.warn(`[Post-process] Bezpečnostní riziko: Detekována neověřená URL "${s.url}" pro "${s.title}" -> odstraňuji URL`);
        s.url = '';
      }
      if (s.ticket_url && !isUrlSafe(s.ticket_url)) {
        console.warn(`[Post-process] Bezpečnostní riziko: Detekována neověřená ticket URL "${s.ticket_url}" pro "${s.title}" -> odstraňuji ticket URL`);
        s.ticket_url = '';
      }

      // 4. Oprava holé URL domény (přesměruje na homepage místo na akci)
      if (s.url) {
        const isBareUrl = BARE_DOMAINS.some(domain =>
          s.url === domain || s.url === domain + '/'
        );
        if (isBareUrl) {
          console.warn(`[Post-process] Holá URL domény: "${s.url}" → nahrazuji prázdným stringem`);
          s.url = '';
        }
      }

      return s;
    });

    if (admin.apps.length > 0 && suggestions.length > 0) {
      const db = admin.firestore();
      // Mažeme VŠECHNY inspirace kromě uživatelských draftů a čekajících na schválení.
      // Tím odstraníme jak staré tipy (bez pole source, z doby před opravou),
      // tak nové AI tipy (source='ai') — bez ohledu na jejich stáří.
      // Bezpečné: uživatelské cyklotrasy mají status 'draft' nebo 'proposed' a zůstávají.
      const allInspirations = await db.collection('inspirations').get();
      const batch = db.batch();
      allInspirations.docs.forEach(doc => {
        const data = doc.data();
        // Zachovej pouze uživatelské drafty a čekající na schválení
        if (data.status !== 'draft' && data.status !== 'proposed') {
          batch.delete(doc.ref);
        }
      });

      suggestions.forEach((s: any) => {
        const docRef = db.collection('inspirations').doc();
        batch.set(docRef, {
          ...s,
          status: 'approved',
          source: 'ai',                                            // ← označení AI původu
          generatedAt: admin.firestore.FieldValue.serverTimestamp(), // ← pro 'Nové' badge v UI
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
      addAdminLog('SUCCESS', `Vygenerováno ${suggestions.length} tipů. Scraped celkem: ${totalScraped} položek.`, { totalScraped });
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
      if (suggestions && suggestions.length > 0) {
        send('done', { success: true, suggestions });
      } else {
        console.error('[STREAM] Generování dokončeno, ale suggestions je prázdné. Viz admin_logs.');
        send('error', { error: 'AI agent nedokázal vygenerovat žádné tipy. Zkus znovu za chvíli (kvóta modelu) nebo zkontroluj admin logy.' });
      }
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

  // Pomocné funkce pro správu lokací
  const canManageLocations = async (uid: string) => {
    if (!uid) return false;
    try {
      const userDoc = await admin.firestore().collection('users').doc(uid).get();
      if (!userDoc.exists) return false;
      const role = userDoc.data()?.role;
      return role === 'admin' || role === 'parent';
    } catch (e) { return false; }
  };

  const isAuthenticatedUser = async (uid: string) => {
    if (!uid) return false;
    try {
      const userDoc = await admin.firestore().collection('users').doc(uid).get();
      return userDoc.exists;
    } catch (e) { return false; }
  };

  app.get("/api/locations", async (req, res) => {
    const { uid } = req.query;
    if (!uid || !(await isAuthenticatedUser(uid as string))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const snapshot = await admin.firestore().collection('known_locations').get();
      const locationsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(locationsList);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/locations", async (req, res) => {
    const { uid, name, keywords, exactLocation, exactUrl, isVyskov } = req.body;
    if (!uid || !(await canManageLocations(uid))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const docRef = await admin.firestore().collection('known_locations').add({
        name,
        keywords,
        exactLocation,
        exactUrl,
        isVyskov: !!isVyskov
      });
      res.json({ success: true, id: docRef.id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/locations/:id", async (req, res) => {
    const { id } = req.params;
    const { uid, name, keywords, exactLocation, exactUrl, isVyskov } = req.body;
    if (!uid || !(await canManageLocations(uid))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      await admin.firestore().collection('known_locations').doc(id).update({
        name,
        keywords,
        exactLocation,
        exactUrl,
        isVyskov: !!isVyskov
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/locations/:id", async (req, res) => {
    const { id } = req.params;
    const { uid } = req.body;
    if (!uid || !(await canManageLocations(uid))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      await admin.firestore().collection('known_locations').doc(id).delete();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
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
