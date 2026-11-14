// On Vercel the disk is temporary, so the hosted site starts from a snapshot of real research
// (seed/: memos, trails and the learning board from runs on 2026-11-14). Copied once per instance.
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

if (process.env.VERCEL) {
  const dir = "/tmp/proven";
  const marker = join(dir, ".seeded");
  try {
    if (!existsSync(marker)) {
      mkdirSync(dir, { recursive: true });
      cpSync(join(process.cwd(), "seed"), dir, { recursive: true, force: false });
      writeFileSync(marker, new Date().toISOString());
    }
  } catch {
    // No seed bundled: the site simply starts empty.
  }
}
