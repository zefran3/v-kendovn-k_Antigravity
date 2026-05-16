import puppeteer from 'puppeteer';
import { ScrapedEvent } from '../../types';

export async function scrapeJizniMorava(): Promise<ScrapedEvent[]> {
  const url = 'https://www.jizni-morava.cz/cz/akce/';
  const baseUrl = 'https://www.jizni-morava.cz';
  
  try {
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true
    });
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Hard wait for dynamic loading
    await new Promise(r => setTimeout(r, 2000));

    const events = await page.evaluate((baseUrl) => {
      // Selector based on typical Jizni Morava card structure
      const cards = Array.from(document.querySelectorAll('.card, .event-item, .item-list__item'));
      
      return cards.slice(0, 10).map(card => {
        const titleEl = card.querySelector('.card-title, .title, h3');
        const dateEl = card.querySelector('.card-date, .date, .time');
        const linkEl = card.querySelector('a') as HTMLAnchorElement;
        const descEl = card.querySelector('.card-text, .description, .perex');

        let sourceUrl = linkEl?.getAttribute('href') || '';
        if (sourceUrl && !sourceUrl.startsWith('http')) {
          sourceUrl = baseUrl + (sourceUrl.startsWith('/') ? '' : '/') + sourceUrl;
        }

        return {
          title: titleEl?.textContent?.trim() || 'Bez názvu',
          date: dateEl?.textContent?.trim() || 'Datum neuvedeno',
          description: descEl?.textContent?.trim() || '',
          source_url: sourceUrl
        };
      });
    }, baseUrl);

    await browser.close();
    return events;
  } catch (error) {
    console.error('Error scraping Jižní Morava:', error);
    return [];
  }
}
