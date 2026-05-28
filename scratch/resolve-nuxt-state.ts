import * as fs from 'fs';

function main() {
  const jsonText = fs.readFileSync('script10-formatted.json', 'utf8');
  const arr = JSON.parse(jsonText);
  
  console.log('Array length:', arr.length);
  
  // Find which element in the array contains the key '$scinemaPageData'
  let targetIndex = -1;
  let targetKey = '';
  
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      if ('$scinemaPageData' in item) {
        targetIndex = i;
        targetKey = '$scinemaPageData';
        break;
      }
    }
  }
  
  if (targetIndex === -1) {
    console.log('Could not find $scinemaPageData key in any object. Searching for scinemaPageData (without $)...');
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        for (const k of Object.keys(item)) {
          if (k.includes('cinemaPageData')) {
            targetIndex = i;
            targetKey = k;
            break;
          }
        }
      }
      if (targetIndex !== -1) break;
    }
  }
  
  if (targetIndex === -1) {
    console.log('Failed to find target key in array.');
    return;
  }
  
  console.log(`Found target key "${targetKey}" in object at index ${targetIndex}`);
  const root = arr[targetIndex];
  const refIndex = root[targetKey];
  console.log(`Target reference index: ${refIndex}`);
  
  // Recursively resolve reference indexes in the array
  const cache = new Map<number, any>();
  
  function resolve(index: any): any {
    if (typeof index !== 'number') {
      return index;
    }
    if (index < 0 || index >= arr.length) {
      return index;
    }
    if (cache.has(index)) {
      return cache.get(index); // This handles circular references cleanly by returning the cached object/array reference
    }
    
    const val = arr[index];
    if (val === null || val === undefined) {
      return val;
    }
    
    if (Array.isArray(val)) {
      const resArr: any[] = [];
      cache.set(index, resArr);
      for (const item of val) {
        resArr.push(resolve(item));
      }
      return resArr;
    }
    
    if (typeof val === 'object') {
      const resObj: any = {};
      cache.set(index, resObj);
      for (const key of Object.keys(val)) {
        resObj[key] = resolve(val[key]);
      }
      return resObj;
    }
    
    cache.set(index, val);
    return val;
  }
  
  const resolvedData = resolve(refIndex);
  fs.writeFileSync('resolved-cinema-page-data.json', JSON.stringify(resolvedData, null, 2));
  console.log('Saved resolved data to resolved-cinema-page-data.json');
}

main();
