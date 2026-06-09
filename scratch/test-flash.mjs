import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
dotenv.config();

const key = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(key);

// Test 1: základní test Flash
console.log('=== TEST 1: Flash základní test ===');
try {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent(
    'Return a JSON array with one object like [{"title": "Test", "value": 1}]. ' +
    'IMPORTANT: Return ONLY valid JSON, no markdown, no backticks. Start with [ end with ].'
  );
  const text = result.response.text();
  console.log('Raw response:', JSON.stringify(text.substring(0, 300)));
  const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
  console.log('Parsed OK:', JSON.stringify(parsed));
} catch(e) {
  console.log('Flash ERROR:', e.message?.substring(0, 500));
  if (e instanceof SyntaxError) console.log('=> JSON parse error!');
}

// Test 2: Pro error details
console.log('\n=== TEST 2: Pro error details ===');
try {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
  const result = await model.generateContent('Say hello');
  console.log('Pro SUCCESS:', result.response.text().substring(0, 100));
} catch(e) {
  console.log('Pro ERROR status:', e.status);
  console.log('Pro ERROR code:', e.statusCode);
  console.log('Pro ERROR type:', e.constructor.name);
  console.log('Pro includes quota:', String(e).includes('quota'));
  console.log('Pro includes RESOURCE_EXHAUSTED:', String(e).includes('RESOURCE_EXHAUSTED'));
  console.log('Pro status === 429:', e.status === 429);
  console.log('Full error keys:', Object.keys(e));
}
