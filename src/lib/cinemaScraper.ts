import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import type { CineStarEvent, CineStarListing } from '../types';

const SOURCE_URL  = 'https://www.mksvyskov.cz';
const CINEMA_URL  = 'https://www.mksvyskov.cz/filmy';
const TODAY       = new Date().toISOString().split('T')[0];

// Rotující user agenti — zabrání detekci statického UA
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

/** Akce MKS, která NENÍ kino — vrací se jako samostatná karta pro AI */
export interface MksScrapedEvent {
  title: string;
  date: string;
  time: string;
  url: string;
  price?: string;
  type: 'akce';
}

/** Výstup scraperu: 1 agregovaná událost kina + N samostatných akcí */
export interface MksScraperResult {
  cinema: CineStarEvent[];     // Kino Sokolský dům
  events: MksScrapedEvent[];   // Ostatní akce (0..N)
}

// ─── Pomocné regex ─────────────────────────────────────────────────────────────
const TIME_RE   = /\b(\d{1,2}[:.]?\d{2})\b/g;
const isKinoUrl = (href: string) => /\/(kino|film|filmy|vstupenky|predstaveni)\b/i.test(href) || href.includes('drawerUrl=');

// ─── Náhodný delay (ms) ─────────────────────────────────────────────────────────
const randomDelay = (min: number, max: number): Promise<void> =>
  new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min)) + min));

const BLACKLIST_WORDS = [
  'vyberte si', 'narozeniny', 'detail filmu', 'koupit', 'vstupenk', 'program', 'kontakt',
  'o nás', 'zpět', 'menu', 'hledat', 'košík', 'zavřít', 'všechny', 'filtr', 'oslave',
  'oslavy', 'dárková', 'dárkový', 'pronáj', 'reklam', 'školy', 'kariéra',
  'novinky', 'ubytování', 'provoz', 'ceník', 'ztráty', 'vstupné', 'otevírací doba', 'vstupenky'
];

// ─── Čistění názvu ─────────────────────────────────────────────────────────────
const cleanTitle = (raw: string): string => {
  const cleaned = raw
    .replace(/(\D)(\d+)\s*min\b/gi, '$1 ($2 min)')
    .replace(/\s*\(?\d{1,2}\+\)?/g, '')
    .replace(/\bPředprodej\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const lower = cleaned.toLowerCase();
  if (BLACKLIST_WORDS.some(word => lower.includes(word))) {
    return "";
  }
  return cleaned;
};

// ─── Extrakce HH:MM z textu ─────────────────────────────────────────────────────
const extractTimes = (text: string): string[] => {
  const matches: string[] = [];
  let m;
  TIME_RE.lastIndex = 0;
  while ((m = TIME_RE.exec(text)) !== null) {
    const t = m[1].replace('.', ':');
    // Filtrujeme roky (2026) a jiná čísla která nejsou časy
    const [h] = t.split(':').map(Number);
    if (h >= 0 && h <= 23) matches.push(t);
  }
  return [...new Set(matches)].sort();
};

/**
 * Aktualizovaná mock data — filmy z programu MKS Vyškov červen 2026.
 * Slouží jako fallback pokud web blokuje požadavky.
 */
const getMock = (): MksScraperResult => {
  console.warn('[Scraper MKS Vyškov] Vracím aktuální MOCK DATA.');
  const nextSat = new Date();
  const dayOfWeek = nextSat.getDay();
  nextSat.setDate(nextSat.getDate() + (dayOfWeek === 6 ? 0 : 6 - dayOfWeek));
  const satStr = nextSat.toISOString().split('T')[0];

  return {
    cinema: [
      {
        title: 'Kino Sokolský dům Vyškov',
        location: 'Kino Sokolský dům Vyškov, Purkyňova 405/2, Vyškov',
        source_url: CINEMA_URL,
        date: satStr,
        cinema_listings: [
          { film: 'Mandalorian a Grogu', time: '17:00, 19:30', film_title: 'Mandalorian a Grogu', showtimes: '17:00, 19:30', url: CINEMA_URL, times: [{time: '17:00', url: CINEMA_URL}, {time: '19:30', url: CINEMA_URL}] },
          { film: 'Mrzutá rybka', time: '15:30', film_title: 'Mrzutá rybka', showtimes: '15:30', url: CINEMA_URL, times: [{time: '15:30', url: CINEMA_URL}] },
          { film: 'Pět švestek', time: '16:00', film_title: 'Pět švestek', showtimes: '16:00', url: CINEMA_URL, times: [{time: '16:00', url: CINEMA_URL}] },
          { film: 'The Amazing Digital Circus: The Last Act', time: '14:00', film_title: 'The Amazing Digital Circus: The Last Act', showtimes: '14:00', url: CINEMA_URL, times: [{time: '14:00', url: CINEMA_URL}] },
        ]
      }
    ],
    events: [
      {
        title: 'Mumbo Jumbo',
        date: satStr, time: '19:00',
        url: CINEMA_URL, price: 'dle programu', type: 'akce'
      }
    ]
  };
};

/**
 * Hlavní scraper MKS Vyškov.
 * Vrací { cinema, events } kde:
 *  - cinema = 1 agregovaná CineStarEvent (Kino Sokolský dům) s filmy v cinema_listings[]
 *  - events = pole samostatných akcí (koncerty, divadla, výstavy…)
 */
export async function fetchMksVyskovProgram(): Promise<MksScraperResult> {
  const EMPTY_CINEMA: CineStarEvent = {
    title: 'Kino Sokolský dům Vyškov',
    location: 'Kino Sokolský dům Vyškov, Purkyňova 405/2, Vyškov',
    source_url: CINEMA_URL,
    date: TODAY,
    cinema_listings: []
  };

  // Zkusíme postupně několik URL stránek
  const urlsToTry = [
    'https://www.mksvyskov.cz/filmy',
    'https://www.mksvyskov.cz/program-kina',
    'https://www.mksvyskov.cz',
  ];

  let browser;
  try {
    console.log('[Scraper MKS Vyškov] Spouštím Puppeteer...');

    const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        `--user-agent=${randomUA}`,
      ]
    });

    const page = await browser.newPage();

    // Anti-detection opatření
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['cs-CZ', 'cs', 'en-US', 'en'] });
      // @ts-ignore
      window.chrome = { runtime: {} };
    });

    await page.setUserAgent(randomUA);
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Upgrade-Insecure-Requests': '1',
    });

    // Viewport jako normální monitor
    await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });

    // Náhodný delay před načtením (simulace lidského chování)
    await randomDelay(800, 2500);

    let html = '';
    let loadedUrl = '';

    for (const url of urlsToTry) {
      try {
        console.log(`[Scraper MKS Vyškov] Zkouším URL: ${url}`);
        await randomDelay(500, 1500);

        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const status = response?.status() || 0;

        if (status === 429 || status === 403) {
          console.warn(`[Scraper MKS Vyškov] Blokováno (${status}) na ${url}, zkouším další...`);
          await randomDelay(3000, 6000); // Delší pauza po blokaci
          continue;
        }

        // Počkáme na JS render
        await randomDelay(2000, 4000);

        // Simulace posuvu stránky (anti-bot)
        await page.evaluate(() => {
          window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'smooth' });
        });
        await randomDelay(500, 1200);

        html = await page.content();
        loadedUrl = url;
        console.log(`[Scraper MKS Vyškov] ✅ Načteno: ${url} (${html.length} B)`);
        break;

      } catch (navErr: any) {
        console.warn(`[Scraper MKS Vyškov] Chyba při načítání ${url}:`, navErr?.message || navErr);
      }
    }

    await browser.close();
    browser = undefined;

    if (!html || html.length < 500) {
      console.warn('[Scraper MKS Vyškov] Žádná stránka nenačtena → mock data.');
      return getMock();
    }

    if (html.includes('Vercel Security Checkpoint') || html.includes("We're verifying")) {
      console.warn('[Scraper MKS Vyškov] Blokován security checkpoint → mock data.');
      return getMock();
    }

    return parseHtml(html, loadedUrl || CINEMA_URL);

  } catch (error) {
    console.error('[Scraper MKS Vyškov] Fatální chyba:', error);
    if (browser) await browser.close();
    return getMock();
  }
}

/**
 * Parsování HTML — extrahuje filmy kina a ostatní akce z načteného HTML.
 */
function parseHtml(html: string, loadedUrl: string): MksScraperResult {
  const $ = cheerio.load(html);
  const cinemas: CineStarEvent[] = [];
  const events: MksScrapedEvent[] = [];
  
  // 1. Zkusíme specifický parser pro MKS Vyškov – Filmy (nový systém)
  if ($('.mui-dztafr').length > 0) {
    const cinemaListingsByDate = new Map<string, CineStarListing[]>();
    
    $('.mui-dztafr').each((_, el) => {
      const heading = $(el);
      const title = cleanTitle(heading.text());
      if (!title || title.length < 2) return;
      const card = heading.closest('.flex.flex-col.justify-between.gap-2');
      if (card.length === 0) return;
      
      let dateStr = TODAY;
      let showtime = '';
      
      card.find('.mui-1pdplut').each((_, pEl) => {
        const text = $(pEl).text().trim();
        const dateMatch = text.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s*•\s*(\d{2}:\d{2})/);
        if (dateMatch) {
          const day = dateMatch[1].padStart(2, '0');
          const month = dateMatch[2].padStart(2, '0');
          const year = dateMatch[3];
          dateStr = `${year}-${month}-${day}`;
          showtime = dateMatch[4];
        }
      });
      
      let ticketUrl = 'https://www.mksvyskov.cz/filmy';
      const linkEl = card.find('a[href*="drawerUrl="]').first();
      if (linkEl.length > 0) {
        const href = linkEl.attr('href') || '';
        ticketUrl = href.startsWith('http') ? href : `https://www.mksvyskov.cz/filmy${href.startsWith('/') ? '' : '/'}${href}`;
      }
      
      if (!cinemaListingsByDate.has(dateStr)) {
        cinemaListingsByDate.set(dateStr, []);
      }
      cinemaListingsByDate.get(dateStr)!.push({
        film: title,
        time: showtime,
        film_title: title,
        showtimes: showtime,
        url: ticketUrl,
        times: [{ time: showtime, url: ticketUrl }]
      });
    });
    
    cinemaListingsByDate.forEach((listings, date) => {
      listings.sort((a, b) => (a.time || a.showtimes || '').localeCompare(b.time || b.showtimes || ''));
      cinemas.push({
        title: 'Kino Sokolský dům Vyškov',
        location: 'Kino Sokolský dům Vyškov, Purkyňova 405/2, Vyškov',
        source_url: 'https://www.mksvyskov.cz/filmy',
        date,
        cinema_listings: listings
      });
    });
    
    cinemas.sort((a, b) => a.date.localeCompare(b.date));
  }
  
  // 2. Fallback pro jiné stránky
  if (cinemas.length === 0) {
    const cinemaMap = new Map<string, Set<string>>();
    const seen = new Set<string>();

    $('a[href]').each((_i, el) => {
      const href = $(el).attr('href') || '';
      const relPath = href.replace(/^https?:\/\/[^/]+/, '');
      const segments = relPath.split('/').filter(Boolean);
      if (segments.length < 2) return;
      if (href.startsWith('http') && !href.startsWith(SOURCE_URL)) return;

      const absoluteUrl = href.startsWith('http') ? href : `${SOURCE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
      if (seen.has(absoluteUrl)) return;
      seen.add(absoluteUrl);

      const parent = $(el).closest('article, li, div, section, tr');
      const headingText = parent.find('h1, h2, h3, h4, [class*="title" i], [class*="name" i], [class*="film" i]').first().text().trim();
      const linkText    = $(el).text().trim();
      const rawTitle    = headingText || linkText;
      if (!rawTitle || rawTitle.length < 3) return;

      const title      = cleanTitle(rawTitle);
      if (!title || title.length < 2) return;

      const parentText = parent.text();
      const times      = extractTimes(parentText);

      const isKino = isKinoUrl(href)
        || /\b(kino|film|promítání|režie|dabing|titulky|minuty|min\.)\b/i.test(parentText)
        || /\b(3D|2D)\b/.test(parentText);

      if (isKino) {
        if (times.length === 0) return; // skip if no concrete times are found
        if (!cinemaMap.has(title)) cinemaMap.set(title, new Set());
        times.forEach(t => cinemaMap.get(title)!.add(t));
      } else {
        const dateRaw  = parent.find('[class*="date" i], [class*="datum" i], time').first().text().trim();
        const priceRaw = parent.find('[class*="price" i], [class*="cena" i], [class*="vstupne" i]').first().text().trim() || undefined;

        events.push({
          title,
          date: dateRaw || TODAY,
          time: times[0] || '',
          url: absoluteUrl,
          price: priceRaw,
          type: 'akce'
        });
      }
    });

    if (cinemaMap.size === 0 && events.length === 0) {
      $('article, [class*="event" i], [class*="program" i], [class*="card" i], [class*="item" i]').each((_i, el) => {
        const container = $(el);
        const rawTitle  = container.find('h1, h2, h3, h4, [class*="title" i]').first().text().trim();
        if (!rawTitle || rawTitle.length < 3) return;

        const href   = container.find('a').first().attr('href') || '';
        const absUrl = href.startsWith('http') ? href : href ? `${SOURCE_URL}${href.startsWith('/') ? '' : '/'}${href}` : SOURCE_URL;
        const containerText = container.text();
        const times  = extractTimes(containerText);
        const title  = cleanTitle(rawTitle);
        if (!title || title.length < 2) return;

        const isKino = isKinoUrl(href)
          || /\b(kino|film|promítání|režie|dabing|titulky|minuty|min\.)\b/i.test(containerText)
          || /\b(3D|2D)\b/.test(containerText);

        if (isKino) {
          if (times.length === 0) return; // skip if no concrete times
          if (!cinemaMap.has(title)) cinemaMap.set(title, new Set());
          times.forEach(t => cinemaMap.get(title)!.add(t));
        } else {
          events.push({ title, date: TODAY, time: times[0] || '', url: absUrl, type: 'akce' });
        }
      });
    }

    if (cinemaMap.size > 0) {
      const cinemaListings: CineStarListing[] = [];
      cinemaMap.forEach((timesSet, title) => {
        const sorted = Array.from(timesSet).sort();
        cinemaListings.push({
          film: title,
          time: sorted.join(', '),
          film_title: title,
          showtimes: sorted.join(', '),
          url: 'https://www.mksvyskov.cz/filmy',
          times: sorted.map(t => ({ time: t, url: 'https://www.mksvyskov.cz/filmy' }))
        });
      });
      cinemaListings.sort((a, b) => (b.time || b.showtimes || '').split(',').length - (a.time || a.showtimes || '').split(',').length);
      
      cinemas.push({
        title: 'Kino Sokolský dům Vyškov',
        location: 'Kino Sokolský dům Vyškov, Purkyňova 405/2, Vyškov',
        source_url: 'https://www.mksvyskov.cz/filmy',
        date: TODAY,
        cinema_listings: cinemaListings
      });
    }
  }

  if (cinemas.length === 0 && events.length === 0) {
    console.warn('[Scraper MKS Vyškov] Nic nenalezeno. Vracím mock data.');
    return getMock();
  }

  console.log(`[Scraper MKS Vyškov] ✅ Kino: ${cinemas.reduce((acc, c) => acc + c.cinema_listings.length, 0)} filmů ve ${cinemas.length} dnech, akce: ${events.length}.`);
  return { cinema: cinemas, events };
}
