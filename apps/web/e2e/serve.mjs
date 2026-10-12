// Minimal static server that mimics GitHub Pages for end-to-end tests:
// `/path/` serves `/path/index.html`, `/path` redirects to `/path/`, unknown paths get `404.html`.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 4330);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

async function file(path) {
  const info = await stat(path).catch(() => null);
  return info?.isFile() ? path : null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const target = join(root, safe);
  if (!target.startsWith(root)) {
    res.writeHead(400).end();
    return;
  }
  if (!pathname.endsWith('/') && !extname(pathname) && (await file(join(target, 'index.html')))) {
    res.writeHead(301, { Location: `${pathname}/` }).end();
    return;
  }
  const found = (await file(pathname.endsWith('/') ? join(target, 'index.html') : target)) ?? null;
  const path = found ?? join(root, '404.html');
  res.writeHead(found ? 200 : 404, {
    'Content-Type': types[extname(path)] ?? 'application/octet-stream',
  });
  createReadStream(path).pipe(res);
}).listen(port, '127.0.0.1');
