import * as cheerio from 'cheerio';
import * as fs from 'fs';

function main() {
  const html = fs.readFileSync('cinestar_olomouc.html', 'utf8');
  const $ = cheerio.load(html);

  console.log('--- DUMPING FIRST 5 CARDS HTML ---');
  const cards = $('.swiper-card');
  cards.slice(0, 5).each((idx, el) => {
    console.log(`\n--- Card ${idx} ---`);
    console.log($.html(el));
  });
}

main();
