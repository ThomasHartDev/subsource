// Usage: pnpm tsx scripts/inspect-profile.ts <path-to-profile.json>
// Prints a human-readable summary, one line per top-level field.
import path from "node:path";
import { summarizeProfile } from "../src/services/profile";

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: tsx scripts/inspect-profile.ts <path-to-profile.json>");
    process.exit(1);
  }
  const abs = path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);
  const text = await summarizeProfile(abs);
  console.log(text);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
