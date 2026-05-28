import * as fs from 'fs';

function main() {
  const jsonText = fs.readFileSync('script10-formatted.json', 'utf8');
  const arr = JSON.parse(jsonText);
  
  console.log('JSON array length:', arr.length);
  
  // Usually, Nuxt 3 devalue JSON payload starts with an array where:
  // - Index 0: Meta/ShallowReactive types mapping
  // - Index 1: The root object containing "data", "state", "once", etc.
  // Let's inspect the keys of Index 1:
  const root = arr[1];
  console.log('Root object keys:', Object.keys(root));
  
  // If there is "data" or "state", let's inspect them:
  if (root.data !== undefined) {
    const dataIdx = root.data;
    console.log('root.data value/index:', dataIdx);
    const dataObj = arr[dataIdx];
    console.log('Data object keys:', Object.keys(dataObj));
    
    // Look at dataObj keys. Let's see what keys are in arr[dataIdx] (which is dataObj)
    for (const key of Object.keys(dataObj)) {
      const valIdx = dataObj[key];
      const val = arr[valIdx];
      console.log(`  key="${key}" -> index=${valIdx} type=${typeof val} isArray=${Array.isArray(val)}`);
      if (typeof val === 'object' && val !== null) {
        console.log(`    keys:`, Object.keys(val));
      }
    }
  }
  
  // Let's search the entire array for interesting keys like "screenings", "programme", "shows", "date", "movie"
  console.log('\n--- Searching array elements for keys or values ---');
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item && typeof item === 'object') {
      const keys = Object.keys(item);
      if (keys.some(k => /screening|programme|showtimes|movie|schedule/i.test(k))) {
        console.log(`Index ${i} has interesting keys:`, keys);
        // Print first 5 properties
        const snippet: any = {};
        keys.slice(0, 5).forEach(k => {
          snippet[k] = item[k];
        });
        console.log(`  Snippet:`, snippet);
      }
    }
  }
}

main();
