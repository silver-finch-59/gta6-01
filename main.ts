// Solmar Bay — a gta6-01 entry (Node 22, standard library only). The game is
// plain static files under game/ that a desktop browser loads offline
// (game/index.html and its ES modules, three.js vendored as a minified build,
// no network request at all). This program hands the entry in: it copies
// game/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files, in all, or a path under game/ over 1000 bytes: game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
const DOSSIER_OPTIONS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function countFiles(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? countFiles(path) : 1;
  }
  return total;
}

function copyGame() {
  const src = join(here, 'game');
  const dst = join(out, 'game');
  if (!existsSync(src) || !statSync(src).isDirectory()) {
    throw new Error('game/ directory is missing next to main.ts');
  }
  if (!existsSync(join(src, 'index.html'))) {
    throw new Error('game/index.html is missing — the game cannot open');
  }
  mkdirSync(out, { recursive: true });
  cpSync(src, dst, { recursive: true });
  return countFiles(dst);
}

function copyScreenshots() {
  const src = join(here, 'screenshots');
  const dst = join(out, 'screenshots');
  mkdirSync(dst, { recursive: true });
  if (!existsSync(src)) return 0;
  cpSync(src, dst, { recursive: true });
  return readdirSync(dst).filter((name) => !name.startsWith('.')).length;
}

const gameFiles = copyGame();
const shotCount = copyScreenshots();
if (shotCount < 3 || shotCount > 4) {
  throw new Error(`expected 3 or 4 screenshots, found ${shotCount}`);
}

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, DOSSIER_OPTIONS),
);

console.log(`Solmar Bay handed in: ${gameFiles} game files, ${shotCount} screenshots.`);
