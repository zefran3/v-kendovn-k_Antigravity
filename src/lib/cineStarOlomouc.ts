/**
 * Scraper pro CineStar Olomouc
 * Strategie: Puppeteer (networkidle2) + klikání na záložky dnů + agregace filmů po dnech
 *
 * Výstup: pole CineStarEvent[], kde každý prvek reprezentuje program kina pro jeden konkrétní den.
 */

import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import type { CineStarEvent, CineStarListing } from '../types';

const SOURCE_URL = 'https://cinestar.cz/cz/olomouc/program';
const LOCATION   = 'CineStar Olomouc, OC Olomouc City, Pražská 255/41, Olomouc';

/**
 * Parsuje datum z textu tlačítka filtru (např. "So 30. 5.", "Po 1. 6.", "Dnes", "Zítra")
 */
function parseButtonDate(text: string): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // 1-indexed

  if (text.toLowerCase().includes('dnes')) {
    return today.toISOString().split('T')[0];
  }

  if (text.toLowerCase().includes('zítra')) {
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  // Formát: "So 30. 5." nebo "Po 1. 6."
  const match = text.match(/(\d{1,2})\.\s*(\d{1,2})\./);
  if (match) {
    const day = match[1].padStart(2, '0');
    const m = match[2].padStart(2, '0');
    // Výpočet roku s ošetřením přelomu roku (prosinec -> leden)
    let y = year;
    const btnMonth = parseInt(m, 10);
    if (month === 12 && btnMonth === 1) {
      y = year + 1;
    } else if (month === 1 && btnMonth === 12) {
      y = year - 1;
    }
    return `${y}-${m}-${day}`;
  }

  return today.toISOString().split('T')[0];
}

const BLACKLIST_WORDS = [
  'vyberte si', 'narozeniny', 'detail filmu', 'koupit', 'vstupenk', 'program', 'kontakt',
  'o nás', 'zpět', 'menu', 'hledat', 'košík', 'zavřít', 'všechny', 'filtr', 'oslave',
  'oslavy', 'dárková', 'dárkový', 'pronáj', 'reklam', 'školy', 'kariéra',
  'novinky', 'ubytování', 'provoz', 'ceník', 'ztráty', 'vstupné', 'otevírací doba', 'vstupenky'
];

/**
 * Vyčistí název filmu
 */
const cleanFilmTitle = (raw: string): string => {
  const cleaned = raw
    .replace(/(\D)(\d+)\s*min\b/gi, '$1 ($2 min)')
    .replace(/\s*\(?\d{1,2}\+\)?/g, '')
    .replace(/\bP\u0159edprodej\b/gi, '')
    .replace(/\bPředprodej\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const lower = cleaned.toLowerCase();
  if (BLACKLIST_WORDS.some(word => lower.includes(word))) {
    return "";
  }
  return cleaned;
};

export async function scrapeCineStarOlomouc(): Promise<CineStarEvent[]> {
  const getFallback = (reason: string): CineStarEvent[] => {
    console.warn(`[CineStar Olomouc] Fallback: ${reason}`);
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilSat = dayOfWeek === 6 ? 0 : (6 - dayOfWeek);
    const daysUntilSun = dayOfWeek === 0 ? 0 : (7 - dayOfWeek);

    const nextSat = new Date(now); nextSat.setDate(now.getDate() + daysUntilSat);
    const nextSun = new Date(now); nextSun.setDate(now.getDate() + daysUntilSun);

    const satStr = nextSat.toISOString().split('T')[0];
    const sunStr = nextSun.toISOString().split('T')[0];

    return [
      {
        title: 'Kino CineStar Olomouc',
        location: LOCATION,
        source_url: SOURCE_URL,
        date: satStr,
        cinema_listings: [
          { film: 'Program kina momentálně nedostupný (zobrazte web pro aktuální informace)', time: 'Zkontrolujte web', film_title: 'Program kina momentálně nedostupný (zobrazte web pro aktuální informace)', showtimes: 'Zkontrolujte web', url: SOURCE_URL }
        ]
      },
      {
        title: 'Kino CineStar Olomouc',
        location: LOCATION,
        source_url: SOURCE_URL,
        date: sunStr,
        cinema_listings: [
          { film: 'Program kina momentálně nedostupný (zobrazte web pro aktuální informace)', time: 'Zkontrolujte web', film_title: 'Program kina momentálně nedostupný (zobrazte web pro aktuální informace)', showtimes: 'Zkontrolujte web', url: SOURCE_URL }
        ]
      }
    ];
  };

  let browser;
  try {
    console.log('[CineStar Olomouc] Spouštím Puppeteer...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // Skrytí automation fingerprints
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

    console.log(`[CineStar Olomouc] Načítám stránku program: ${SOURCE_URL}...`);
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle2', timeout: 45000 });

    // Tvrdé čekání na inicializaci JS a případných AJAX prvků
    await new Promise(r => setTimeout(r, 3000));

    const buttonSelector = '.screening-day-filter-day-button';
    const buttonsCount = await page.$$eval(buttonSelector, els => els.length).catch(() => 0);
    console.log(`[CineStar Olomouc] Nalezeno ${buttonsCount} tlačítek dnů.`);

    if (buttonsCount === 0) {
      // Kontrola blokace
      const html = await page.content();
      if (html.includes('Vercel Security Checkpoint') || html.includes("We're verifying your browser")) {
        await browser.close();
        return getFallback('Blokován Vercel Security Checkpoint');
      }
      await browser.close();
      return getFallback('Nenalezena tlačítka programu (změna layoutu nebo blokace)');
    }

    const allEvents: CineStarEvent[] = [];

    for (let i = 0; i < buttonsCount; i++) {
      // Re-evaluace elementů kvůli zamezení detachementu v DOMu
      const btnInfo = await page.evaluate((idx, sel) => {
        const btns = document.querySelectorAll(sel);
        const btn = btns[idx] as HTMLButtonElement;
        if (!btn) return null;
        return {
          text: btn.innerText.trim(),
          isSelected: btn.classList.contains('selected')
        };
      }, i, buttonSelector);

      if (!btnInfo) continue;
      console.log(`[CineStar Olomouc] Zpracovávám tlačítko ${i}: "${btnInfo.text}" (Vybráno: ${btnInfo.isSelected})`);

      // Kliknutí na tlačítko dne, pokud již není vybrané
      if (!btnInfo.isSelected) {
        await page.evaluate((idx, sel) => {
          const btns = document.querySelectorAll(sel);
          const btn = btns[idx] as HTMLButtonElement;
          if (btn) btn.click();
        }, i, buttonSelector);
        // Čekání na AJAX načtení filmů
        await new Promise(r => setTimeout(r, 1500));
      }

      const html = await page.content();
      const $ = cheerio.load(html);
      const dateStr = parseButtonDate(btnInfo.text);

      const listings: CineStarListing[] = [];
      const rows = $('[class*="grid-cols-programme-cinema" i]');

      rows.each((_, el) => {
        const titleEl = $(el).find('a[href*="/filmy/movie/"] span').first();
        let rawTitle = titleEl.text().trim();
        if (!rawTitle) {
          rawTitle = $(el).find('h2, h3, h4, [class*="title" i]').text().trim().replace(/\s+/g, ' ');
        }
        if (!rawTitle) return;

        const filmTitle = cleanFilmTitle(rawTitle);
        if (!filmTitle || filmTitle.length < 2) return;

        const showtimes: { time: string; url: string }[] = [];
        $(el).find('a[href*="websale.cinestar.cz"]').each((_, linkEl) => {
          const href = $(linkEl).attr('href') || '';
          const timeText = $(linkEl).text().trim();
          if (/\b\d{2}:\d{2}\b/.test(timeText)) {
            showtimes.push({ time: timeText, url: href });
          }
        });

        if (showtimes.length > 0) {
          listings.push({
            film: filmTitle,
            time: showtimes.map(s => s.time).join(', '),
            film_title: filmTitle,
            showtimes: showtimes.map(s => s.time).join(', '),
            url: showtimes[0].url || SOURCE_URL
          });
        }
      });

      if (listings.length > 0) {
        // Seřadit filmy podle počtu představení (sestupně)
        listings.sort((a, b) => {
          const countA = (a.time || a.showtimes || '').split(',').length;
          const countB = (b.time || b.showtimes || '').split(',').length;
          return countB - countA;
        });

        allEvents.push({
          title: 'Kino CineStar Olomouc',
          location: LOCATION,
          source_url: SOURCE_URL,
          date: dateStr,
          cinema_listings: listings
        });
      }
    }

    await browser.close();

    if (allEvents.length === 0) {
      return getFallback('Žádné filmy se nepodařilo naparsovat');
    }

    console.log(`[CineStar Olomouc] ✅ Úspěch! Naparsováno ${allEvents.length} dní s programem.`);
    return allEvents;

  } catch (error) {
    console.error('[CineStar Olomouc] Fatální chyba při scrapování:', error);
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
    return getFallback(`Výjimka: ${(error as Error).message}`);
  }
}
