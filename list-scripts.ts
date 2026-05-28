import * as cheerio from 'cheerio';
import * as fs from 'fs';

function main() {
  const html = fs.readFileSync('cinestar_olomouc.html', 'utf8');
  const $ = cheerio.load(html);
  
  console.log('--- ALL SCRIPT TAGS ---');
  $('script').each((i, el) => {
    const src = $(el).attr('src') || 'inline';
    const text = $(el).text();
    console.log(`Script ${i}: src="${src}" length=${text.length} start="${text.substring(0, 150).replace(/\s+/g, ' ')}"`);
  });
}

main();
