import { generateBikeRoute } from "../src/lib/bikeRoutes";
import dotenv from "dotenv";

dotenv.config();

async function runTest() {
  console.log("Starting bike route generation test (Target: 35 km)...");
  try {
    const result = await generateBikeRoute({
      distance: 35,
      difficulty: "medium", // speed should be 17 km/h
      isRandom: false,
      authorName: "TestUser",
      emit: (msg) => console.log(`[EMIT] ${msg}`)
    });
    console.log("Success! Result route:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Test failed with error:", err);
  }
}

runTest();
