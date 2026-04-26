import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL}/auth/callback`
);

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
