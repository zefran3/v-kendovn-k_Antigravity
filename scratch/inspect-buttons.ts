import * as cheerio from 'cheerio';
import * as fs from 'fs';

function main() {
  const html = fs.readFileSync('scratch/cinestar_program.html', 'utf8');
  const $ = cheerio.load(html);

  console.log('--- INSPECTING DAY BUTTONS ---');
  $('.screening-day-filter-day-button').each((idx, el) => {
    console.log(`\nButton ${idx}:`);
    console.log(`  Text: "${$(el).text().trim().replace(/\s+/g, ' ')}"`);
    console.log(`  Attributes:`, el.attribs);
  });
}

main();
