import * as cheerio from 'cheerio';
import * as fs from 'fs';

function main() {
  const html = fs.readFileSync('cinestar_olomouc.html', 'utf8');
  const $ = cheerio.load(html);

  console.log('--- ALL CARDS EXTRACTED ---');
  
  const cards = $('.swiper-card');
  console.log(`Found ${cards.length} cards.`);
  
  cards.each((idx, el) => {
    const title = $(el).find('p.mb-2').not('.opacity-80').text().trim();
    const time = $(el).find('p.mb-2.opacity-80').text().trim();
    const buyUrl = $(el).find('a:contains("Koupit vstupenky")').attr('href') || '';
    
    console.log(`Card ${idx}: Title="${title}" Time="${time}" Url="${buyUrl}"`);
  });
}

main();
