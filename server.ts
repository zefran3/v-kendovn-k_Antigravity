import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/auth/callback` : (process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL}/auth/callback`)
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
      const tokensStr = JSON.stringify(tokens);
      
      res.send(`
        <html>
          <body style="background: #121212; color: white; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
            <script>
              try {
                const tokens = ${tokensStr};
                localStorage.setItem('googleCalendarTokens', JSON.stringify(tokens));
                alert('Klíč k uložení nalezen! Přesměrovávám...');
              } catch (e) {
                alert('CHYBA PŘI UKLÁDÁNÍ: ' + e.message);
              }
              window.location.href = '/';
            </script>
            <div style="text-align: center;">
              <p>Přihlášení úspěšné, vracím vás do aplikace...</p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Error exchanging code for tokens:", error);
      res.redirect('/?auth_error=1');
    }
  });

  // Get Calendar Events
  app.post("/api/calendar/events", async (req, res) => {
    const { tokens, knownIds = [] } = req.body;
    if (!tokens) return res.status(401).json({ error: "No tokens" });

    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    try {
      const response = await calendar.events.list({
        calendarId: "primary",
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

    try {
      const response = await calendar.events.insert({
        calendarId: "primary",
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

    try {
      await calendar.events.delete({
        calendarId: "primary",
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
