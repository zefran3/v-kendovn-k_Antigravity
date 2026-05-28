import * as fs from 'fs';

function main() {
  const jsonText = fs.readFileSync('script10-formatted.json', 'utf8');
  const arr = JSON.parse(jsonText);
  
  console.log('--- INSPECTING SCREENINGS ---');
  
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item && typeof item === 'object') {
      const typeVal = item['__typename'];
      // Resolve reference if it's a number pointing to a string in the array
      let typeStr = '';
      if (typeof typeVal === 'number') {
        const resolved = arr[typeVal];
        if (typeof resolved === 'string') {
          typeStr = resolved;
        }
      } else if (typeof typeVal === 'string') {
        typeStr = typeVal;
      }
      
      if (typeStr && typeStr.toLowerCase().includes('screening')) {
        console.log(`Index ${i}: typename="${typeStr}" keys:`, Object.keys(item));
        console.log(`  Properties:`, item);
      }
    }
  }

  // Let's look at index 532
  console.log('\n--- Index 532 ---');
  console.log(arr[532]);
}

main();

