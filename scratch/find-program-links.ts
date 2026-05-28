import * as cheerio from 'cheerio';
import * as fs from 'fs';

function main() {
  const html = fs.readFileSync('cinestar_olomouc.html', 'utf8');
  const $ = cheerio.load(html);

  console.log('--- SEARCHING FOR LINKS ---');
  $('a').each((idx, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (href.includes('program') || text.toLowerCase().includes('program')) {
      console.log(`Text="${text}" Href="${href}"`);
    }
  });
}

main();
