import { scrapeCineStarOlomouc } from '../src/lib/cineStarOlomouc';
import { fetchMksVyskovProgram } from '../src/lib/cinemaScraper';

async function run() {
  console.log("=== SCRAPING CINESTAR OLOMOUC ===");
  const cineStarData = await scrapeCineStarOlomouc();
  console.log(`Total days scraped for CineStar: ${cineStarData.length}`);
  cineStarData.forEach(day => {
    console.log(`\nDate: ${day.date}`);
    console.log(`Number of films: ${day.cinema_listings?.length}`);
    day.cinema_listings?.slice(0, 5).forEach((f, idx) => {
      console.log(`  ${idx + 1}. ${f.film} (${f.time})`);
    });
    if (day.cinema_listings && day.cinema_listings.length > 5) {
      console.log(`  ... and ${day.cinema_listings.length - 5} more films.`);
    }
  });

  console.log("\n=== SCRAPING MKS VYŠKOV ===");
  const mksResult = await fetchMksVyskovProgram();
  const mksCinema = mksResult.cinema || [];
  console.log(`Total days scraped for MKS: ${mksCinema.length}`);
  mksCinema.forEach((day: any) => {
    console.log(`\nDate: ${day.date}`);
    console.log(`Number of films: ${day.cinema_listings?.length}`);
    day.cinema_listings?.forEach((f: any, idx: number) => {
      console.log(`  ${idx + 1}. ${f.film} (${f.time})`);
    });
  });
}

run().catch(console.error);
