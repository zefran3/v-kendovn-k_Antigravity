import * as cheerio from 'cheerio';
import * as fs from 'fs';

function main() {
  const html = fs.readFileSync('cinestar_olomouc.html', 'utf8');
  const $ = cheerio.load(html);
  
  let nuxtScriptContent = '';
  $('script').each((i, el) => {
    const text = $(el).text();
    if (text.includes('window.__NUXT__')) {
      nuxtScriptContent = text;
    }
  });
  
  if (!nuxtScriptContent) {
    console.log('No window.__NUXT__ script found.');
    return;
  }
  
  console.log('Found __NUXT__ script, length:', nuxtScriptContent.length);
  
  // Let's write the first 1000 characters of the script
  console.log('Start of script:', nuxtScriptContent.substring(0, 1000));
  
  // Let's try to extract any JSON or array data from it.
  // Nuxt 3 states are often serialized using devalue or similar, which might look like:
  // window.__NUXT__ = (function(a, b, ...){ ... })(value1, value2, ...)
  // Or it could be a simple object: window.__NUXT__ = { ... }
  fs.writeFileSync('nuxt-script.js', nuxtScriptContent);
  console.log('Saved script to nuxt-script.js');
}

main();
