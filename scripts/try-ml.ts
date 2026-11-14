// Train the real model on saved memos and print the result.
// Usage: npx tsx scripts/try-ml.ts [data dir, default ./.data]
import { train } from "../lib/ml";

console.log(JSON.stringify(train(process.argv[2]), null, 2));
