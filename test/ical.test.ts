/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { serializeCalendar, type CalendarEvent } from '../src/ical/serialize.ts';

/** Split a serialized document back into unfolded logical lines. */
function logicalLines (ics: string): string[] {
  // Unfold: a CRLF followed by a single space/tab is a continuation.
  const unfolded = ics.replace(/\r\n[ \t]/g, '');
  return unfolded.split('\r\n').filter((l) => l.length > 0);
}

test('wraps events in a VCALENDAR with required properties', () => {
  const ics = serializeCalendar([]);
  const lines = logicalLines(ics);
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.ok(lines.includes('VERSION:2.0'));
  assert.ok(lines.includes('PRODID:-//Pryv//adapter-calendar//EN'));
  assert.ok(lines.includes('CALSCALE:GREGORIAN'));
  assert.equal(lines.at(-1), 'END:VCALENDAR');
});

test('uses CRLF line endings and a trailing CRLF', () => {
  const ics = serializeCalendar([]);
  assert.ok(ics.endsWith('\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'every LF must be preceded by CR');
});

test('serializes a timed event with UTC DTSTART/DTEND', () => {
  const ev: CalendarEvent = {
    uid: 'evt-1',
    start: new Date('2026-06-19T08:30:00.000Z'),
    end: new Date('2026-06-19T09:00:00.000Z'),
    summary: 'Weigh-in'
  };
  const lines = logicalLines(serializeCalendar([ev]));
  assert.ok(lines.includes('BEGIN:VEVENT'));
  assert.ok(lines.includes('UID:evt-1'));
  assert.ok(lines.includes('DTSTART:20260619T083000Z'));
  assert.ok(lines.includes('DTEND:20260619T090000Z'));
  assert.ok(lines.includes('SUMMARY:Weigh-in'));
  assert.ok(lines.includes('END:VEVENT'));
});

test('DTSTAMP defaults to start for stable output across polls', () => {
  const ev: CalendarEvent = {
    uid: 'evt-1',
    start: new Date('2026-06-19T08:30:00.000Z'),
    summary: 'x'
  };
  const lines = logicalLines(serializeCalendar([ev]));
  assert.ok(lines.includes('DTSTAMP:20260619T083000Z'));
});

test('all-day events use VALUE=DATE', () => {
  const ev: CalendarEvent = {
    uid: 'day-1',
    start: new Date('2026-06-19T00:00:00.000Z'),
    end: new Date('2026-06-20T00:00:00.000Z'),
    summary: 'Holiday',
    allDay: true
  };
  const lines = logicalLines(serializeCalendar([ev]));
  assert.ok(lines.includes('DTSTART;VALUE=DATE:20260619'));
  assert.ok(lines.includes('DTEND;VALUE=DATE:20260620'));
});

test('omits DTEND for instantaneous events', () => {
  const ev: CalendarEvent = {
    uid: 'point-1',
    start: new Date('2026-06-19T08:30:00.000Z'),
    summary: '82.4 kg'
  };
  const lines = logicalLines(serializeCalendar([ev]));
  assert.ok(!lines.some((l) => l.startsWith('DTEND')));
});

test('escapes TEXT special characters', () => {
  const ev: CalendarEvent = {
    uid: 'esc-1',
    start: new Date('2026-06-19T08:30:00.000Z'),
    summary: 'a; b, c\\ d',
    description: 'line1\nline2'
  };
  const lines = logicalLines(serializeCalendar([ev]));
  assert.ok(lines.includes('SUMMARY:a\\; b\\, c\\\\ d'));
  assert.ok(lines.includes('DESCRIPTION:line1\\nline2'));
});

test('includes raw RRULE when provided', () => {
  const ev: CalendarEvent = {
    uid: 'rec-1',
    start: new Date('2026-06-19T08:30:00.000Z'),
    summary: 'Daily',
    rrule: 'FREQ=DAILY;COUNT=10'
  };
  const lines = logicalLines(serializeCalendar([ev]));
  assert.ok(lines.includes('RRULE:FREQ=DAILY;COUNT=10'));
});

test('emits X-WR-CALNAME when a name is given', () => {
  const lines = logicalLines(serializeCalendar([], { name: 'My weight' }));
  assert.ok(lines.includes('X-WR-CALNAME:My weight'));
});

test('folds long content lines at 75 octets with space continuation', () => {
  const longSummary = 'A'.repeat(200);
  const ev: CalendarEvent = {
    uid: 'long-1',
    start: new Date('2026-06-19T08:30:00.000Z'),
    summary: longSummary
  };
  const ics = serializeCalendar([ev]);
  // Raw (folded) physical lines must each be <= 75 octets.
  for (const physical of ics.split('\r\n')) {
    assert.ok(Buffer.byteLength(physical, 'utf8') <= MAX_OK, `line too long: ${physical.length}`);
  }
  // Continuation lines begin with a single space.
  assert.ok(/\r\n /.test(ics));
  // Unfolding restores the original summary.
  assert.ok(logicalLines(ics).includes(`SUMMARY:${longSummary}`));
});

test('folds without splitting multi-byte characters', () => {
  const ev: CalendarEvent = {
    uid: 'utf-1',
    start: new Date('2026-06-19T08:30:00.000Z'),
    summary: '€'.repeat(60) // 3 octets each → forces a fold
  };
  const ics = serializeCalendar([ev]);
  for (const physical of ics.split('\r\n')) {
    assert.ok(Buffer.byteLength(physical, 'utf8') <= MAX_OK);
    // No replacement char / no broken sequence: re-encoding round-trips.
    assert.equal(Buffer.from(physical, 'utf8').toString('utf8'), physical);
  }
  assert.ok(logicalLines(ics).includes(`SUMMARY:${'€'.repeat(60)}`));
});

const MAX_OK = 75;
