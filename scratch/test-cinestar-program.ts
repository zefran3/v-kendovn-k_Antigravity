import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import * as fs from 'fs';

async function main() {
  const url = 'https://cinestar.cz/cz/olomouc/program';
  console.log(`Launching browser to fetch ${url}...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    });

    console.log('Navigating...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    console.log('Waiting 4 seconds...');
    await new Promise(r => setTimeout(r, 4000));

    const html = await page.content();
    fs.writeFileSync('scratch/cinestar_program.html', html);
    console.log(`Saved ${html.length} bytes to scratch/cinestar_program.html`);

    const $ = cheerio.load(html);
    console.log('Page Title:', $('title').text().trim());

    // Check for day headers or elements containing dates
    console.log('\nPossible Date Headings:');
    $('[class*="date" i], [class*="day" i], h2, h3, h4').each((idx, el) => {
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (text.length > 0 && text.length < 100 && /(po|út|st|čt|pá|so|ne|\d{1,2}\.)/i.test(text)) {
        console.log(`[${el.tagName}] class="${$(el).attr('class') || ''}": "${text}"`);
      }
    });

    // Check how many .swiper-card or showtime elements exist
    const cards = $('.swiper-card');
    console.log(`\nFound ${cards.length} .swiper-card elements.`);

  } catch (err) {
    console.error('Error during scraping:', err);
  } finally {
    await browser.close();
  }
}

main();
