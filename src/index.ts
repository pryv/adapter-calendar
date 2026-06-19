/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
/**
 * Calendar adapter for Pryv.io — package entry point.
 *
 * Early scaffold: exposes package metadata so the toolchain (build, lint,
 * typecheck, test) has a real module to exercise. The iCal subscription feed
 * server and external-calendar ingest paths are added in later development.
 */
import { argv } from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { name: string; version: string };

export const name: string = pkg.name;
export const version: string = pkg.version;

/**
 * One-line human-readable banner identifying the adapter build.
 */
export function banner (): string {
  return `${name} ${version}`;
}

// When executed directly (`node src/index.ts`), print the banner.
if (argv[1] === fileURLToPath(import.meta.url)) {
  console.log(banner());
}
