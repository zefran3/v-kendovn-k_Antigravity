import * as cheerio from 'cheerio';
import * as fs from 'fs';

function main() {
  const html = fs.readFileSync('scratch/cinestar_program.html', 'utf8');
  const $ = cheerio.load(html);

  console.log('--- INSPECTING SCREENINGS ON PROGRAM PAGE ---');

  // Let's find any containers that seem to hold movies
  // E.g. find elements containing "Pět švestek" or "Lumpík Špuntík" or "Backrooms"
  const titles = ['Pět švestek', 'Lumpík Špuntík', 'Backrooms', 'Mandalorian'];
  titles.forEach(t => {
    console.log(`\nSearching for movie: "${t}"`);
    const elements = $(`*:contains("${t}")`);
    console.log(`Found ${elements.length} elements containing "${t}".`);
    
    // Find the smallest element (leaf) containing the title
    let smallestEl: any = null;
    let smallestLen = Infinity;
    elements.each((_, el) => {
      const text = $(el).text().trim();
      if (text.length < smallestLen) {
        smallestLen = text.length;
        smallestEl = el;
      }
    });

    if (smallestEl) {
      console.log(`Smallest tag: [${smallestEl.tagName}] class="${$(smallestEl).attr('class') || ''}" Text: "${$(smallestEl).text().trim().substring(0, 100)}"`);
      // Print parent chain
      let parent = $(smallestEl).parent();
      for (let i = 0; i < 4; i++) {
        if (parent.length === 0) break;
        console.log(`  Parent ${i}: [${parent[0].tagName}] class="${parent.attr('class') || ''}"`);
        parent = parent.parent();
      }
    }
  });

  // Let's search for websale links
  const websaleLinks = $('a[href*="websale.cinestar.cz"]');
  console.log(`\nFound ${websaleLinks.length} websale links.`);
  websaleLinks.slice(0, 10).each((idx, el) => {
    console.log(`Link ${idx}: Href="${$(el).attr('href')}" Text="${$(el).text().trim().replace(/\s+/g, ' ')}"`);
  });
}

main();
