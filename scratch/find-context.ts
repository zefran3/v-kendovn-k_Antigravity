import * as cheerio from 'cheerio';
import * as fs from 'fs';

function main() {
  const html = fs.readFileSync('cinestar_olomouc.html', 'utf8');
  const $ = cheerio.load(html);
  const bodyText = $('body').text();

  const days = ['středa', 'úterý', 'neděle'];
  days.forEach(d => {
    console.log(`\n--- Context for "${d}" ---`);
    let idx = bodyText.toLowerCase().indexOf(d);
    let count = 0;
    while (idx !== -1) {
      count++;
      const context = bodyText.substring(Math.max(0, idx - 40), Math.min(bodyText.length, idx + 40)).replace(/\s+/g, ' ');
      console.log(`Match ${count}: "${context}"`);
      idx = bodyText.toLowerCase().indexOf(d, idx + 1);
    }
  });
}

main();
