// Which database a CLI script talks to — decided by a flag you type, never by
// what happens to be in the environment.
//
// THE PROBLEM THIS EXISTS TO SOLVE. `loadEnvLocal()` reads `.env.turso` before
// anything else, so `TURSO_DATABASE_URL` is set on every developer machine.
// Any script that branched on that variable alone therefore chose PRODUCTION by
// default, and the obvious command was the dangerous one. That was documented
// as a trap in the README and the documentation still failed: a migration meant
// for the local file landed on Turso.
//
// The convention, identical across every script:
//
//   <command>            → LOCAL, always
//   <command> -- --prod  → hosted Turso, announced before anything runs
//
// In local mode this DELETES TURSO_DATABASE_URL from the process environment.
// That matters more than the printed banner: `src/db/index.ts` picks its driver
// from that variable, so once it is gone the hosted driver is not merely
// unselected, it is unreachable. A script cannot hit production by forgetting
// to check a flag, because there is nothing left to connect to.
import { loadEnvLocal } from "./env";

export type Target = {
  prod: boolean;
  /** Hostname only. Never a token, never a URL carrying credentials. */
  host: string;
  label: "PRODUCTION (Turso)" | "LOCAL data/outreach.db";
};

/** Hostname only — never the auth token, never a URL with credentials in it. */
function safeHost(url: string): string {
  try {
    const u = new URL(url);
    return u.host || `${u.protocol}${u.pathname}`;
  } catch {
    return "(unparseable URL)";
  }
}

function rule() { console.log("─".repeat(64)); }

/**
 * Resolve the target, or exit.
 *
 * `allowProd: false` refuses production outright — for commands that have no
 * legitimate business touching live data.
 */
export function resolveTarget(opts: {
  command: string;
  /** Extra flags this script accepts, so unknown ones can be refused. */
  known: string[];
  allowProd?: boolean;
  /** What is about to happen, shown in the banner. */
  operation?: string;
}): Target {
  loadEnvLocal();

  const args = process.argv.slice(2);
  const wantsProd = args.includes("--prod");

  // Anything that LOOKS like a production flag but is not exactly `--prod` is
  // refused rather than ignored. Silently treating `--production` as local is
  // how someone ends up believing they hit production when they did not.
  const prodLookalike = args.find(
    (a) => a !== "--prod" && /^--?(prod|production|live|remote|turso)/i.test(a)
  );
  if (prodLookalike) {
    console.error(`Unrecognized flag "${prodLookalike}".`);
    console.error(`Production intent is spelled exactly: --prod`);
    process.exit(1);
  }

  // Unknown flags are refused too, so a typo in a value-carrying flag cannot
  // quietly change what the command does.
  const unknown = args.filter(
    (a) => a.startsWith("--") && a !== "--prod" && !opts.known.includes(a)
  );
  if (unknown.length) {
    console.error(`Unrecognized argument(s): ${unknown.join(" ")}`);
    console.error(`Usage: ${opts.command} [--prod] ${opts.known.join(" ")}`.trim());
    process.exit(1);
  }

  const hostedUrl = process.env.TURSO_DATABASE_URL;

  if (wantsProd) {
    if (opts.allowProd === false) {
      console.error(`${opts.command} refuses to run against production.`);
      console.error("This command exists for local development only.");
      process.exit(1);
    }
    // Asked for production but nothing is configured. Falling back to local
    // here would report success while production stayed untouched — the quiet
    // failure this whole guard exists to prevent.
    if (!hostedUrl) {
      console.error("--prod was passed but TURSO_DATABASE_URL is not set.");
      console.error("Nothing was done. Configure .env.turso, or drop --prod to work locally.");
      process.exit(1);
    }
    rule();
    console.log("  TARGET:    PRODUCTION (Turso)");
    console.log(`  host:      ${safeHost(hostedUrl)}`);
    if (opts.operation) console.log(`  operation: ${opts.operation}`);
    console.log("  This affects the LIVE database.");
    rule();
    return { prod: true, host: safeHost(hostedUrl), label: "PRODUCTION (Turso)" };
  }

  rule();
  console.log("  TARGET:    LOCAL data/outreach.db");
  if (opts.operation) console.log(`  operation: ${opts.operation}`);
  if (hostedUrl) {
    // Say it out loud. The variable is set on every dev machine, and staying
    // quiet about ignoring it is how the old behaviour surprised people.
    console.log(`  TURSO_DATABASE_URL is set (${safeHost(hostedUrl)}) and is being IGNORED.`);
    console.log("  Pass --prod if you meant to work against production.");
  }
  rule();

  // The teeth. With this gone, src/db cannot construct a hosted client at all.
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;

  return { prod: false, host: "data/outreach.db", label: "LOCAL data/outreach.db" };
}
