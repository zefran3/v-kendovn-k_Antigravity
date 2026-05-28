import * as fs from 'fs';

function main() {
  const data = JSON.parse(fs.readFileSync('resolved-cinema-page-data.json', 'utf8'));
  const comp = data.componentsBuilder[4];
  
  console.log('--- COMPONENT 4 FULL DETAIL ---');
  console.log(JSON.stringify(comp, null, 2));
}

main();
