import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";
import admin from "firebase-admin";
import cron from "node-cron";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL}/auth/callback`
);

// Inicializace Firebase Admin pro push notifikace
try {
  const serviceAccountPath = path.join(process.cwd(), 'vikendovnik-firebase-adminsdk-fbsvc-62ecb71cd3.json');
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin initialized successfully.");
    
    const db = admin.firestore();
    const startTime = admin.firestore.Timestamp.now();
    
    db.collection('suggestions').where('createdAt', '>', startTime).onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const suggestion = change.doc.data();
          sendPushNotification(suggestion);
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

async function sendPushNotification(suggestion: any) {
  try {
    const db = admin.firestore();
    const usersSnapshot = await db.collection('users').get();
    
    const tokens: string[] = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      // Odesíláme notifikace pouze pro administrátory nebo všechny?
      // Ponecháme to zatím primárně pro účet zefran3@gmail.com (Táta) a evičku
      if ((userData.email === 'zefran3@gmail.com' || userData.email === 'eva.kubartova@gmail.com') && userData.fcmToken) {
         if (!tokens.includes(userData.fcmToken)) {
             tokens.push(userData.fcmToken);
         }
      }
    });

    if (tokens.length > 0) {
      const title = suggestion.type === 'ride' ? 'Nová žádost o odvoz 🚗' : 'Nový návrh aktivity 🎉';
      const body = `${suggestion.childName}: ${suggestion.title}`;
      
      console.log(`[PUSH DEBUG] Sending to ${tokens.length} tokens:`);
      tokens.forEach((t, i) => console.log(`  Token ${i+1}: ${t.substring(0, 20)}...${t.substring(t.length - 10)}`));
      
      const message = {
        notification: { title, body },
        tokens: tokens
      };
      
      const response = await admin.messaging().sendEachForMulticast(message);
      console.log('Push notifications sent successfully:', response.successCount, 'failed:', response.failureCount);
      
      if (response.failureCount > 0) {
        response.responses.forEach((r, i) => {
          if (!r.success) {
            console.error(`  Token ${i+1} error:`, r.error?.code, r.error?.message);
          }
        });
      }
    } else {
      console.log('[PUSH DEBUG] No FCM tokens found for target users!');
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
        notification: { title, body },
        tokens: tokens
      };
      await admin.messaging().sendEachForMulticast(message);
      console.log(`Broadcast notification sent to ${tokens.length} users: ${title}`);
    }
  } catch (error) {
    console.error('Error sending broadcast notification:', error);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Google Auth URL
  app.get("/api/auth/google/url", (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/calendar"],
      prompt: "consent",
    });
    res.json({ url });
  });

  // Auth Callback
  app.get("/auth/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      // Převod na base64 a přesměrování do aplikace pro PWA kompatibilitu na mobilech
      const tokensBase64 = Buffer.from(JSON.stringify(tokens)).toString('base64');
      const encodedTokens = encodeURIComponent(tokensBase64);
      res.redirect(`/?auth_tokens=${encodedTokens}`);
    } catch (error) {
      console.error("Error exchanging code for tokens:", error);
      res.status(500).send("Authentication failed");
    }
  });

  // Pomocná funkce pro nalezení správného kalendáře
  async function getTargetCalendarId(calendar: any): Promise<string> {
    if (process.env.GOOGLE_CALENDAR_ID) {
      return process.env.GOOGLE_CALENDAR_ID;
    }
    try {
      const response = await calendar.calendarList.list();
      const calendars = response.data.items || [];
      const efkoCalendar = calendars.find((c: any) => c.summary && c.summary.toLowerCase() === "efko");
      if (efkoCalendar && efkoCalendar.id) {
        console.log("Nalezen kalendář EFko, použije se ID:", efkoCalendar.id);
        return efkoCalendar.id;
      }
    } catch (error) {
      console.error("Chyba při hledání kalendáře EFko, použije se 'primary':", error);
    }
    return "primary";
  }

  // Get Calendar Events
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
        maxResults: 150, // Zvýšeno kvůli robustnějšímu filtrování
        singleEvents: true,
        orderBy: "startTime",
        // Odstraněno q: "Děti", přebíráme vše nadcházející a filtrujeme bezpečně lokálně nebo přes Google tags
      });
      
      const allEvents = response.data.items || [];
      const filteredEvents = allEvents.filter(e => {
        // 1. Shoda podle ID, které aplikace eviduje v databázi (nejbezpečnější a zpětně kompatibilní)
        if (knownIds.includes(e.id)) return true;
        
        // 2. Shoda přes Extended Properties (nové události od této chvíle)
        if (e.extendedProperties?.private?.app === 'vikendovnik') return true;

        // 3. Fallback pro úplně první starší události s "Děti" 
        if (e.summary && e.summary.toLowerCase().includes("děti")) return true;
        
        return false;
      });
      
      res.json(filteredEvents.slice(0, 10));
    } catch (error: any) {
      console.error("Error fetching events:", error);
      if (error.message?.includes('invalid_grant') || error.code === 401) {
         return res.status(401).json({ error: "invalid_grant" });
      }
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  // Create Calendar Event
  app.post("/api/calendar/create", async (req, res) => {
    const { tokens, event } = req.body;
    if (!tokens) return res.status(401).json({ error: "No tokens" });

    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const targetCalendarId = await getTargetCalendarId(calendar);

    try {
      const response = await calendar.events.insert({
        calendarId: targetCalendarId,
        requestBody: event,
      });
      res.json(response.data);
    } catch (error) {
      console.error("Error creating event:", error);
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  // Delete Calendar Event
  app.post("/api/calendar/delete", async (req, res) => {
    const { tokens, eventId } = req.body;
    if (!tokens) return res.status(401).json({ error: "No tokens" });
    if (!eventId) return res.status(400).json({ error: "No eventId" });

    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const targetCalendarId = await getTargetCalendarId(calendar);

    try {
      await calendar.events.delete({
        calendarId: targetCalendarId,
        eventId: eventId,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting event:", error);
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  async function generateInspirations(userLocation?: string) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY");
    }
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

    const prompt = `Jsi organizátor rodinných aktivit pro aplikaci Víkendovník. 
K vyhledání informací POVINNĚ použi Google Search Grounding. Vyhledej AKTUÁLNÍ (pro tento nebo příští víkend) a reálně existující akce v Jihomoravském kraji a okolí (Brno, Vyškov, Olomouc, do cca 1 hodiny cesty autem).
${userLocation ? `AKTUÁLNÍ LOKALITA UŽIVATELE: ${userLocation}. Upřednostni akce v blízkosti tohoto místa.` : ""}
Hledej primárně na portálech: gotobrno.cz, kudyznudy.cz, jizni-morava.cz, mksvyskov.cz, cinestar.cz (Olomouc), cyklo-jizni-morava.cz, mapy.cz (cykloturistická vrstva).

RODINNÁ PRAVIDLA (Kritické):
1. Dcera (Emma) NESNÁŠÍ hrady, zámky, zříceniny a nudu z historie. Tyto akce jí vůbec nenabízej!
2. Syn (František) NERAD vodu, koupaliště a plavání. Žádné vodní aktivity pro něj!
3. Milují kino (CineStar Olomouc), ZOO, food festivaly a hudební festivaly. Tyto akce mají absolutní přednost!
4. Syn (František) ZBOŽŇUJE hokej a je zarytý fanoušek HC Kometa Brno. Jakékoliv akce spojené s hokejem nebo Kometou jsou pro něj jak dělané!
5. Táta a syn (případně i ostatní) milují počítačové hry a PlayStation. Herní akce, turnaje, VR herny nebo výstavy počítačů jsou pro ně gigantické plus!
6. POČASÍ JE KLÍČOVÉ: Zkontroluj předpověď počasí na nadcházející víkend pro Jihomoravský kraj. Pokud má pršet, být zima nebo celkově ošklivo, nabízej POUZE akce pod střechou (kino, herny, výstavy). Pokud má být teplo a slunečno, zařaď venkovní akce.
7. CYKLO VÝLETY: Táta a syn (František) rádi jezdí na kole. Pokud je hezké počasí, navrhni alespoň jeden cyklo výlet pro ně dva. 
   PRAVIDLA PRO CYKLO:
   - Target je VŽDY "pro_syna".
   - Trasa MUSÍ být OKRUH (start i cíl na stejném místě).
   - Start i cíl MUSÍ být v místě: ${userLocation || "v blízkosti bydliště (Brno/Vyškov)"}.
   - Uveď délku trasy v km a převýšení v poli "cycling_info".
   - Do pole "url" POVINNĚ vlož odkaz na hotovou trasu na Mapy.cz. Formát URL: https://mapy.cz/turisticka?rc=lat1,lon1&rc=lat2,lon2&rc=lat3,lon3&rc=lat1 (start i cíl MUSÍ být stejný!). DŮLEŽITÉ: Jako souřadnice použij reálná čísla (např. 49.195,16.608). Mapy.cz takto trasu okamžitě vypočítají a zobrazí v mapě.
   - Povinně vyplň pole "cycling_info": distance (např. "25 km"), elevation (např. "300 m"), duration (např. "2:30").

Vyber 5–7 nejlepších akcí z internetu. POVINNĚ musí být zastoupena minimálně 1 inspirace pro dceru ("pro_dceru") a minimálně 1 pro syna ("pro_syna"). Zbytek může být "pro_vsechny".
Některé akce zacíli speciálně bez hradů pro dceru ("pro_dceru") nebo bez vody pro syna ("pro_syna").

SPECIÁLNÍ PRAVIDLA PRO KINO:
Pokud navrhuješ návštěvu kina (např. CineStar Olomouc), NEVYPISUJ konkrétní film jako hlavní tip.
Místo toho vypiš v poli "cinema_listings" až 5 vhodných filmů, které hrají daný víkend, s časy představení a odkazem na nákup lístků.
Filtruj filmy vhodné pro rodinu (ne horory, ne filmy 18+).

TYPY ČASOVÝCH ÚDAJŮ (time_type):
- "event" = jednorázová akce s konkrétním začátkem (koncert, divadlo, přednáška). Uveď přesný čas v poli "time".
- "opening_hours" = instituce s otevírací dobou (ZOO, muzeum, VIDA, aquapark). Uveď víkendovou otevírací dobu v poli "opening_hours" (např. "So 9:00–17:00, Ne 10:00–16:00").
- "all_day" = celodenní akce/festival. Pole "time" může být prázdné nebo "celý den".
- "flexible" = volně přístupné místo bez omezení. Pole "time" nech prázdné.

POVINNÉ POLE pro každou akci:
- "indoor": true pokud jde o akci pod střechou, false pokud venku. U kombinovaných (např. ZOO) uveď false.

Vrať VÝHRADNĚ JSON pole s touto strukturou (a žádný jiný text):
[
  {
    "title": "Název konkrétní reálné akce nebo místa",
    "description": "Lákavý a krátký popis (proč tam jít). 2-3 věty.",
    "target": "pro_vsechny",
    "location": "Přesný název místa nebo adresa",
    "date": "2026-05-03",
    "time": "14:00",
    "time_type": "event",
    "opening_hours": null,
    "price": "od 150 Kč / Zdarma / rodinné vstupné 450 Kč",
    "duration": "cca 2 hodiny",
    "url": "https://odkaz-na-web-akce-nebo-mista.cz",
    "indoor": true,
    "age_recommendation": "pro celou rodinu / od 6 let",
    "ticket_url": "https://odkaz-na-nákup-vstupenek.cz (pokud existuje)",
    "cinema_listings": null,
    "cycling_info": { "distance": "25 km", "elevation": "120 m", "duration": "1:45 h" } (pouze u cyklo výletů, jinak null)
  },
  {
    "title": "CineStar Olomouc – víkendový program",
    "description": "Vyber si z aktuálního programu kina!",
    "target": "pro_vsechny",
    "location": "CineStar Olomouc, Olomouc City",
    "date": "2026-05-03",
    "time": null,
    "time_type": "opening_hours",
    "opening_hours": "So-Ne 10:00–22:00",
    "price": "od 199 Kč",
    "duration": "dle filmu",
    "url": "https://www.cinestar.cz/olomouc",
    "indoor": true,
    "age_recommendation": "pro celou rodinu",
    "ticket_url": "https://www.cinestar.cz/olomouc",
    "cinema_listings": [
      { "film": "Název filmu", "time": "14:30, 17:00, 20:15" }
    ]
  }
]

DŮLEŽITÉ — PŘESNOST INFORMACÍ (Kritické):
- ABSOLUTNÍ ZÁKAZ ODHADOVÁNÍ URL. Nikdy nevytvářej URL adresu jen na základě názvu akce (např. nikdy nedoplňuj .cz za název). Použij VÝHRADNĚ a POUZE tu URL adresu, kterou jsi skutečně našel v Google Search Grounding výsledcích pro danou akci. 
- Pokud v search results nenajdeš přímou a funkční URL adresu akce, nastav pole "url" na null. Raději null, než nefunkční nebo "skoro správný" odkaz. 
- Adresy končící chybou nebo nefunkční přesměrování nepoužívej.
- NEVYMÝŠLEJ SI CENY. Pole "price" vyplň POUZE pokud jsi cenu skutečně našel na webu dané instituce/akce. Pokud cenu nenajdeš, nastav pole na null.
- Pole "ticket_url" = stránka kde se kupují vstupenky/vstupné. Hledej na webu dané instituce stránky jako: vstupné, vstupenky, e-shop, eshop, obchod, tickets, buy. Mnoho institucí má e-shop na vlastní doméně nebo používá externí prodejce (GoOut, Ticketportal, Ticketmaster). Pokud najdeš, použij. Pokud ne, nastav na null.
- Pole "cinema_listings" vyplň POUZE u kin. U ostatních akcí ho nastav na null. U cinema_listings NEUVÁDEJ URL u jednotlivých filmů.
- OTEVÍRACÍ DOBY: Pole "opening_hours" vyplň pouze pokud jsi otevírací dobu skutečně našel na webu. Nenajdeš-li, nastav na null.
- Všechna pole musí být přítomna v každém objektu (i když jsou null).`;

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash', // Ověřený vítěz testu (podporuje i vyhledávání)
      tools: [{ googleSearch: {} }] 
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    let suggestions = [];
    try {
      const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const match = cleanJson.match(/\[[\s\S]*\]/);
      const finalJsonString = match ? match[0] : cleanJson;
      suggestions = JSON.parse(finalJsonString);
    } catch (parseError) {
      console.error("Chyba při parsování JSON:", responseText);
      throw new Error("AI odpověď nebyla ve správném formátu.");
    }

    // Uložení do Firestore (přepíše staré tipy)
    if (admin.apps.length > 0) {
      const db = admin.firestore();
      const batch = db.batch();
      
      const oldInspirations = await db.collection('inspirations').get();
      oldInspirations.docs.forEach(doc => batch.delete(doc.ref));

      suggestions.forEach((s: any) => {
        const docRef = db.collection('inspirations').doc();
        batch.set(docRef, { ...s, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      });

      await batch.commit();
    }

    return suggestions;
  }



  // AI Agent Route pro generování inspirace
  app.post("/api/agent/generate", async (req, res) => {
    const { location } = req.body;
    try {
      const suggestions = await generateInspirations(location);
      res.json({ success: true, count: suggestions.length, suggestions });
    } catch (error: any) {
      console.error("AI Agent Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // CRON úloha - spouštění každou středu ve 3:00 ráno
  cron.schedule("0 3 * * 3", () => {
    console.log("CRON: Spouštím automatické generování víkendové inspirace...");
    generateInspirations()
      .then(suggestions => {
        console.log(`CRON: Úspěšně vygenerováno ${suggestions.length} tipů.`);
        sendBroadcastNotification(
          "✨ Nové tipy na víkend!", 
          "AI agent právě našel čerstvé nápady na výlety. Podívej se do aplikace!"
        );
      })
      .catch(error => console.error("CRON Error:", error));
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
