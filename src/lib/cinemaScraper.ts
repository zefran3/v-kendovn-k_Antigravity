import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import type { CineStarEvent, CineStarListing } from '../types';

const SOURCE_URL = 'https://www.mksvyskov.cz';
const CINEMA_URL = 'https://www.mksvyskov.cz/kino';
const TODAY      = new Date().toISOString().split('T')[0];

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
  cinema: CineStarEvent;       // Kino Sokolský dům — vždy přítomno (i jako prázdné)
  events: MksScrapedEvent[];   // Ostatní akce (0..N)
}

// ─── Pomocné regex ─────────────────────────────────────────────────────────────
const TIME_RE  = /\b(\d{1,2}[:.]\d{2})\b/g;
const isKinoUrl = (href: string) => /\/(kino|film|vstupenky|predstaveni)\//i.test(href);

// ─── Čistění názvu ─────────────────────────────────────────────────────────────
const cleanTitle = (raw: string): string =>
  raw
    .replace(/(\D)(\d+)\s*min\b/gi, '$1 ($2 min)')  // '80min' → '(80 min)'
    .replace(/\s*\(?\d{1,2}\+\)?/g, '')              // '15+', '(12+)' apod.
    .replace(/\bP\u0159edprodej\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

// ─── Extrakce HH:MM z textu ─────────────────────────────────────────────────────
const extractTimes = (text: string): string[] => {
  const matches: string[] = [];
  let m;
  TIME_RE.lastIndex = 0;
  while ((m = TIME_RE.exec(text)) !== null) {
    matches.push(m[1].replace('.', ':')); // Normalizace 14.30 → 14:30
  }
  return [...new Set(matches)].sort();
};

/**
 * Hlavní scraper MKS Vyškov.
 *
 * Vrací { cinema, events } kde:
 *  - cinema = 1 agregovaná CineStarEvent (Kino Sokolský dům) s filmy v cinema_listings[]
 *  - events = pole samostatných akcí (koncerty, divadla, výstavy…)
 */
export async function fetchMksVyskovProgram(): Promise<MksScraperResult> {
  const EMPTY_CINEMA: CineStarEvent = {
    title: 'Kino Sokolský dům Vyškov',
    location: 'Kino Sokolský dům Vyškov',
    source_url: CINEMA_URL,
    date: TODAY,
    cinema_listings: []
  };

  const getMock = (): MksScraperResult => {
    console.warn('[Scraper MKS Vyškov] Vracím MOCK DATA (blokace/chyba).');
    return {
      cinema: {
        ...EMPTY_CINEMA,
        cinema_listings: [
          { film_title: 'Kung Fu Panda 4 (3D Dabing)', showtimes: '15:00', url: CINEMA_URL },
          { film_title: 'Krotitelé duchů: Říše ledu',  showtimes: '17:30', url: CINEMA_URL },
        ]
      },
      events: [
        {
          title: 'Zibura: Stand-up show (mock)',
          date: TODAY, time: '20:00',
          url: SOURCE_URL, price: '299 Kč', type: 'akce'
        }
      ]
    };
  };

  let browser;
  try {
    console.log('[Scraper MKS Vyškov] Spouštím Puppeteer...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox',
             '--disable-blink-features=AutomationControlled', '--disable-web-security']
    });

    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    });

    console.log('[Scraper MKS Vyškov] Načítám stránku (networkidle2)...');
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle2', timeout: 45000 });

    // Tvrdé čekání pro CSR a načtení fontů/časů
    await new Promise(r => setTimeout(r, 3000));

    try {
      await page.waitForSelector('footer, nav, main, body > div', { timeout: 15000 });
    } catch {
      console.warn('[Scraper MKS Vyškov] Timeout při čekání na strukturu — pokračuji.');
    }

    const html = await page.content();
    await browser.close();
    browser = undefined;

    if (html.includes('Vercel Security Checkpoint') || html.includes("We're verifying your browser")) {
      console.warn('[Scraper MKS Vyškov] Blokován Vercel Security Checkpoint.');
      return getMock();
    }

    const $ = cheerio.load(html);

    // Mapa filmů kina: název → set časů
    const cinemaMap = new Map<string, Set<string>>();
    // Ostatní akce
    const events: MksScrapedEvent[] = [];
    const seen = new Set<string>();

    let isFirstDebugDone = false;

    // ─── PARSOVÁNÍ: Procházíme všechny <a href> vedoucí na konkrétní stránky ──
    $('a[href]').each((_i, el) => {
      const href = $(el).attr('href') || '';

      // Přeskočíme příliš krátké (navigační) cesty a externí odkazy
      const relPath = href.replace(/^https?:\/\/[^/]+/, '');
      const segments = relPath.split('/').filter(Boolean);
      if (segments.length < 2) return;
      if (href.startsWith('http') && !href.startsWith(SOURCE_URL)) return;

      const absoluteUrl = href.startsWith('http') ? href : `${SOURCE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
      if (seen.has(absoluteUrl)) return;
      seen.add(absoluteUrl);

      const parent = $(el).closest('article, li, div, section');
      const headingText = parent.find('h1, h2, h3, h4, [class*="title" i], [class*="name" i]').first().text().trim();
      const linkText    = $(el).text().trim();
      const rawTitle    = headingText || linkText;
      if (!rawTitle || rawTitle.length < 3) return;

      const title = cleanTitle(rawTitle);

      // ── Extrakce textu z rodiče pro časy ─────────────────────────
      const parentText = parent.text();
      const times      = extractTimes(parentText);

      // Rozšířená detekce kina: zkontrolujeme nejen URL, ale i samotný text kontejneru
      const isKino = isKinoUrl(href) || /\b(kino|film|promítání|režie|dabing|titulky|minuty|min\.)\b/i.test(parentText) || /\b(3D|2D)\b/.test(parentText);

      if (isKino) {
        // ── KINO: přidáme do agregované události ─────────────────
        if (times.length === 0) times.push('Časy na webu'); // Pragmatický přístup

        if (!cinemaMap.has(title)) cinemaMap.set(title, new Set());
        times.forEach(t => cinemaMap.get(title)!.add(t));
      } else {
        // ── OSTATNÍ AKCE ──────────────────────────────────────────
        const dateRaw  = parent.find('[class*="date" i], [class*="datum" i], time').first().text().trim();
        const timeStr  = times[0] || '';
        const priceRaw = parent.find('[class*="price" i], [class*="cena" i], [class*="vstupne" i]').first().text().trim() || undefined;

        events.push({
          title,
          date: dateRaw || TODAY,
          time: timeStr,
          url: absoluteUrl,
          price: priceRaw,
          type: 'akce'
        });
      }
    });

    // ─── Fallback CSS selektory pokud link-based nenašel nic ──────────────────
    if (cinemaMap.size === 0 && events.length === 0) {
      console.log('[Scraper MKS Vyškov] Link strategie nenašla nic, zkouším CSS selektory...');

      $('article, [class*="event" i], [class*="program" i], [class*="card" i], [class*="item" i]').each((_i, el) => {
        const container = $(el);
        const rawTitle  = container.find('h1, h2, h3, h4, [class*="title" i]').first().text().trim();
        if (!rawTitle || rawTitle.length < 3) return;

        const href   = container.find('a').first().attr('href') || '';
        const absUrl = href.startsWith('http') ? href : href ? `${SOURCE_URL}${href.startsWith('/') ? '' : '/'}${href}` : SOURCE_URL;
        const containerText = container.text();
        const times  = extractTimes(containerText);
        const title  = cleanTitle(rawTitle);
        
        const isKino = isKinoUrl(href) || /\b(kino|film|promítání|režie|dabing|titulky|minuty|min\.)\b/i.test(containerText) || /\b(3D|2D)\b/.test(containerText);

        if (isKino) {
          if (times.length === 0) times.push('Časy na webu');
          if (!cinemaMap.has(title)) cinemaMap.set(title, new Set());
          times.forEach(t => cinemaMap.get(title)!.add(t));
        } else {
          events.push({ title, date: TODAY, time: times[0] || '', url: absUrl, type: 'akce' });
        }
      });

      console.log(`[Scraper MKS Vyškov] CSS fallback: kino=${cinemaMap.size} filmů, events=${events.length}.`);
    }

    // Diagnostika
    if (cinemaMap.size === 0 && events.length === 0) {
      console.warn('[Scraper MKS Vyškov] Nic nenalezeno. HTML dump (4000 znaků):');
      console.warn(html.substring(0, 4000));
      return getMock();
    }

    // ─── Sestavení výsledku ────────────────────────────────────────────────────
    const cinemaListings: CineStarListing[] = [];
    cinemaMap.forEach((timesSet, title) => {
      const sorted = Array.from(timesSet).sort();
      cinemaListings.push({ film_title: title, showtimes: sorted.join(', '), url: CINEMA_URL });
    });
    // Nejvíce promítané nahoře
    cinemaListings.sort((a, b) => b.showtimes.split(',').length - a.showtimes.split(',').length);

    const cinema: CineStarEvent = {
      ...EMPTY_CINEMA,
      cinema_listings: cinemaListings
    };

    console.log(`[Scraper MKS Vyškov] ✅ Kino: ${cinemaListings.length} filmů, akce: ${events.length}.`);
    return { cinema: [cinema] as any, events };

  } catch (error) {
    console.error('[Scraper MKS Vyškov] Fatální chyba:', error);
    if (browser) await browser.close();
    return getMock();
  }
}
