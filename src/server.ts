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
 */
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import process, { argv, env } from 'node:process';

import { handleFeed, type FeedConfig } from './feed/handler.ts';
import { keyFromBase64 } from './feed/envelope.ts';
import { handleCreateMapping, parseCreateMappingInput, UiRequestError } from './ui/handler.ts';
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
  /** Externally reachable base URL for emitted subscription URLs; derived from the request when unset. */
  baseUrl?: string;
}

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

function baseUrlFor (req: IncomingMessage, config: ServerConfig): string {
  if (config.baseUrl != null && config.baseUrl.length > 0) return config.baseUrl;
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
  const host = req.headers.host ?? 'localhost';
  return `${proto}://${host}`;
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
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;

    if (req.method === 'POST' && path === '/ui/mappings') {
      return await handleCreate(req, res, config, makeClient);
    }

    if (req.method === 'GET') {
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
