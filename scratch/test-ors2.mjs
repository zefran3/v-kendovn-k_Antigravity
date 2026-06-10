// Test ORS přímo ze server kontextu (načteme .env)
import { readFileSync } from 'fs';
const envContent = readFileSync('.env', 'utf8');
const orsKey = envContent.match(/ORS_API_KEY=(.+)/)?.[1]?.trim();

console.log('Klíč nalezen:', orsKey ? 'ANO (' + orsKey.length + ' znaků)' : 'NE');

const coords = [
  [16.9890503, 49.2844189],
  [16.8549517, 49.3116969],
  [16.9236636, 49.3462561],
  [16.9890503, 49.2844189]
];

console.log('Test ORS s', coords.length, 'body...');

const start = Date.now();
try {
  const res = await fetch(
    'https://api.openrouteservice.org/v2/directions/cycling-mountain',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': orsKey
      },
      body: JSON.stringify({ coordinates: coords, elevation: true, instructions: false }),
      signal: AbortSignal.timeout(15000)
    }
  );
  console.log(`HTTP Status: ${res.status} (${Date.now() - start}ms)`);
  if (res.ok) {
    const data = await res.json();
    const summary = data.routes?.[0]?.summary;
    console.log('Routes[0].summary:', JSON.stringify(summary));
    console.log('ASCENT:', summary?.ascent, 'm');
  } else {
    console.log('Chyba body:', (await res.text()).substring(0, 200));
  }
} catch (e) {
  console.log('Exception:', e.message, '(po', Date.now() - start, 'ms)');
}
