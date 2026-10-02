// Stand-in for npm scripts whose tooling hasn't been built yet (see docs/ROADMAP.md).
// It exits 0 so `npm run check` still covers everything that does exist, but says loudly what it skipped.
// Delete each use of it from package.json when the real tool lands.
const [name = 'this script', arrives = 'a later roadmap task'] = process.argv.slice(2);
console.warn(`SKIPPED: \`npm run ${name}\` isn't set up yet. It arrives with ${arrives}.`);
