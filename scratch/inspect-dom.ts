import * as cheerio from 'cheerio';
import * as fs from 'fs';

function main() {
  const html = fs.readFileSync('cinestar_olomouc.html', 'utf8');
  const $ = cheerio.load(html);

  console.log('--- SEARCHING FOR CALENDAR/DATE TABS & SECTIONS ---');

  // Let's find any buttons or tabs that look like dates (e.g. contain day names like Po, Út, St, Čt, Pá, So, Ne or numbers like 28., 29., 30.)
  console.log('\n--- Day/Date buttons/links ---');
  $('button, a, div, span').each((i, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    // Match date patterns like "Pá 29. 5." or similar
    if (/^(Po|Út|St|Čt|Pá|So|Ne)\s+\d{1,2}\.\s*\d{1,2}\./i.test(text) && text.length < 30) {
      console.log(`[${el.tagName}] class="${$(el).attr('class') || ''}": "${text}"`);
      // Let's see if this has custom attribute for date or if it is a tab
      console.log(`  Attributes:`, el.attribs);
    }
  });

  // Let's find headings (h1, h2, h3, h4) that could denote a day/date
  console.log('\n--- Headings ---');
  $('h1, h2, h3, h4').each((i, el) => {
    console.log(`[${el.tagName}] class="${$(el).attr('class') || ''}": "${$(el).text().trim()}"`);
  });

  // Let's search for "active" tabs or calendar sections
  console.log('\n--- Calendar wrapper elements ---');
  $('[class*="calendar" i], [class*="date" i], [class*="tab" i]').each((i, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (text.length > 0 && text.length < 150) {
      console.log(`[${el.tagName}] class="${$(el).attr('class') || ''}": "${text.substring(0, 100)}"`);
    }
  });
}

main();
