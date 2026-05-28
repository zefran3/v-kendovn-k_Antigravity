import * as cheerio from 'cheerio';
import * as fs from 'fs';

function main() {
  const html = fs.readFileSync('cinestar_olomouc.html', 'utf8');
  const $ = cheerio.load(html);
  
  const scripts = $('script');
  const script10Text = $(scripts[10]).text();
  
  fs.writeFileSync('script10-raw.js', script10Text);
  console.log('Saved Script 10 raw text. Length:', script10Text.length);
  
  // Let's log some snippets or analyze if it contains movies/showtimes
  // Look for titles like "Mandalorian", "Pět švestek", "Lumpík"
  const titles = ["Mandalorian", "Pět švestek", "Lumpík", "rybka"];
  for (const title of titles) {
    const idx = script10Text.indexOf(title);
    if (idx !== -1) {
      console.log(`Found "${title}" at index ${idx}. Context: ${script10Text.substring(idx - 100, idx + 200)}`);
    } else {
      console.log(`"${title}" not found in script 10.`);
    }
  }
}

main();
