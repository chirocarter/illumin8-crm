// Minimal .env/.env.local loader for CLI scripts (tsx doesn't load them,
// unlike `next dev`). Values already in the environment win.
import fs from "fs";
import path from "path";

export function loadEnvLocal() {
  // .env.turso holds the hosted-database credentials and is read ONLY here, by
  // CLI scripts (migrate / bootstrap / backup). It is deliberately not a file
  // Next.js auto-loads: if these lived in .env.local, `npm run dev` would point
  // the local dev server at production and you'd edit live data by accident.
  for (const file of [".env.turso", ".env.local", ".env"]) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, raw] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = raw.replace(/^["']|["']$/g, "");
    }
  }
}
