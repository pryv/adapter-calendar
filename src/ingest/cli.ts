/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
/**
 * One-shot ingest CLI (UC2a): fetch an external iCalendar URL and write its
 * events into a Pryv account. Designed to be run on a schedule (cron) — the
 * adapter holds no state between runs; idempotency is by VEVENT UID.
 *
 *   node src/ingest/cli.ts --api-endpoint https://TOKEN@user.host/ \
 *     --url https://example.com/calendar.ics [--stream calendar-ingest]
 *
 * Config may also come from env: API_ENDPOINT, ICAL_URL, STREAM_ID.
 */
import process, { argv, env } from 'node:process';
import { fileURLToPath } from 'node:url';

import { createPryvClient } from '../pryv/client.ts';
import { ingestCalendar } from './handler.ts';

function arg (name: string, fallback?: string): string | undefined {
  const i = argv.indexOf('--' + name);
  return i !== -1 && argv[i + 1] != null ? argv[i + 1] : fallback;
}

async function main (): Promise<void> {
  const apiEndpoint = arg('api-endpoint', env.API_ENDPOINT);
  const url = arg('url', env.ICAL_URL);
  const streamId = arg('stream', env.STREAM_ID) ?? 'calendar-ingest';

  if (apiEndpoint == null || url == null) {
    console.error('usage: --api-endpoint <apiEndpoint> --url <icalUrl> [--stream <streamId>]');
    process.exitCode = 2;
    return;
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`failed to fetch ${url}: ${response.status}`);
  const ics = await response.text();

  const result = await ingestCalendar(ics, { streamId }, createPryvClient(apiEndpoint));
  console.log(`ingest: ${result.created} created, ${result.skipped} skipped, ${result.total} total (stream ${streamId})`);
}

if (argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
