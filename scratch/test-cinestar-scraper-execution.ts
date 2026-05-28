import { scrapeCineStarOlomouc } from '../src/lib/cineStarOlomouc';

async function test() {
  console.log('Testing scrapeCineStarOlomouc()...');
  const startTime = Date.now();
  try {
    const results = await scrapeCineStarOlomouc();
    console.log(`\nFinished in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    console.log(`Returned ${results.length} events:`);
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('Test execution failed:', err);
  }
}

test();
