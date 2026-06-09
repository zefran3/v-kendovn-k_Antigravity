/**
 * Diagnostický skript - simuluje přesně to, co dělá server.ts v generateInspirations()
 * Testuje fallback logiku s reálným (ale krátkým) promptem
 */
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Simulace promptu podobného tomu v server.ts
const shortPrompt = `Jsi organizátor rodinných aktivit. Vrať JSON pole s 2 tipy na víkend.
Každý objekt musí mít přesně tato pole:
title, description, target, location, is_vyskov, date, time, time_type, opening_hours, price, duration, url, indoor, age_recommendation, ticket_url, cinema_listings

DŮLEŽITÉ: Vrať POUZE validní JSON formát. Nepřidávej žádný vysvětlující text a NEPOUŽÍVEJ markdownové značky jako \`\`\`json. Výstup musí začínat znakem [ nebo { a končit ] nebo }.`;

console.log('=== TEST: Simulace fallback logiky ===\n');

// Simulated Pro error (as if it threw 429)
console.log('1. Simuluji chybu gemini-2.5-pro (429 quota)...');

const err = new Error('[GoogleGenerativeAI Error]: [429 Too Many Requests] You exceeded your current quota');
(err as any).status = 429;

const isQuotaError = (err as any)?.status === 429 || (err as any)?.status === 503 || String(err).includes('quota') || String(err).includes('RESOURCE_EXHAUSTED');
console.log('isQuotaError:', isQuotaError);

if (isQuotaError) {
  console.log('\n2. Spouštím fallback na gemini-2.5-flash...');
  try {
    const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const fallbackResult = await fallbackModel.generateContent(shortPrompt);
    const rawText = fallbackResult.response.text();
    console.log('Raw response length:', rawText.length);
    console.log('Raw response first 200 chars:', JSON.stringify(rawText.substring(0, 200)));
    console.log('Raw response last 50 chars:', JSON.stringify(rawText.substring(rawText.length - 50)));
    
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      console.log('Cleaned first 100:', JSON.stringify(cleaned.substring(0, 100)));
      const suggestions = JSON.parse(cleaned);
      console.log('\n✅ FALLBACK SUCCESS! suggestions.length:', suggestions.length);
      console.log('First suggestion title:', suggestions[0]?.title);
    } catch(parseErr) {
      console.log('\n❌ JSON PARSE ERROR:', (parseErr as Error).message);
      console.log('This is why suggestions = [] !');
    }
  } catch(fallbackErr: any) {
    console.log('\n❌ FALLBACK CALL ERROR:', fallbackErr.status, fallbackErr.message?.substring(0, 300));
  }
}
