import * as fs from 'fs';

function main() {
  const text = fs.readFileSync('script10-raw.js', 'utf8');
  try {
    const data = JSON.parse(text);
    fs.writeFileSync('script10-formatted.json', JSON.stringify(data, null, 2));
    console.log('Successfully parsed Script 10 text as JSON and saved to script10-formatted.json');
  } catch (err: any) {
    console.error('Error parsing Script 10 text as JSON:', err.message);
  }
}

main();
