import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function test35() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("❌ Key not found in .env");
    return;
  }
  const genAI = new GoogleGenerativeAI(key);
  try {
    console.log("⏳ Testing gemini-3.5-flash...");
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
    const result = await model.generateContent("Say 'Gemini 3.5 is working!'");
    const response = await result.response;
    console.log(`✅ Success! Response: ${response.text().trim()}`);
  } catch (error: any) {
    console.error(`❌ Error with gemini-3.5-flash: ${error.message}`);
  }
}

test35();
