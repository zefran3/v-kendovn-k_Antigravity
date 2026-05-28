import * as fs from 'fs';

function main() {
  const jsonText = fs.readFileSync('script10-formatted.json', 'utf8');
  const arr = JSON.parse(jsonText);
  
  console.log('Array length:', arr.length);
  
  // Find all string elements that match date patterns (e.g. YYYY-MM-DD or DD.MM.YYYY)
  console.log('\n--- Date patterns in array ---');
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (typeof item === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(item) || /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(item)) {
        console.log(`Index ${i}: String Date "${item}"`);
      }
    }
  }

  // Find objects containing keywords like date, time, screening, show, title, etc.
  console.log('\n--- Objects with date/time properties ---');
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const keys = Object.keys(item);
      const hasDateKey = keys.some(k => /date|datum|time|cas|show/i.test(k));
      if (hasDateKey) {
        console.log(`Index ${i} (typename="${item['__typename'] ? (typeof item['__typename'] === 'number' ? arr[item['__typename']] : item['__typename']) : ''}") keys:`, keys);
        // Print properties if not too big
        const cleanItem: any = {};
        for (const k of keys) {
          const val = item[k];
          cleanItem[k] = (typeof val === 'number' && val < arr.length) ? `Ref(${val}) -> ${JSON.stringify(arr[val]).substring(0, 100)}` : val;
        }
        console.log(`  Properties:`, cleanItem);
      }
    }
  }
}

main();
