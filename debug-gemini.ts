import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

console.log('[API DEBUG] Prvních 10 znaků Gemini klíče:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) : 'CHYBÍ KLÍČ!');

async function test() {
    if (!process.env.GEMINI_API_KEY) return;
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log('[API DEBUG] Zkouším testovací volání...');
        const result = await model.generateContent("Ahoj, jsi tam?");
        console.log('[API DEBUG] Odpověď:', result.response.text());
        console.log('[API DEBUG] ÚSPĚCH!');
    } catch (err: any) {
        console.error('[API DEBUG] CHYBA:', err.message);
        if (err.stack) console.error(err.stack);
    }
}

test();
