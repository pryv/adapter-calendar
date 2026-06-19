/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
/**
 * node:http server exposing the calendar feed.
 *
 *     GET /<prefix>/<envelope>.ics  ->  text/calendar
 *
 * The server is thin: it parses the route, hands the envelope to the feed
 * handler, and writes the result. Dependencies (the Pryv client) are injected so
 * the routing can be tested without a network.
 */
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import process, { argv, env } from 'node:process';
import { fileURLToPath } from 'node:url';

import { handleFeed, type FeedConfig } from './feed/handler.ts';
import { keyFromBase64 } from './feed/envelope.ts';
import type { PryvClientFactory } from './pryv/types.ts';

const ICS_SUFFIX = '.ics';

/** Server configuration. */
export interface ServerConfig extends FeedConfig {
  /** Route prefix, e.g. `cal` serves `/cal/<envelope>.ics`. */
  prefix: string;
}

function send (res: ServerResponse, status: number, headers: Record<string, string>, body: string): void {
  res.writeHead(status, headers);
  res.end(body);
}

async function route (
  req: IncomingMessage,
  res: ServerResponse,
  prefix: string,
  config: ServerConfig,
  makeClient: PryvClientFactory
): Promise<void> {
  const textPlain = { 'content-type': 'text/plain; charset=utf-8' };
  try {
    if (req.method !== 'GET') return send(res, 405, textPlain, 'method not allowed');

    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (!path.startsWith(prefix) || !path.endsWith(ICS_SUFFIX)) {
      return send(res, 404, textPlain, 'not found');
    }

    const envelope = decodeURIComponent(path.slice(prefix.length, -ICS_SUFFIX.length));
    if (envelope.length === 0) return send(res, 404, textPlain, 'not found');

    const result = await handleFeed(envelope, config, makeClient);
    send(res, result.status, result.headers, result.body);
  } catch {
    send(res, 500, textPlain, 'internal error');
  }
}

/** Create the feed HTTP server. Call `.listen(port)` to start it. */
export function createFeedServer (config: ServerConfig, makeClient: PryvClientFactory): Server {
  const prefix = '/' + config.prefix.replace(/^\/+|\/+$/g, '') + '/';
  // `route` wraps its whole body in try/catch and never rejects.
  return createServer((req, res) => { route(req, res, prefix, config, makeClient); });
}

/** Read server configuration from the environment. */
export function configFromEnv (): ServerConfig {
  const config: ServerConfig = { prefix: env.ROUTE_PREFIX ?? 'cal' };
  if (env.AES_KEY_BASE64 != null && env.AES_KEY_BASE64.length > 0) {
    config.key = keyFromBase64(env.AES_KEY_BASE64);
  }
  return config;
}

async function main (): Promise<void> {
  const { createPryvClient } = await import('./pryv/client.ts');
  const config = configFromEnv();
  const port = Number(env.PORT ?? 3010);
  const server = createFeedServer(config, createPryvClient);
  server.listen(port, () => {
    console.log(`adapter-calendar feed server listening on :${port} (prefix /${config.prefix}/)`);
  });
}

if (argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
