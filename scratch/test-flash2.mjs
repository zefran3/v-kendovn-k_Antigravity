import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

try {
  const result = await model.generateContent('Return JSON array [{"a":1}]. Only JSON, no markdown.');
  const text = result.response.text();
  const candidates = result.response.candidates;
  console.log('finishReason:', candidates[0].finishReason);
  console.log('text length:', text.length);
  console.log('text starts with:', JSON.stringify(text.substring(0, 50)));
  const parts = candidates[0].content?.parts || [];
  console.log('parts count:', parts.length);
  parts.forEach((p, i) => console.log('part', i, '| thought:', p.thought, '| text len:', p.text?.length, '| text preview:', JSON.stringify(p.text?.substring(0,50))));
  
  // Try parse
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    console.log('JSON parse OK:', JSON.stringify(parsed));
  } catch(pe) {
    console.log('JSON parse FAILED:', pe.message);
    console.log('Full text:', JSON.stringify(text));
  }
} catch(e) {
  console.error('ERROR:', e.message?.substring(0, 500));
}
