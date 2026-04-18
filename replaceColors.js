const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Nahradit chladné šedé za teplé
content = content.replace(/slate-/g, 'stone-');

// Nahradit modré (blue) za růžovo-červené (rose)
content = content.replace(/blue-/g, 'rose-');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Barvy uspesne zmeneny!');
