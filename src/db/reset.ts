// Deletes the LOCAL database file, re-runs migrations, and reseeds.
// Refuses to run when pointed at a hosted database.
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { loadEnvLocal } from "./env";

loadEnvLocal();
if (process.env.TURSO_DATABASE_URL) {
  console.error("Refusing to reset: TURSO_DATABASE_URL is set. Reset is for the local file database only.");
  process.exit(1);
}

const dbPath = path.join(process.cwd(), "data", "outreach.db");
for (const suffix of ["", "-wal", "-shm", "-journal"]) {
  const p = dbPath + suffix;
  if (fs.existsSync(p)) fs.rmSync(p);
}
console.log("Database removed. Re-running migrations + seed…");
execSync("npx tsx src/db/migrate.ts", { stdio: "inherit" });
execSync("npx tsx src/db/seed.ts", { stdio: "inherit" });
