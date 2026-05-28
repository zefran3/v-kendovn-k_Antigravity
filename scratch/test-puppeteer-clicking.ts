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
    await page.setViewport({ width: 1366, height: 768 });

    console.log('Navigating...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    console.log('Waiting 3 seconds...');
    await new Promise(r => setTimeout(r, 3000));

    // Get all date buttons selectors
    const buttonSelector = '.screening-day-filter-day-button';
    const buttonsCount = await page.$$eval(buttonSelector, els => els.length);
    console.log(`Found ${buttonsCount} day buttons.`);

    const allEvents: any[] = [];

    for (let i = 0; i < buttonsCount; i++) {
      // Re-evaluate elements to avoid detached nodes
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
      console.log(`\nProcessing button ${i}: "${btnInfo.text}" (Selected: ${btnInfo.isSelected})`);

      // Click if not already selected
      if (!btnInfo.isSelected) {
        await page.evaluate((idx, sel) => {
          const btns = document.querySelectorAll(sel);
          const btn = btns[idx] as HTMLButtonElement;
          if (btn) btn.click();
        }, i, buttonSelector);
        // Wait for AJAX load
        await new Promise(r => setTimeout(r, 1500));
      }

      // Get page HTML and parse with cheerio
      const html = await page.content();
      const $ = cheerio.load(html);

      const dateStr = parseButtonDate(btnInfo.text);
      console.log(`Parsed Date: ${dateStr}`);

      const listings: any[] = [];
      const rows = $('[class*="grid-cols-programme-cinema" i]');
      console.log(`Found ${rows.length} rows for this day.`);

      rows.each((_, el) => {
        const titleEl = $(el).find('a[href*="/filmy/movie/"] span').first();
        let title = titleEl.text().trim();
        if (!title) {
          // Try other title selectors if needed
          title = $(el).find('h2, h3, h4, [class*="title" i]').text().trim().replace(/\s+/g, ' ');
        }
        if (!title) return;

        // Clean title
        title = title.replace(/(\D)(\d+)\s*min\b/gi, '$1 ($2 min)').trim();

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
            film_title: title,
            // Group showtimes as a comma-separated string
            showtimes: showtimes.map(s => s.time).join(', '),
            url: showtimes[0].url // First screening link
          });
        }
      });

      if (listings.length > 0) {
        allEvents.push({
          title: 'Kino CineStar Olomouc',
          location: 'CineStar Olomouc',
          source_url: url,
          date: dateStr,
          cinema_listings: listings
        });
      }
    }

    console.log('\n--- FINAL SCRAPED EVENTS ---');
    console.log(JSON.stringify(allEvents, null, 2));

  } catch (err) {
    console.error('Error in clicking process:', err);
  } finally {
    await browser.close();
  }
}

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

  // Format: "So 30. 5." or "Po 1. 6."
  const match = text.match(/(\d{1,2})\.\s*(\d{1,2})\./);
  if (match) {
    const day = match[1].padStart(2, '0');
    const m = match[2].padStart(2, '0');
    // Simple year assignment, handling year rollover if needed
    // (if today is Dec, and button is Jan, year = year + 1)
    let y = year;
    const btnMonth = parseInt(m, 10);
    if (month === 12 && btnMonth === 1) {
      y = year + 1;
    } else if (month === 1 && btnMonth === 12) {
      y = year - 1; // unlikely but safe
    }
    return `${y}-${m}-${day}`;
  }

  return today.toISOString().split('T')[0];
}

main();
