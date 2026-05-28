import * as fs from 'fs';

function main() {
  const jsonText = fs.readFileSync('script10-formatted.json', 'utf8');
  const arr = JSON.parse(jsonText);
  
  console.log('--- SEARCHING FOR SCREENING OBJECTS IN NUXT STATE ---');
  
  // Find objects with keys like 'movieId', 'date', 'time', 'showtime', 'event', 'screening'
  let found = 0;
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const keys = Object.keys(item);
      const isScreeningObj = keys.some(k => 
        /movieId|showtime|eventid|performance|screening/i.test(k) || 
        (k === 'date' && typeof item[k] === 'number')
      );
      
      if (isScreeningObj) {
        found++;
        if (found <= 50) {
          console.log(`Index ${i} typename="${item['__typename'] ? (typeof item['__typename'] === 'number' ? arr[item['__typename']] : item['__typename']) : ''}" keys:`, keys);
          console.log(`  Value:`, item);
        }
      }
    }
  }
  console.log(`Found ${found} screening-like objects.`);
}

main();
