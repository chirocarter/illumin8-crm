// Test stand-in for the `server-only` marker package.
//
// In the app, Next.js resolves `import "server-only"` itself, to make a build
// fail if server code leaks into a client bundle. Plain Node (what the tests
// run on) has no such module, so tests/tsconfig.json maps the name here. It
// does nothing — the guard it replaces is a build-time check, not runtime logic.
export {};
