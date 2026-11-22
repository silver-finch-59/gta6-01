// A tiny static server for game/ (Node 22, standard library only), so Solmar Bay
// can be played locally with no build step: `node serve.ts` serves game/ on
// http://localhost:8080, or `node serve.ts --port 9000` for another port. It
// sends the MIME types a browser game needs, refuses any path outside game/,
// and otherwise does nothing clever: this is a development convenience, not
// a web server for the internet.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);

function pickPort() {
  const at = args.indexOf('--port');
  if (at === -1) return 8080;
  const wanted = Number(args[at + 1]);
  if (Number.isInteger(wanted) && wanted > 0 && wanted < 65536) return wanted;
  console.warn(`Ignoring invalid --port value ${args[at + 1]}; using 8080.`);
  return 8080;
}

// --host reaches the game from another device on the same network
// (for example a phone); it defaults to localhost, so nothing is exposed
// unless the flag is given.
function pickHost() {
  const at = args.indexOf('--host');
  if (at === -1) return '127.0.0.1';
  return args[at + 1] ?? '127.0.0.1';
}

const port = pickPort();
const host = pickHost();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

function mimeFor(file) {
  return MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

function resolveInside(requestPath) {
  let pathname = requestPath;
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(root, normalize(pathname)));
  if (file !== root && !file.startsWith(root + sep)) return null;
  return file;
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  const file = resolveInside(pathname);
  if (!file) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let size;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    console.warn(`404 ${pathname}`);
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': mimeFor(file),
    'content-length': size,
    'cache-control': 'no-store',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
}).listen(port, host, () => {
  console.log(`Solmar Bay is on http://${host}:${port}`);
});
