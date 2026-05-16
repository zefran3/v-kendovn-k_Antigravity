const dotenv = require('dotenv');

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error('CHYBA: GEMINI_API_KEY není v .env nalezen!');
    process.exit(1);
}

console.log('--- DIAGNOSTIKA GOOGLE API ---');
console.log('Klíč (začátek):', API_KEY.substring(0, 10) + '...');

async function listModels() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            console.error('API VRÁTILO CHYBU:', response.status, response.statusText);
            console.error(JSON.stringify(data, null, 2));
            return;
        }

        console.log('\nDOSTUPNÉ MODELY PRO TENTO KLÍČ:');
        if (data.models && data.models.length > 0) {
            data.models.forEach(model => {
                console.log(`- ${model.name} (${model.displayName})`);
            });
        } else {
            console.log('Žádné modely nebyly nalezeny.');
        }
    } catch (err) {
        console.error('CHYBA PŘI VOLÁNÍ API:', err.message);
    }
}

listModels();
