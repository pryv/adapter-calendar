/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestCalendar } from '../src/ingest/handler.ts';
import { CALENDAR_EVENT_TYPE } from '../src/ingest/mapping.ts';
import type { PryvClient, NewEvent, PryvEvent } from '../src/pryv/types.ts';

function ics (...vevents: string[][]): string {
  const blocks = vevents.map((lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n'));
  return ['BEGIN:VCALENDAR', ...blocks, 'END:VCALENDAR'].join('\r\n');
}

/** Fake client recording writes; pre-seed `existing` events for dedup tests. */
function fakeClient (existing: PryvEvent[] = []): { client: PryvClient; created: NewEvent[]; streams: string[] } {
  const created: NewEvent[] = [];
  const streams: string[] = [];
  const client: PryvClient = {
    async getMapping () { return {}; },
    async getEvents () { return existing; },
    async createMapping () { return { id: 'm' }; },
    async ensureStream (streamId: string) { streams.push(streamId); },
    async createEvent (event: NewEvent) { created.push(event); return { id: 'e' + created.length }; }
  };
  return { client, created, streams };
}

const TWO = ics(
  ['UID:a', 'DTSTART:20260619T090000Z', 'SUMMARY:A'],
  ['UID:b', 'DTSTART:20260620T090000Z', 'SUMMARY:B']
);

test('creates one event per VEVENT and ensures the stream', async () => {
  const { client, created, streams } = fakeClient();
  const res = await ingestCalendar(TWO, { streamId: 'cal-x' }, client);
  assert.deepEqual(res, { total: 2, created: 2, skipped: 0 });
  assert.deepEqual(streams, ['cal-x']);
  assert.equal(created.length, 2);
  assert.equal(created[0].type, CALENDAR_EVENT_TYPE);
  assert.deepEqual(created[0].streamIds, ['cal-x']);
});

test('skips VEVENTs whose UID already exists (idempotent re-ingest)', async () => {
  const existing: PryvEvent[] = [
    { id: 'x', streamIds: ['cal-x'], type: CALENDAR_EVENT_TYPE, time: 1, content: { uid: 'a' } }
  ];
  const { client, created } = fakeClient(existing);
  const res = await ingestCalendar(TWO, { streamId: 'cal-x' }, client);
  assert.deepEqual(res, { total: 2, created: 1, skipped: 1 });
  assert.equal(created.length, 1);
  assert.equal((created[0].content as { uid: string }).uid, 'b');
});

test('skips VEVENTs without a start', async () => {
  const { client, created } = fakeClient();
  const withNoStart = ics(['UID:c', 'SUMMARY:no start']);
  const res = await ingestCalendar(withNoStart, { streamId: 'cal-x' }, client);
  assert.deepEqual(res, { total: 1, created: 0, skipped: 1 });
  assert.equal(created.length, 0);
});

test('dedups repeated UIDs within a single document', async () => {
  const dup = ics(
    ['UID:same', 'DTSTART:20260619T090000Z', 'SUMMARY:first'],
    ['UID:same', 'DTSTART:20260620T090000Z', 'SUMMARY:second']
  );
  const { client, created } = fakeClient();
  const res = await ingestCalendar(dup, { streamId: 'cal-x' }, client);
  assert.deepEqual(res, { total: 2, created: 1, skipped: 1 });
  assert.equal(created.length, 1);
});
