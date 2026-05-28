import * as cheerio from 'cheerio';
import * as fs from 'fs';

function main() {
  const html = fs.readFileSync('cinestar_olomouc.html', 'utf8');
  const $ = cheerio.load(html);

  console.log('--- ALL BUTTONS AND LINKS TEXTS ---');
  $('button, a').each((i, el) => {
    const text = $(el).text().trim();
    if (text.length > 0 && text.length < 100) {
      console.log(`[${el.tagName}] class="${$(el).attr('class') || ''}": "${text}"`);
    }
  });

  console.log('\n--- ELEMENTS WITH DATE OR TIME OR DAY IN CLASS ---');
  $('[class*="date" i], [class*="day" i], [class*="calendar" i], [class*="time" i]').each((i, el) => {
    const text = $(el).text().trim();
    if (text.length > 0 && text.length < 150) {
      console.log(`[${el.tagName}] class="${$(el).attr('class') || ''}": "${text.substring(0, 80)}"`);
    }
  });
}

main();





