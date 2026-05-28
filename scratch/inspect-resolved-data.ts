import * as fs from 'fs';

function main() {
  const data = JSON.parse(fs.readFileSync('resolved-cinema-page-data.json', 'utf8'));
  
  console.log('Keys in data:', Object.keys(data));
  
  if (data.componentsBuilder) {
    console.log(`\nFound componentsBuilder array with ${data.componentsBuilder.length} items:`);
    data.componentsBuilder.forEach((comp: any, idx: number) => {
      console.log(`\n--- Component ${idx} ---`);
      console.log('__typename:', comp.__typename);
      console.log('Keys:', Object.keys(comp));
      
      // If it's component_BlockType or contains items/screenings/movies/schedule, let's explore it:
      if (comp.items) {
        console.log(`  comp.items count: ${Array.isArray(comp.items) ? comp.items.length : typeof comp.items}`);
        if (Array.isArray(comp.items) && comp.items.length > 0) {
          console.log(`  First item __typename:`, comp.items[0].__typename);
          console.log(`  First item keys:`, Object.keys(comp.items[0]));
          
          // Print details of the first item
          if (comp.items[0].__typename && comp.items[0].__typename.includes('screening')) {
            console.log(`  First item snippet:`, JSON.stringify(comp.items[0], null, 2).substring(0, 1000));
          }
        }
      }
    });
  }
}

main();
