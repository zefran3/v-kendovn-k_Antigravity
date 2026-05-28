import * as cheerio from 'cheerio';
import * as fs from 'fs';

function main() {
  const html = fs.readFileSync('cinestar_olomouc.html', 'utf8');
  const $ = cheerio.load(html);

  console.log('Page Title:', $('title').text().trim());
  console.log('Canonical URL:', $('link[rel="canonical"]').attr('href'));
  
  // Let's look for dates or headers that look like dates
  console.log('\nLooking for date/day text patterns:');
  const dateRegex = /\b\d{1,2}\.\s*\d{1,2}\./g;
  $('div, span, p, h1, h2, h3, h4').each((idx, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (text.length > 0 && text.length < 50 && dateRegex.test(text)) {
      console.log(`[${el.tagName}]: "${text}"`);
    }
  });

  // Let's count how many times different words appear
  console.log('\nOccurrence counts:');
  const bodyText = $('body').text();
  const words = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle', 'dnes', 'zítra'];
  words.forEach(w => {
    const count = (bodyText.match(new RegExp(w, 'gi')) || []).length;
    console.log(`${w}: ${count}`);
  });
}

main();
