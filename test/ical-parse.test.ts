/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCalendar } from '../src/ical/parse.ts';
import { serializeCalendar, type CalendarEvent } from '../src/ical/serialize.ts';

const SAMPLE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//EN',
  'X-WR-CALNAME:Work',
  'BEGIN:VEVENT',
  'UID:abc-1',
  'DTSTAMP:20260619T080000Z',
  'DTSTART:20260619T090000Z',
  'DTEND:20260619T100000Z',
  'SUMMARY:Standup',
  'LOCATION:Room 1',
  'DESCRIPTION:line1\\nline2\\, more',
  'STATUS:CONFIRMED',
  'SEQUENCE:3',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n') + '\r\n';

test('parses calendar name and a timed event', () => {
  const cal = parseCalendar(SAMPLE);
  assert.equal(cal.name, 'Work');
  assert.equal(cal.events.length, 1);
  const ev = cal.events[0];
  assert.equal(ev.uid, 'abc-1');
  assert.equal(ev.summary, 'Standup');
  assert.equal(ev.location, 'Room 1');
  assert.equal(ev.status, 'CONFIRMED');
  assert.equal(ev.sequence, 3);
  assert.equal(ev.dtstart?.date.toISOString(), '2026-06-19T09:00:00.000Z');
  assert.equal(ev.dtend?.date.toISOString(), '2026-06-19T10:00:00.000Z');
  assert.equal(ev.dtstart?.dateOnly, false);
});

test('unescapes TEXT values', () => {
  const ev = parseCalendar(SAMPLE).events[0];
  assert.equal(ev.description, 'line1\nline2, more');
});

test('preserves the verbatim VEVENT block in raw', () => {
  const ev = parseCalendar(SAMPLE).events[0];
  assert.ok(ev.raw.startsWith('BEGIN:VEVENT'));
  assert.ok(ev.raw.endsWith('END:VEVENT'));
  assert.ok(ev.raw.includes('UID:abc-1'));
});

test('parses all-day DATE values', () => {
  const ics = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:d1',
    'DTSTART;VALUE=DATE:20260619', 'DTEND;VALUE=DATE:20260620',
    'SUMMARY:Holiday', 'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
  const ev = parseCalendar(ics).events[0];
  assert.equal(ev.dtstart?.dateOnly, true);
  assert.equal(ev.dtstart?.date.toISOString(), '2026-06-19T00:00:00.000Z');
});

test('flags floating and tzid times', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT', 'UID:f1', 'DTSTART:20260619T090000', 'SUMMARY:Floating', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:z1', 'DTSTART;TZID=Europe/Zurich:20260619T090000', 'SUMMARY:Zoned', 'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const [floating, zoned] = parseCalendar(ics).events;
  assert.equal(floating.dtstart?.floating, true);
  assert.equal(zoned.dtstart?.tzid, 'Europe/Zurich');
});

test('unfolds long folded lines', () => {
  const ics = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:u1',
    'SUMMARY:This is a very long summary that has been',
    '  folded across two physical lines',
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
  const ev = parseCalendar(ics).events[0];
  assert.equal(ev.summary, 'This is a very long summary that has been folded across two physical lines');
});

test('handles quoted parameter values with colons', () => {
  const ics = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:q1',
    'DTSTART;TZID="Custom:Zone":20260619T090000', 'SUMMARY:x', 'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
  const ev = parseCalendar(ics).events[0];
  assert.equal(ev.dtstart?.tzid, 'Custom:Zone');
});

test('round-trips serialize -> parse for timed and all-day events', () => {
  const events: CalendarEvent[] = [
    { uid: 'rt-1', start: new Date('2026-06-19T08:30:00.000Z'), end: new Date('2026-06-19T09:00:00.000Z'), summary: 'Weigh; in, now', description: 'a\nb' },
    { uid: 'rt-2', start: new Date('2026-06-20T00:00:00.000Z'), end: new Date('2026-06-21T00:00:00.000Z'), summary: 'Off', allDay: true }
  ];
  const cal = parseCalendar(serializeCalendar(events, { name: 'RT' }));
  assert.equal(cal.name, 'RT');
  assert.equal(cal.events.length, 2);
  assert.equal(cal.events[0].uid, 'rt-1');
  assert.equal(cal.events[0].summary, 'Weigh; in, now');
  assert.equal(cal.events[0].description, 'a\nb');
  assert.equal(cal.events[0].dtstart?.date.toISOString(), '2026-06-19T08:30:00.000Z');
  assert.equal(cal.events[1].dtstart?.dateOnly, true);
  assert.equal(cal.events[1].dtstart?.date.toISOString(), '2026-06-20T00:00:00.000Z');
});
