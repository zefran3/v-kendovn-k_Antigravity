import puppeteer from 'puppeteer';
import { ScrapedEvent } from '../../types';

export async function scrapeKudyZnudy(): Promise<ScrapedEvent[]> {
  const url = 'https://www.kudyznudy.cz/akce?region=jihomoravsky-kraj';
  const baseUrl = 'https://www.kudyznudy.cz';
  
  try {
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true
    });
    const page = await browser.newPage();
    
    // Set user agent to avoid basic blocking
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Hard wait for potential dynamic content
    await new Promise(r => setTimeout(r, 2000));

    const events = await page.evaluate((baseUrl) => {
      // Common selector for action cards on Kudy z nudy
      const cards = Array.from(document.querySelectorAll('.g-item, .item-event, article.item'));
      
      return cards.slice(0, 10).map(card => {
        const titleEl = card.querySelector('h2, h3, .title');
        const dateEl = card.querySelector('.date, .item-date, .calendar-date');
        const linkEl = card.querySelector('a') as HTMLAnchorElement;
        const descEl = card.querySelector('.description, .text, .perex');

        let sourceUrl = linkEl?.getAttribute('href') || '';
        if (sourceUrl && !sourceUrl.startsWith('http')) {
          sourceUrl = baseUrl + sourceUrl;
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
    console.error('Error scraping Kudy z nudy:', error);
    return [];
  }
}
