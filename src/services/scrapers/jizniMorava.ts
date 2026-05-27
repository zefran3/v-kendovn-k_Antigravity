import puppeteer from 'puppeteer';

interface ScrapedEvent { title: string; date: string; description: string; source_url: string; }

const BASE_URL = 'https://www.jizni-morava.cz';

/**
 * Scraper Jižní Morava — Kalendář akcí.
 *
 * Opravená URL: /cz/kalendar-akci/ (ne /cz/akce/ která je prázdná)
 * Obsah akcí je renderovaný JavaScriptem — Puppeteer čeká na konkrétní selektory.
 */
export async function scrapeJizniMorava(): Promise<ScrapedEvent[]> {
  const url = `${BASE_URL}/cz/kalendar-akci/`;

  try {
    console.log('[JižníMorava] Spouštím Puppeteer...');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'cs-CZ,cs;q=0.9' });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    // Stránka načítá akce přes AJAX — čekáme déle
    await new Promise(r => setTimeout(r, 5000));

    // Pokusíme se počkat na elementy s akcemi
    try {
      await page.waitForSelector(
        '.b-event, .event-item, .event-card, article, .item, [class*="event"], [class*="akce"], [class*="card"]',
        { timeout: 8000 }
      );
    } catch {
      console.warn('[JižníMorava] Timeout čekání na selektory — pokračuji s tím co je.');
    }

    const events = await page.evaluate((baseUrl: string) => {
      const results: any[] = [];

      // ── Strategie A: Typické selektory pro bootstrap/cms weby ─────────────
      const cardSelectors = [
        '.b-event',
        '.event-item',
        '.event-card',
        '.list-item',
        '.article-item',
        'article',
        '.card',
        'li.item',
        '[class*="event"]',
        '[class*="akce"]',
      ];

      let cards: Element[] = [];
      for (const sel of cardSelectors) {
        const found = Array.from(document.querySelectorAll(sel)).filter(el => {
          // Filtrujeme navigační elementy — musí obsahovat link a text
          const hasLink = el.querySelector('a[href]');
          const text = el.textContent?.trim() || '';
          return hasLink && text.length > 10;
        });
        if (found.length >= 2) {
          cards = found;
          break;
        }
      }

      // ── Strategie B: Fallback — hledáme všechny linky s textem ──────────
      if (cards.length === 0) {
        const allLinks = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
        const eventLinks = allLinks.filter(a => {
          const href = a.getAttribute('href') || '';
          const text = a.textContent?.trim() || '';
          // Hledáme linky vedoucí na detail akce (obsahují "akce" nebo datum v URL)
          return (
            (href.includes('/akce/') || href.includes('/kalendar/') || href.includes('/event/')) &&
            text.length > 5 &&
            text.length < 200
          );
        });

        for (const link of eventLinks.slice(0, 10)) {
          const href = link.getAttribute('href') || '';
          const url = href.startsWith('http') ? href : baseUrl + (href.startsWith('/') ? '' : '/') + href;
          results.push({
            title: link.textContent?.trim() || '',
            date: '',
            description: '',
            source_url: url,
          });
        }

        return results;
      }

      // Zpracujeme nalezené karty
      for (const card of cards.slice(0, 12)) {
        const titleEl = card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="nadpis"], [class*="name"]');
        const linkEl = card.querySelector('a[href]') as HTMLAnchorElement | null;
        const dateEl = card.querySelector('[class*="date"], [class*="datum"], time, [class*="when"]');
        const descEl = card.querySelector('[class*="desc"], [class*="perex"], [class*="text"], p');

        const rawTitle = titleEl?.textContent?.trim() || linkEl?.textContent?.trim() || '';
        if (!rawTitle || rawTitle.length < 3) continue;

        let url = linkEl?.getAttribute('href') || '';
        if (url && !url.startsWith('http')) {
          url = baseUrl + (url.startsWith('/') ? '' : '/') + url;
        }

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

    const validEvents = events.filter((e: any) => e.title && e.title.length > 2);
    console.log(`[JižníMorava] ✅ Nalezeno ${validEvents.length} akcí.`);
    return validEvents as ScrapedEvent[];

  } catch (error) {
    console.error('[JižníMorava] Chyba scraperu:', error);
    return [];
  }
}
