/**
 * Provision a city-scoped agent identity.
 *
 *   npx tsx scripts/create-agent-user.ts --city "Albuquerque"
 *   npx tsx scripts/create-agent-user.ts --city "McKinney" --apply
 *   npx tsx scripts/create-agent-user.ts --city "Albuquerque" --rotate --apply --prod
 *
 * TARGET IS CHOSEN BY FLAG, NEVER BY ENVIRONMENT. Without --prod this works on
 * the local database even when .env.turso is present; see src/db/target.ts.
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
import { resolveTarget } from "../src/db/target";

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const APPLY = args.includes("--apply");
const ROTATE = args.includes("--rotate");

async function main(): Promise<number> {
  const cityName = flag("city");
  if (!cityName) {
    console.error("A city is required:  --city \"Albuquerque\"");
    console.error("Agents are city-scoped; there is no default and no fallback.");
    process.exit(1);
  }

  // Before anything is imported or connected: say plainly which database this
  // is about to touch, what it intends to do, and to whom. In local mode this
  // also strips the Turso variables, so the hosted driver becomes unreachable
  // rather than merely unselected.
  resolveTarget({
    command: "create-agent-user",
    known: ["--city", "--apply", "--rotate"],
    operation: `${ROTATE ? "ROTATE the bearer credential for" : "CREATE an agent identity for"} ` +
      `"${cityName}"${APPLY ? "" : "  (DRY RUN — nothing will be written)"}`,
  });

  // Imported dynamically so loadEnvLocal() has already run — ES imports would
  // evaluate the db module before the environment was populated.
  const { db, schema: s } = await import("../src/db");
  const { eq, and } = await import("drizzle-orm");
  const { generateAgentKey, hashAgentKey } = await import("../src/lib/agent-key");
  const { AGENT_ROLE } = await import("../src/lib/taxonomy");


  if (!process.env.AGENT_KEY_SECRET) {
    console.error("AGENT_KEY_SECRET is not set. Without it the credential cannot be hashed.");
    console.error("Set it in .env.turso (local) and in Vercel's environment variables.");
    return 1;
  }

  const cities = await db.select({ id: s.cities.id, name: s.cities.name, active: s.cities.active }).from(s.cities);
  const city = cities.find((c) => c.name.toLowerCase() === cityName.toLowerCase());
  if (!city) {
    console.error(`No city named "${cityName}".`);
    console.error(`Known cities: ${cities.map((c) => c.name).join(", ") || "(none)"}`);
    console.error("Create the city in the CRM first — this script will not invent one.");
    return 1;
  }
  if (!city.active) console.warn(`⚠ "${city.name}" is marked inactive; its agent will be refused at auth time.\n`);

  const existing = await db.query.users.findFirst({
    where: and(eq(s.users.role, AGENT_ROLE), eq(s.users.cityId, city.id)),
  });

  // ---- rotation ----------------------------------------------------------
  // Replaces the credential and nothing else. City, role, name, email and
  // ownership are untouched, so rotating cannot quietly move an agent to
  // another market - the exact mistake the whole design exists to prevent.
  if (ROTATE) {
    if (!existing) {
      console.error(`No agent identity exists for ${city.name}. Nothing to rotate.`);
      console.error("Create one first (omit --rotate).");
      return 1;
    }
    // Guard against the ambiguous case rather than guessing which to rotate.
    const all = await db.select({ id: s.users.id }).from(s.users)
      .where(and(eq(s.users.role, AGENT_ROLE), eq(s.users.cityId, city.id)));
    if (all.length > 1) {
      console.error(`${all.length} agent identities exist for ${city.name}: ids ${all.map(a => a.id).join(", ")}.`);
      console.error("Refusing to guess which one to rotate. Resolve this by hand.");
      return 1;
    }

    console.log("would rotate the credential for:");
    console.log(`  #${existing.id}  ${existing.name}  <${existing.email}>`);
    console.log(`  city  ${city.name} (#${city.id})   role  ${existing.role}`);
    console.log("  unchanged: city, role, name, email, ownership\n");
    if (!APPLY) { console.log("DRY RUN - nothing written. Re-run with --apply to rotate."); return 0; }

    const newKey = generateAgentKey();
    const newHash = hashAgentKey(newKey);
    if (!newHash) { console.error("Could not hash the new credential."); return 1; }

    await db.update(s.users).set({ agentKeyHash: newHash }).where(eq(s.users.id, existing.id));

    console.log(`rotated credential for agent #${existing.id} (${city.name})`);
    console.log("The previous credential stopped working immediately.\n");
    console.log("-".repeat(72));
    console.log("NEW BEARER CREDENTIAL - shown once, not recoverable. Store it now.");
    console.log("-".repeat(72));
    console.log(newKey);
    console.log("-".repeat(72));
    return 0;
  }

  if (existing) {
    console.error(`An agent identity already exists for ${city.name}:`);
    console.error(`  #${existing.id}  ${existing.name}  <${existing.email}>`);
    console.error("Refusing to create a second one. To replace its credential: --rotate --apply");
    return 1;
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
    return 0;
  }

  const rawKey = generateAgentKey();
  const keyHash = hashAgentKey(rawKey);
  if (!keyHash) { console.error("Could not hash the credential."); return 1; }

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
  return 0;
}

main()
  .then((code) => { process.exitCode = code ?? 0; })
  .catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exitCode = 1; });
