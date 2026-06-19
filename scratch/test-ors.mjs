import { readFileSync } from 'fs';

// Načíst .env ručně
const envContent = readFileSync('.env', 'utf8');
const orsKey = envContent.match(/ORS_API_KEY=(.+)/)?.[1]?.trim();
console.log('ORS klíč prefix:', orsKey ? orsKey.substring(0, 15) + '...' : 'CHYBÍ');

if (!orsKey) process.exit(1);

const coords = [
  [16.9890503, 49.2844189],
  [17.0162001, 49.2521776],
  [16.9890503, 49.2844189]
];

console.log('Volám ORS elevation API...');
const start = Date.now();

try {
  const res = await fetch('https://api.openrouteservice.org/v2/directions/cycling-mountain', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': orsKey
    },
    body: JSON.stringify({ coordinates: coords, elevation: true, instructions: false }),
    signal: AbortSignal.timeout(15000)
  });
  const elapsed = Date.now() - start;
  console.log(`Status: ${res.status} (${elapsed}ms)`);
  if (res.ok) {
    const data = await res.json();
    console.log('Full response keys:', Object.keys(data));
    console.log('Full JSON (first 1000 chars):', JSON.stringify(data).substring(0, 1000));
    // ORS /v2/directions vrací { routes: [{ summary: { distance, duration, ascent, descent } }] }
    const summary = data.routes?.[0]?.summary;
    console.log('Summary:', JSON.stringify(summary, null, 2));
    // features je undefined pro tento endpoint (byl chybný předpoklad)
    console.log('features check:', data.features?.[0]?.properties?.summary ?? 'undefined (správně)');
  } else {
    const err = await res.text();
    console.log('Chyba:', err.substring(0, 300));
  }
} catch (e) {
  console.log('Exception:', e.message);
}
