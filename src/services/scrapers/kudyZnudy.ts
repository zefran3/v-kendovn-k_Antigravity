import puppeteer from 'puppeteer';

interface ScrapedEvent { title: string; date: string; description: string; source_url: string; }

const BASE_URL = 'https://www.kudyznudy.cz';

/**
 * Scraper Kudy z nudy — Jihomoravský kraj.
 *
 * Strategie 1: Puppeteer s BEM selektory (.b-card) — pro JS-renderovaný obsah.
 * Strategie 2: Fetch fallback — hledáme <a href="/akce/..."> linky s jejich textovým kontextem.
 *
 * DŮLEŽITÉ: source_url vždy obsahuje URL konkrétní akce, nikoliv základní stránku webu.
 */
export async function scrapeKudyZnudy(): Promise<ScrapedEvent[]> {
  const calendarUrl = `${BASE_URL}/kalendar-akci?region=jihomoravsky-kraj`;

  try {
    console.log('[KudyZNudy] Spouštím Puppeteer...');
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true,
    });
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'cs-CZ,cs;q=0.9' });

    await page.goto(calendarUrl, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 4000));

    const events = await page.evaluate((baseUrl: string) => {
      const results: any[] = [];

      // ── Strategie A: BEM selektory pro KudyZNudy layout ─────────────────
      const cardSelectors = [
        '.b-card',
        '.b-tiles__item',
        '.b-list__item',
        '.item-event',
        'article[class*="card"]',
        'article[class*="item"]',
      ];

      let cards: Element[] = [];
      for (const sel of cardSelectors) {
        const found = Array.from(document.querySelectorAll(sel));
        if (found.length > 0) { cards = found; break; }
      }

      for (const card of cards.slice(0, 12)) {
        const titleEl = card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="name"], [class*="nadpis"]');
        const linkEl = card.querySelector('a[href]') as HTMLAnchorElement | null;
        const dateEl = card.querySelector('[class*="date"], [class*="datum"], time, [class*="when"]');
        const descEl = card.querySelector('[class*="desc"], [class*="perex"], [class*="text"], p');

        const rawTitle = titleEl?.textContent?.trim() || linkEl?.textContent?.trim() || '';
        if (!rawTitle || rawTitle.length < 3) continue;

        let url = linkEl?.getAttribute('href') || '';
        if (url && !url.startsWith('http')) {
          url = baseUrl + (url.startsWith('/') ? '' : '/') + url;
        }

        // Přeskočíme pokud URL vede na základní stránku
        if (url === baseUrl || url === baseUrl + '/') continue;

        results.push({
          title: rawTitle,
          date: dateEl?.textContent?.trim() || '',
          description: descEl?.textContent?.trim() || '',
          source_url: url,
        });
      }

      return results;
    }, BASE_URL);

    await browser.close();

    if (events.length > 0) {
      console.log(`[KudyZNudy] ✅ Puppeteer: nalezeno ${events.length} akcí.`);
      return events as ScrapedEvent[];
    }

    console.warn('[KudyZNudy] Puppeteer nenašel akce, zkouším fetch fallback...');
    return await fetchKudyZNudyViaFetch();

  } catch (error) {
    console.error('[KudyZNudy] Chyba Puppeteer:', error);
    try {
      return await fetchKudyZNudyViaFetch();
    } catch (e2) {
      console.error('[KudyZNudy] Fetch fallback také selhal:', e2);
      return [];
    }
  }
}

/**
 * Fallback: plain fetch — hledáme <a href="/akce/..."> nebo <a href="/kalendar-akci/...">
 * s jejich textovým obsahem jako titulkem. Každá URL musí být URL konkrétní akce.
 */
async function fetchKudyZNudyViaFetch(): Promise<ScrapedEvent[]> {
  const urls = [
    `${BASE_URL}/kalendar-akci?region=jihomoravsky-kraj`,
    `${BASE_URL}/kalendar-akci`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'cs-CZ,cs;q=0.9',
        },
      });
      if (!res.ok) continue;
      const html = await res.text();

      // Hledáme linky na konkrétní akce — formát /akce/nazev-akce nebo /kalendar-akci/nazev
      // Regex zachytí href + okolní text (titulek z <a> nebo blízkého h2/h3)
      const events: ScrapedEvent[] = [];
      const seen = new Set<string>();

      // Pattern: <a href="/akce/SLUG">TITULEK</a> nebo podobné
      const linkPattern = /href="(\/(?:akce|kalendar-akci)\/[^"]{5,100})"[^>]*>([^<]{3,150})</g;
      let m;
      while ((m = linkPattern.exec(html)) !== null) {
        const slug = m[1];
        const linkText = m[2].trim().replace(/\s+/g, ' ');

        // Přeskočíme navigační linky (krátký text, pouze /akce/ bez dalšího slugu)
        if (slug === '/akce/' || slug === '/kalendar-akci/') continue;
        if (linkText.length < 4 || linkText.length > 120) continue;
        if (seen.has(slug)) continue;
        seen.add(slug);

        const fullUrl = `${BASE_URL}${slug}`;

        events.push({
          title: linkText,
          date: '',  // Datum necháme prázdné — AI použije datum víkendu
          description: `Akce v Jihomoravském kraji – ${linkText}`,
          source_url: fullUrl,
        });

        if (events.length >= 10) break;
      }

      if (events.length > 0) {
        console.log(`[KudyZNudy] ✅ Fetch fallback: nalezeno ${events.length} akcí s URL.`);
        return events;
      }

    } catch (err) {
      console.error(`[KudyZNudy] Chyba při fetchi ${url}:`, err);
    }
  }

  console.warn('[KudyZNudy] Fetch fallback nenašel žádné akce.');
  return [];
}
