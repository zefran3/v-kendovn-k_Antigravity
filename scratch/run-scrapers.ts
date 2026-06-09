import { fetchMksVyskovProgram } from '../src/lib/cinemaScraper';
import { scrapeCineStarOlomouc } from '../src/lib/cineStarOlomouc';

async function main() {
  console.log('--- RUNNING MKS VYŠKOV SCRAPER ---');
  try {
    const mksResult = await fetchMksVyskovProgram();
    console.log(`MKS Vyškov returned ${mksResult.cinema.length} cinema entries and ${mksResult.events.length} other events.`);
    if (mksResult.cinema.length > 0) {
      console.log('First cinema entry listings count:', mksResult.cinema[0].cinema_listings.length);
      console.log('Sample listings:', JSON.stringify(mksResult.cinema[0].cinema_listings.slice(0, 5), null, 2));
    }
  } catch (err) {
    console.error('MKS Vyškov scraper failed:', err);
  }

  console.log('\n--- RUNNING CINESTAR OLOMOUC SCRAPER ---');
  try {
    const cineStarResult = await scrapeCineStarOlomouc();
    console.log(`CineStar Olomouc returned ${cineStarResult.length} entries.`);
    if (cineStarResult.length > 0) {
      console.log('First entry listings count:', cineStarResult[0].cinema_listings.length);
      console.log('Sample listings:', JSON.stringify(cineStarResult[0].cinema_listings.slice(0, 5), null, 2));
    }
  } catch (err) {
    console.error('CineStar Olomouc scraper failed:', err);
  }
}

main();
