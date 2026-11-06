/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
/**
 * node:http server: the calendar feed plus a small mapping-creation UI.
 *
 *     GET  /<prefix>/<envelope>.ics   -> text/calendar (the subscription feed)
 *     GET  /                          -> mapping-creation web UI
 *     POST /ui/mappings               -> create a mapping, return its subscription URL
 *
 * The server is thin: it parses routes, reads bodies, and delegates to the feed
 * and UI handlers. The Pryv client factory is injected so routing is testable
 * without a network.
 *
 * Behind a Pryv core the routes live under the mount path (`/adapter/calendar/`;
 * the slashless form answers 308 to it), and a request addressed to an account
 * carries `X-Adapter-Base`: the links the UI emits are then that account's own
 * address.
 */
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import process, { argv, env } from 'node:process';

import { handleFeed, type FeedConfig } from './feed/handler.ts';
import { keyFromBase64 } from './feed/envelope.ts';
import { handleCreateMapping, parseCreateMappingInput, UiRequestError } from './ui/handler.ts';
import { buildManifest } from './manifest.ts';
import type { PryvClientFactory } from './pryv/types.ts';

const ICS_SUFFIX = '.ics';
const MAX_BODY_BYTES = 64 * 1024;
const ASSET_DIR = fileURLToPath(new URL('./ui/assets/', import.meta.url));

/** Static files the UI serves, mapped to content types. */
const STATIC_FILES: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' }
};

/** Server configuration. */
export interface ServerConfig extends FeedConfig {
  /** Route prefix, e.g. `cal` serves `/cal/<envelope>.ics`. */
  prefix: string;
  /**
   * Externally reachable base URL at a platform address (e.g. `https://core.example.com/adapter/calendar/`);
   * its path is the mount path. `X-Adapter-Base` takes precedence; the request's own origin when unset.
   */
  baseUrl?: string;
  /** The adapter's base in the platform's `{username}` template form, published in the manifest. */
  baseTemplate?: string;
}

const BASE_TEMPLATE_RE = /^https?:\/\/\S*\{username\}\S*\/$/;

function send (res: ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

const TEXT = 'text/plain; charset=utf-8';

async function readJsonBody (req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new UiRequestError('request body too large');
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    throw new UiRequestError('request body is not valid JSON');
  }
}

/**
 * The account's base URL a Pryv core sets on a request addressed to an account
 * (`X-Adapter-Base`, e.g. `https://alice.example.com/adapter/calendar/`), or null
 * at a platform address. The core sets it together with `X-Adapter-Name`; the pair
 * is read as a pair (a base without a valid name is absent), like the reference
 * reader of the adapter contract. An address, not an identity: the feed's envelope
 * carries the credentials. Trusted because the adapter is reached through the core
 * only, which drops client-sent copies.
 */
function adapterBaseOf (req: IncomingMessage): string | null {
  const name = req.headers['x-adapter-name'];
  if (typeof name !== 'string' || !/^[a-z0-9-]+$/.test(name)) return null;
  const value = req.headers['x-adapter-base'];
  if (typeof value !== 'string' || !value.endsWith('/') || /[\s,]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '') return null;
  } catch {
    return null;
  }
  return value;
}

/**
 * Base URL for emitted links: the addressed account's base, else the configured one,
 * else the request's own origin (a bare deployment). The origin is reflected whole,
 * never read as an account: a feed URL carries its own credentials.
 */
function baseUrlFor (req: IncomingMessage, config: ServerConfig): string {
  const adapterBase = adapterBaseOf(req);
  if (adapterBase != null) return adapterBase;
  if (config.baseUrl != null && config.baseUrl.length > 0) return config.baseUrl;
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
  const host = req.headers.host ?? 'localhost';
  return `${proto}://${host}`;
}

/**
 * The path the adapter is mounted under behind a core (`/adapter/calendar/`): the
 * path of `X-Adapter-Base`, else of the configured base URL, else `/`. The core
 * forwards the path as the client sent it, so this prefix is removed before routing.
 * `X-Adapter-Base` is the route root on every prefix: a route declared under another
 * prefix (e.g. `/.well-known/<label>/adapter/calendar/`) is not stripped by this.
 */
function mountPathFor (req: IncomingMessage, config: ServerConfig): string {
  const base = adapterBaseOf(req) ?? config.baseUrl;
  if (base == null || base.length === 0) return '/';
  try {
    const path = new URL(base).pathname;
    return path.endsWith('/') ? path : path + '/';
  } catch {
    return '/';
  }
}

async function serveStatic (res: ServerResponse, entry: { file: string; type: string }): Promise<void> {
  try {
    const content = await readFile(ASSET_DIR + entry.file, 'utf8');
    send(res, 200, entry.type, content);
  } catch {
    send(res, 404, TEXT, 'not found');
  }
}

async function handleCreate (
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
  makeClient: PryvClientFactory
): Promise<void> {
  try {
    const input = parseCreateMappingInput(await readJsonBody(req));
    const result = await handleCreateMapping(input, { ...config, baseUrl: baseUrlFor(req, config) }, makeClient);
    send(res, 200, 'application/json; charset=utf-8', JSON.stringify(result));
  } catch (err) {
    if (err instanceof UiRequestError) return send(res, 400, TEXT, err.message);
    send(res, 502, TEXT, 'failed to create mapping on Pryv');
  }
}

async function route (
  req: IncomingMessage,
  res: ServerResponse,
  feedPrefix: string,
  config: ServerConfig,
  makeClient: PryvClientFactory
): Promise<void> {
  try {
    const fullPath = new URL(req.url ?? '/', 'http://localhost').pathname;
    const mount = mountPathFor(req, config);
    if (mount !== '/' && fullPath === mount.slice(0, -1)) {
      // The UI's assets are relative: send the slashless mount to its slashed form
      // (path only, nothing taken from the request's host).
      res.writeHead(308, { location: mount, 'content-type': TEXT });
      res.end('moved permanently');
      return;
    }
    const path = mount !== '/' && fullPath.startsWith(mount) ? fullPath.slice(mount.length - 1) : fullPath;

    if (req.method === 'POST' && path === '/ui/mappings') {
      return await handleCreate(req, res, config, makeClient);
    }

    if (req.method === 'GET') {
      if (path === '/manifest.json') {
        const manifest = buildManifest({ baseTemplate: config.baseTemplate });
        return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(manifest));
      }
      if (path.startsWith(feedPrefix) && path.endsWith(ICS_SUFFIX)) {
        const envelope = decodeURIComponent(path.slice(feedPrefix.length, -ICS_SUFFIX.length));
        if (envelope.length === 0) return send(res, 404, TEXT, 'not found');
        const result = await handleFeed(envelope, config, makeClient);
        return send(res, result.status, result.headers['content-type'] ?? TEXT, result.body);
      }
      const staticEntry = STATIC_FILES[path];
      if (staticEntry != null) return await serveStatic(res, staticEntry);
      return send(res, 404, TEXT, 'not found');
    }

    send(res, 405, TEXT, 'method not allowed');
  } catch {
    send(res, 500, TEXT, 'internal error');
  }
}

/** Create the HTTP server. Call `.listen(port)` to start it. */
export function createFeedServer (config: ServerConfig, makeClient: PryvClientFactory): Server {
  const feedPrefix = '/' + config.prefix.replace(/^\/+|\/+$/g, '') + '/';
  // `route` wraps its whole body in try/catch and never rejects.
  return createServer((req, res) => { route(req, res, feedPrefix, config, makeClient); });
}

/** Read server configuration from the environment. */
export function configFromEnv (): ServerConfig {
  const config: ServerConfig = { prefix: env.ROUTE_PREFIX ?? 'cal' };
  if (env.AES_KEY_BASE64 != null && env.AES_KEY_BASE64.length > 0) {
    config.key = keyFromBase64(env.AES_KEY_BASE64);
  }
  if (env.PUBLIC_BASE_URL != null && env.PUBLIC_BASE_URL.length > 0) {
    config.baseUrl = env.PUBLIC_BASE_URL;
  }
  if (env.PUBLIC_BASE_TEMPLATE != null && env.PUBLIC_BASE_TEMPLATE.length > 0) {
    if (!BASE_TEMPLATE_RE.test(env.PUBLIC_BASE_TEMPLATE)) {
      throw new Error('PUBLIC_BASE_TEMPLATE must be an http(s) URL holding {username} and ending with /');
    }
    config.baseTemplate = env.PUBLIC_BASE_TEMPLATE;
  }
  return config;
}

async function main (): Promise<void> {
  const { createPryvClient } = await import('./pryv/client.ts');
  const config = configFromEnv();
  const port = Number(env.PORT ?? 3010);
  const server = createFeedServer(config, createPryvClient);
  server.listen(port, () => {
    console.log(`adapter-calendar listening on :${port} (feed /${config.prefix}/, UI /)`);
  });
}

if (argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
