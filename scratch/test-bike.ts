import { generateBikeRoute } from "../src/lib/bikeRoutes";
import dotenv from "dotenv";

dotenv.config();

async function runTest() {
  console.log("Starting bike route generation test (Target: 25 km, medium)...");
  try {
    const result = await generateBikeRoute({
      distance: 25,
      difficulty: "medium",
      isRandom: false,
      authorName: "TestUser",
      emit: (msg) => console.log(`[EMIT] ${msg}`)
    });
    console.log("Success! Mapy.cz URL:", result.url);
    console.log("Cycling info:", JSON.stringify(result.cycling_info, null, 2));
    console.log("Distance:", result.distance, "km");
  } catch (err) {
    console.error("Test failed with error:", err);
  }
}

runTest();
