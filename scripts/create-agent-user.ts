/**
 * Provision a city-scoped agent identity.
 *
 *   npx tsx scripts/create-agent-user.ts --city "Albuquerque"
 *   npx tsx scripts/create-agent-user.ts --city "McKinney" --apply
 *
 * Dry-run by default, like every other script in this repo. The raw credential
 * is printed ONCE, on creation, and is not recoverable afterwards — only its
 * HMAC digest is stored.
 *
 * Deliberate refusals:
 *   • no --city                → exits. An agent with no city cannot be scoped.
 *   • city does not exist      → exits. Creating markets is not this script's job.
 *   • agent already exists     → exits and says so, rather than quietly making
 *                                a second identity for the same market.
 */
import { loadEnvLocal } from "../src/db/env";

loadEnvLocal();

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const APPLY = args.includes("--apply");

async function main() {
  const cityName = flag("city");
  if (!cityName) {
    console.error("A city is required:  --city \"Albuquerque\"");
    console.error("Agents are city-scoped; there is no default and no fallback.");
    process.exit(1);
  }

  // Imported dynamically so loadEnvLocal() has already run — ES imports would
  // evaluate the db module before the environment was populated.
  const { db, schema: s } = await import("../src/db");
  const { eq, and } = await import("drizzle-orm");
  const { generateAgentKey, hashAgentKey } = await import("../src/lib/agent-key");
  const { AGENT_ROLE } = await import("../src/lib/taxonomy");

  const target = process.env.TURSO_DATABASE_URL ? "TURSO (production)" : "local data/outreach.db";
  console.log(`target: ${target}\n`);

  if (!process.env.AGENT_KEY_SECRET) {
    console.error("AGENT_KEY_SECRET is not set. Without it the credential cannot be hashed.");
    console.error("Set it in .env.turso (local) and in Vercel's environment variables.");
    process.exit(1);
  }

  const cities = await db.select({ id: s.cities.id, name: s.cities.name, active: s.cities.active }).from(s.cities);
  const city = cities.find((c) => c.name.toLowerCase() === cityName.toLowerCase());
  if (!city) {
    console.error(`No city named "${cityName}".`);
    console.error(`Known cities: ${cities.map((c) => c.name).join(", ") || "(none)"}`);
    console.error("Create the city in the CRM first — this script will not invent one.");
    process.exit(1);
  }
  if (!city.active) console.warn(`⚠ "${city.name}" is marked inactive; its agent will be refused at auth time.\n`);

  const existing = await db.query.users.findFirst({
    where: and(eq(s.users.role, AGENT_ROLE), eq(s.users.cityId, city.id)),
  });
  if (existing) {
    console.error(`An agent identity already exists for ${city.name}:`);
    console.error(`  #${existing.id}  ${existing.name}  <${existing.email}>`);
    console.error("Refusing to create a second one. To rotate its credential, use --rotate.");
    process.exit(1);
  }

  const name = `Illumin8 AI — ${city.name}`;
  const email = `agent+${city.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@illumin8chiro.com`;

  console.log("would create:");
  console.log(`  name    ${name}`);
  console.log(`  email   ${email}`);
  console.log(`  role    ${AGENT_ROLE}   (explicitly NOT the "admin" column default)`);
  console.log(`  city    ${city.name} (#${city.id})`);
  console.log(`  login   disabled — unusable password hash, and the login action rejects this role\n`);

  if (!APPLY) {
    console.log("DRY RUN — nothing written. Re-run with --apply to create it.");
    return;
  }

  const rawKey = generateAgentKey();
  const keyHash = hashAgentKey(rawKey);
  if (!keyHash) { console.error("Could not hash the credential."); process.exit(1); }

  const [row] = await db.insert(s.users).values({
    email,
    name,
    // Not a real hash: verifyPassword() splits on ":" and hex-decodes the second
    // half, so this can never validate against any input.
    passwordHash: "disabled:agent-no-password-login",
    role: AGENT_ROLE,
    cityId: city.id,
    agentKeyHash: keyHash,
  }).returning();

  console.log(`created agent user #${row.id} for ${city.name}\n`);
  console.log("─".repeat(72));
  console.log("BEARER CREDENTIAL — shown once, not recoverable. Store it now.");
  console.log("─".repeat(72));
  console.log(rawKey);
  console.log("─".repeat(72));
  console.log("Use as:  Authorization: Bearer <credential>");
  console.log("Keep it out of git, chat logs and screenshots.");
}

main();
