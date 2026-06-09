/**
 * Zjistí token count pro reálný prompt a testuje finishReason
 * Simulates the actual large prompt size
 */
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Simulace velkého promptu (přibližná délka reálného s JSON daty ze scraperů)
// Vygenerujeme fake scraper data podobné velikosti
const fakeScrapedData = Array.from({length: 10}, (_, i) => ({
  title: `Film ${i}: Velký název filmu s dlouhým popisem ${i}`,
  description: `Detailní popis ${i}: Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam quis nostrud exercitation.`,
  date: `2026-06-${7+i}`,
  time: '18:00',
  url: `https://example.com/akce/${i}`,
  location: `Vyškov, náměstí Svobody ${i}`,
  price: `${i * 100} Kč`,
}));

const bigDataString = JSON.stringify(fakeScrapedData, null, 2);
console.log('Fake scraper data size:', bigDataString.length, 'chars');

const bigPrompt = `Jsi organizátor rodinných aktivit Víkendovník.

[MKS Vyškov – Kino]: ${bigDataString}
[MKS Vyškov – Akce]: ${bigDataString}
[CineStar Olomouc]: ${bigDataString}
[Kudy z nudy – JM kraj]: ${bigDataString}
[Jižní Morava – Akce]: ${bigDataString}

Vrať JSON pole s 5 tipy. Každý objekt musí mít: title, description, target, location, is_vyskov, date, time, time_type, opening_hours, price, duration, url, indoor, age_recommendation, ticket_url, cinema_listings.

DŮLEŽITÉ: Vrať POUZE validní JSON formát. Nepřidávej žádný vysvětlující text a NEPOUŽÍVEJ markdownové značky jako \`\`\`json. Výstup musí začínat znakem [ nebo { a končit ] nebo }.`;

console.log('Total prompt size:', bigPrompt.length, 'chars');

// Test token count
const flashModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
try {
  const countResult = await flashModel.countTokens(bigPrompt);
  console.log('Token count:', countResult.totalTokens);
} catch(e) {
  console.log('Token count error:', (e as Error).message?.substring(0, 200));
}

// Test generation s velkým promptem
console.log('\nSpouštím generateContent s velkým promptem...');
try {
  const result = await flashModel.generateContent(bigPrompt);
  const text = result.response.text();
  const finishReason = result.response.candidates?.[0]?.finishReason;
  console.log('finishReason:', finishReason);
  console.log('Response text length:', text.length);
  console.log('First 100 chars:', JSON.stringify(text.substring(0, 100)));
  
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    console.log('✅ JSON parse OK! Items:', parsed.length);
  } catch(pe) {
    console.log('❌ JSON parse FAILED:', (pe as Error).message);
    console.log('Last 200 chars of response:', JSON.stringify(text.substring(text.length - 200)));
    // Check if truncated
    if (finishReason === 'MAX_TOKENS') {
      console.log('=> REASON: MAX_TOKENS - output was truncated!');
    }
  }
} catch(e: any) {
  console.log('Generate ERROR:', e.status, e.message?.substring(0, 300));
}
