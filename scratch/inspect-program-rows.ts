import * as cheerio from 'cheerio';
import * as fs from 'fs';

function main() {
  const html = fs.readFileSync('scratch/cinestar_program.html', 'utf8');
  const $ = cheerio.load(html);

  console.log('--- SEARCHING FOR DAYS/SECTIONS ---');
  
  // Let's search for elements containing class with "row", "session", "show", "programme"
  // Let's print out the text and structure around movie titles
  // We saw 'grid-cols-programme-cinema' class
  const rows = $('[class*="grid-cols-programme-cinema" i]');
  console.log(`Found ${rows.length} grid-cols-programme-cinema rows.`);
  
  rows.slice(0, 10).each((idx, el) => {
    console.log(`\nRow ${idx}:`);
    const titleEl = $(el).find('a[href*="/filmy/movie/"] span').first();
    const title = titleEl.text().trim() || $(el).find('[class*="title" i]').text().trim();
    console.log(`  Movie Title: "${title}"`);
    
    // Find all links to websale inside this row
    const showtimes: { time: string; href: string }[] = [];
    $(el).find('a[href*="websale.cinestar.cz"]').each((_, linkEl) => {
      const href = $(linkEl).attr('href') || '';
      const text = $(linkEl).text().trim();
      if (/\b\d{2}:\d{2}\b/.test(text)) {
        showtimes.push({ time: text, href });
      }
    });
    console.log(`  Showtimes:`, showtimes);
    
    // Let's see if this row is nested inside some day container or section
    let parent = $(el).parent();
    while (parent.length > 0) {
      const parentId = parent.attr('id') || '';
      const parentClass = parent.attr('class') || '';
      if (parentId || parentClass.includes('day') || parentClass.includes('date') || parentClass.includes('tab') || parentClass.includes('schedule')) {
        console.log(`  Parent Container: tag=${parent[0].tagName} id="${parentId}" class="${parentClass}"`);
      }
      parent = parent.parent();
    }
  });
}

main();
