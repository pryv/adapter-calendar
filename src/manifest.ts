/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
/**
 * Adapter self-description manifest.
 *
 * Served at `GET /manifest.json`. A Pryv core's `/service/info` advertises only
 * the adapter's base URL; clients fetch `<base>/manifest.json` (this document)
 * for the name / type / version / capabilities, which the adapter owns and
 * versions itself.
 */
import { version } from './index.ts';

/** What the adapter publishes about itself. */
export interface AdapterManifest {
  /** Short adapter name, unique within a deployment. */
  name: string;
  /** Adapter class (the external standard it bridges). */
  type: string;
  /** Adapter version. */
  version: string;
  /** Human-readable title. */
  title: string;
  /** One-line description. */
  description: string;
  /** Implemented use cases. */
  useCases: string[];
  /** Path to the web UI, relative to the adapter base URL. */
  ui: string;
  /** Supported subscription-URL auth modes. */
  auth: string[];
  /** External standards the adapter speaks. */
  standards: string[];
}

/** Build the current adapter manifest. */
export function buildManifest (): AdapterManifest {
  return {
    name: 'calendar',
    type: 'calendar',
    version,
    title: 'Pryv calendar adapter',
    description: 'Expose selected Pryv events as an iCalendar subscription feed.',
    useCases: ['pryv-to-ical-feed'],
    ui: '/',
    auth: ['plaintext', 'sealed'],
    standards: ['RFC5545']
  };
}
