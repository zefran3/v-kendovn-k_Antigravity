/**
 * Scraper pro CineStar Olomouc
 * Strategie: Puppeteer (networkidle2) + agregace filmů do 1 souhrnné události
 *
 * Výstup: pole o délce 1 — jedna CineStarEvent reprezentující celé kino daný den.
 */

import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import type { CineStarEvent, CineStarListing } from '../types';

const SOURCE_URL = 'https://cinestar.cz/cz/olomouc';
const LOCATION   = 'CineStar Olomouc';

export async function scrapeCineStarOlomouc(): Promise<CineStarEvent[]> {
  const today = new Date().toISOString().split('T')[0];

  const getFallback = (reason: string): CineStarEvent[] => {
    console.warn(`[CineStar Olomouc] Fallback: ${reason}`);
    return [{
      title: 'Kino CineStar Olomouc',
      location: LOCATION,
      source_url: SOURCE_URL,
      date: today,
      cinema_listings: [
        { film_title: 'Program kina momentálně nedostupný', showtimes: 'Zkontrolujte web', url: SOURCE_URL }
      ]
    }];
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

    console.log('[CineStar Olomouc] Načítám stránku (networkidle2)...');
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle2', timeout: 45000 });

    // Tvrdé čekání pro asynchronní načítání CSR obsahu
    await new Promise(r => setTimeout(r, 3000));

    // Čekáme jen na tělo stránky
    try {
      await page.waitForSelector('body', { timeout: 15000 });
      console.log('[CineStar Olomouc] Stránka načtena.');
    } catch {
      console.warn('[CineStar Olomouc] Timeout — pokračuji s dostupným HTML.');
    }

    const html = await page.content();
    await browser.close();
    browser = undefined;

    // Kontrola blokace
    if (html.includes('Vercel Security Checkpoint') || html.includes("We're verifying your browser")) {
      return getFallback('Blokován Vercel Security Checkpoint');
    }

    const $ = cheerio.load(html);
    // Mapa: název filmu → pole časů
    const filmMap = new Map<string, Set<string>>();

    // Čistí název filmu: oddělí spojínky jako 'Název80 min' → 'Název (80 min)'
    const cleanFilmTitle = (raw: string): string => {
      return raw
        .replace(/(\D)(\d+)\s*min\b/gi, '$1 ($2 min)')
        .replace(/\s{2,}/g, ' ')
        .trim();
    };

    $('h3, h4, h2, a[href*="/film/"], a[href*="/movie/"]').each((_i, el) => {
      const parent = $(el).closest('article, div[class*="item" i], div[class*="card" i], div[class*="program" i], li, section');
      if (parent.length === 0) return;

      const titleEl = parent.find('h2, h3, h4, [class*="title" i], [class*="name" i]').first();
      let rawTitle = titleEl.text().trim();
      if (!rawTitle) {
         rawTitle = $(el).text().trim();
      }
      
      const filmTitle = cleanFilmTitle(rawTitle);
      if (!filmTitle || filmTitle.length < 2) return;

      const containerText = parent.text();

      const timeMatches = containerText.match(/\b(\d{1,2}[:.]\d{2})\b/g) || [];
      const times = new Set<string>(
        timeMatches.filter(t => {
          const [hStr, mStr] = t.split(/[:.]/);
          const h = Number(hStr);
          const m = Number(mStr);
          return h >= 0 && h <= 23 && m >= 0 && m <= 59;
        }).map(t => t.replace('.', ':'))
      );

      if (!filmMap.has(filmTitle)) filmMap.set(filmTitle, new Set());
      times.forEach(t => filmMap.get(filmTitle)!.add(t));
    });

    if (filmMap.size === 0) {
      const bodyText = $('body').text();
      const timeMatches = bodyText.match(/\b\d{1,2}:\d{2}\b/g) || [];
      if (timeMatches.length > 0) {
        filmMap.set('Aktuální program CineStar Olomouc', new Set(timeMatches.slice(0, 10)));
      }
    }

    if (filmMap.size === 0) {
      return getFallback('Extrakce selhala (žádné filmy)');
    }

    const cleanTitle = (raw: string): string => {
      return raw
        .replace(/(\D)(\d+)\s*min\b/gi, '$1 ($2 min)')
        .replace(/\s*\(?\d{1,2}\+\)?/g, '')
        .replace(/\bP\u0159edprodej\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    };

    const listings: CineStarListing[] = [];
    filmMap.forEach((timesSet, rawTitle) => {
      const sortedTimes = Array.from(timesSet).sort();
      listings.push({
        film_title: cleanTitle(rawTitle),
        showtimes: sortedTimes.length > 0 ? sortedTimes.join(', ') : 'Časy na webu',
        url: SOURCE_URL
      });
    });

    listings.sort((a, b) => {
      const countA = a.showtimes.split(',').length;
      const countB = b.showtimes.split(',').length;
      return countB - countA;
    });

    const result: CineStarEvent = {
      title: 'Kino CineStar Olomouc',
      location: LOCATION,
      source_url: SOURCE_URL,
      date: today,
      cinema_listings: listings.slice(0, 8)
    };

    console.log(`[CineStar Olomouc] ✅ Úspěch! ${listings.length} filmů s časy agregováno do 1 události.`);
    return [result];

  } catch (error) {
    console.error('[CineStar Olomouc] Fatální chyba:', error);
    if (browser) await browser.close();
    return getFallback(`Výjimka: ${(error as Error).message}`);
  }
}
