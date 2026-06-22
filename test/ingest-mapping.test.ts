/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCalendar } from '../src/ical/parse.ts';
import { parsedEventToPryvEvent, CALENDAR_EVENT_TYPE } from '../src/ingest/mapping.ts';

function firstEvent (ics: string) {
  return parseCalendar(ics).events[0];
}

test('maps a timed VEVENT to a calendar/ical-event', () => {
  const ev = firstEvent([
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT',
    'UID:abc-1', 'DTSTART:20260619T090000Z', 'DTEND:20260619T100000Z',
    'SUMMARY:Standup', 'LOCATION:Room 1', 'SEQUENCE:2',
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n'));
  const pryv = parsedEventToPryvEvent(ev, 'cal-work');
  assert.ok(pryv != null);
  assert.equal(pryv.type, CALENDAR_EVENT_TYPE);
  assert.deepEqual(pryv.streamIds, ['cal-work']);
  assert.equal(pryv.time, Date.UTC(2026, 5, 19, 9, 0, 0) / 1000);
  assert.equal(pryv.duration, 3600);
  assert.equal(pryv.content.uid, 'abc-1');
  assert.equal(pryv.content.summary, 'Standup');
  assert.equal(pryv.content.location, 'Room 1');
  assert.equal(pryv.content.sequence, 2);
  assert.equal(pryv.content.dtstart, '2026-06-19T09:00:00.000Z');
  assert.equal(pryv.content.dtend, '2026-06-19T10:00:00.000Z');
  assert.ok((pryv.clientData._raw as string).includes('BEGIN:VEVENT'));
});

test('maps an all-day VEVENT with dateOnly flag', () => {
  const ev = firstEvent([
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:d1',
    'DTSTART;VALUE=DATE:20260619', 'DTEND;VALUE=DATE:20260620', 'SUMMARY:Off',
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n'));
  const pryv = parsedEventToPryvEvent(ev, 'cal');
  assert.ok(pryv != null);
  assert.equal(pryv.content.dateOnly, true);
  assert.equal(pryv.duration, 86400);
});

test('omits duration for instantaneous events', () => {
  const ev = firstEvent([
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:p1', 'DTSTART:20260619T090000Z', 'SUMMARY:point',
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n'));
  const pryv = parsedEventToPryvEvent(ev, 'cal');
  assert.ok(pryv != null);
  assert.equal(pryv.duration, undefined);
});

test('preserves tzid hint in clientData', () => {
  const ev = firstEvent([
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:z1',
    'DTSTART;TZID=Europe/Zurich:20260619T090000', 'SUMMARY:zoned',
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n'));
  const pryv = parsedEventToPryvEvent(ev, 'cal');
  assert.equal(pryv?.clientData.tzid, 'Europe/Zurich');
});

test('returns null when the event has no start', () => {
  const ev = firstEvent([
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:n1', 'SUMMARY:no start', 'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n'));
  assert.equal(parsedEventToPryvEvent(ev, 'cal'), null);
});
