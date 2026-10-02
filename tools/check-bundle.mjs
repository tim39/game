// Runs after `npm run build` and fails it if debug-only code leaked into the production bundle.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = ['__game', 'installDebugHooks'];

const files = readdirSync('dist', { recursive: true })
  .map(String)
  .filter((file) => file.endsWith('.js'));

const leaks = files.flatMap((file) => {
  const code = readFileSync(join('dist', file), 'utf8');
  return FORBIDDEN.filter((word) => code.includes(word)).map((word) => `  ${file}: ${word}`);
});

if (leaks.length > 0) {
  console.error(`Debug code leaked into the production build:\n${leaks.join('\n')}`);
  process.exit(1);
}
console.log(`Production bundle is clean: ${files.length} JS file(s), no debug hooks.`);
