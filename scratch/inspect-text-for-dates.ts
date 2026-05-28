import * as cheerio from 'cheerio';
import * as fs from 'fs';

function main() {
  const html = fs.readFileSync('cinestar_olomouc.html', 'utf8');
  const $ = cheerio.load(html);
  
  const textContent = $('body').text();
  console.log('Total text length:', textContent.length);
  
  // Look for day names or abbreviations
  const days = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle', 'Po ', 'Út ', 'St ', 'Čt ', 'Pá ', 'So ', 'Ne '];
  days.forEach(day => {
    let count = 0;
    let idx = textContent.indexOf(day);
    while (idx !== -1) {
      count++;
      if (count <= 5) {
        console.log(`Found "${day}" context: "${textContent.substring(Math.max(0, idx - 30), Math.min(textContent.length, idx + 50)).replace(/\s+/g, ' ')}"`);
      }
      idx = textContent.indexOf(day, idx + 1);
    }
    if (count > 0) {
      console.log(`Total matches for "${day}": ${count}`);
    }
  });

  // Look for date patterns like "28.5" or "28. 5" or "28.05"
  const regexes = [
    /\b\d{1,2}\.\s*\d{1,2}\./g,
    /\b\d{4}-\d{2}-\d{2}\b/g
  ];
  
  regexes.forEach((re, rIdx) => {
    console.log(`\n--- Regex ${rIdx} ---`);
    const matches = textContent.match(re);
    if (matches) {
      console.log(`Found ${matches.length} matches. Unique:`, Array.from(new Set(matches)).slice(0, 15));
    } else {
      console.log(`No matches for regex.`);
    }
  });
}

main();
