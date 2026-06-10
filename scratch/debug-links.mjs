import * as fs from 'fs';
import * as cheerio from 'cheerio';

const html = fs.readFileSync('cinestar_olomouc.html', 'utf8');
const $ = cheerio.load(html);

console.log('--- Odkazy na program/vstupenky ---');
$('a').each((i, el) => {
  const href = $(el).attr('href') || '';
  const text = $(el).text().trim();
  
  if (href.includes('websale') || href.includes('tickets') || href.includes('vstupenky') || /\d{2}:\d{2}/.test(text)) {
    console.log(`Text: "${text}" | Href: "${href}"`);
  }
});
