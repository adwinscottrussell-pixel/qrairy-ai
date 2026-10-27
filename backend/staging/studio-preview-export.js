#!/usr/bin/env node
// ============================================================
// studio-preview-export.js — Landing Page Studio V3: the Studio-files-only
// upload for the private Vercel project qraivy-studio-staging.
//
//   node backend/staging/studio-preview-export.js <commit> <empty-out-dir>
//
// Reads the files from the COMMIT (git show), never from the working tree,
// so the upload is exactly that commit. Writes:
//   <out>/upload/frontend/public/...   the Studio page, its CSS / JS, the
//                                      sidebar logo, plus two generated
//                                      files (see GENERATED)
//   <out>/manifest.json                commit, sizes and sha256 of every file
//
// What it leaves out on purpose: the shared vercel.json (its rewrites send
// /lp, /stamp, /wallet, /manifest and /sw.js to the production API) and
// every other page. The upload gets its own small vercel.json instead: no
// rewrites, "/" -> studio.html, noindex / no-store headers.
//
// It never deploys. Deploying (with approval) is described in
// backend/staging/README.md.
// ============================================================
'use strict';
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = 'frontend/public/';
// Every file studio.html needs, besides js/studio/* (taken whole).
const FILES = [
  'studio.html',
  'css/studio.css',
  'dashboard-shell.css',
  'apple-touch-icon.png', // the sidebar logo (dashboard-shell.css)
  'favicon.ico', // browsers ask for it on every page
  'js/qraivy-lang.js',
  'js/admin-shell.js',
  'js/lpV3/core.js',
  // the trusted Gallery controller; the Studio puts its code into the preview frames (2A-3H)
  'js/lpV3/gallery-nav.js',
  // the Deal Builder's starter-image catalog (plain data): which starter ids
  // exist and which are AI-generated, for the Deals preview (D2)
  'js/deal-starter-images.js',
  // the demo Gallery's starter photos, shown from the Studio's own files
  // (js/studio/studio-demo-images.js; 2A-3H)
  'images/deals/starter/bakery-croissants-01.jpg',
  'images/deals/starter/bakery-bread-01.jpg',
  'images/deals/starter/bakery-coffee-01.jpg',
];
const DIRS = ['js/studio/'];

const STUDIO_VERCEL = {
  redirects: [{ source: '/', destination: '/studio.html', permanent: false }],
  headers: [{
    source: '/(.*)',
    headers: [
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      { key: 'Cache-Control', value: 'no-store' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
    ],
  }],
};
const GENERATED = {
  'vercel.json': JSON.stringify(STUDIO_VERCEL, null, 2) + '\n',
  'robots.txt': 'User-agent: *\nDisallow: /\n',
};

// The local files studio.html and the copied CSS load (scripts, stylesheets,
// url(...)); links to other pages (the sidebar) are not dependencies.
function dependencies(files) {
  const out = new Set();
  const html = files.get('studio.html').toString('utf8');
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) out.add(m[1]);
  for (const l of html.match(/<link\b[^>]*>/g) || []) {
    if (/rel="stylesheet"/.test(l)) out.add((l.match(/href="([^"]+)"/) || [])[1]);
  }
  for (const [name, buf] of files) {
    if (!name.endsWith('.css')) continue;
    for (const m of buf.toString('utf8').matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
      if (!/^data:/.test(m[1])) out.add(path.posix.normalize(path.posix.join(path.posix.dirname(name), m[1])));
    }
  }
  return [...out].filter((u) => u && !/^(https?:)?\/\//.test(u)).map((u) => u.split(/[?#]/)[0].replace(/^\//, ''));
}

// The upload from any source: list(dir) -> names under ROOT + dir,
// read(name) -> Buffer. Throws when anything is missing or unsafe.
function buildUpload(source) {
  const names = FILES.slice();
  for (const d of DIRS) for (const n of source.list(d)) names.push(n);
  const files = new Map();
  for (const n of [...new Set(names)].sort()) files.set(n, source.read(n));
  const missing = dependencies(files).filter((d) => !files.has(d));
  if (missing.length) throw new Error('studio.html needs files that are not in the upload: ' + missing.join(', '));
  for (const [n, buf] of files) {
    if (/(^|\/)vercel\.json$/.test(n)) throw new Error('refusing to upload a vercel.json from the repository: ' + n);
    if (!/\.(png|ico|jpg)$/.test(n) && /api\.qraivy\.com/.test(buf.toString('utf8'))) throw new Error(n + ' mentions the production API');
  }
  for (const n of Object.keys(GENERATED)) {
    if (files.has(n)) throw new Error('generated file clashes with a copied one: ' + n);
    files.set(n, Buffer.from(GENERATED[n], 'utf8'));
  }
  return files;
}

function gitSource(repo, sha) {
  const git = (args, enc) => execFileSync('git', ['-C', repo].concat(args), { encoding: enc, maxBuffer: 64 * 1024 * 1024 });
  return {
    list: (dir) => git(['ls-tree', '-r', '--name-only', sha, '--', ROOT + dir], 'utf8').split('\n').filter(Boolean).map((p) => p.slice(ROOT.length)),
    read: (name) => git(['show', sha + ':' + ROOT + name], 'buffer'),
  };
}

function exportCommit(repo, commit, outDir) {
  const sha = execFileSync('git', ['-C', repo, 'rev-parse', '--verify', commit + '^{commit}'], { encoding: 'utf8' }).trim();
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length) throw new Error('output folder is not empty: ' + outDir);
  const files = buildUpload(gitSource(repo, sha));
  const base = path.join(outDir, 'upload', ...ROOT.split('/').filter(Boolean));
  const manifest = { project: 'qraivy-studio-staging', commit: sha, root: ROOT, generated: Object.keys(GENERATED), files: [] };
  for (const [n, buf] of files) {
    const target = path.join(base, ...n.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buf);
    manifest.files.push({ path: n, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') });
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

module.exports = { FILES, DIRS, GENERATED, STUDIO_VERCEL, dependencies, buildUpload, gitSource, exportCommit };

if (require.main === module) {
  const [commit, outDir] = process.argv.slice(2);
  if (!commit || !outDir) { console.error('usage: node backend/staging/studio-preview-export.js <commit> <empty-out-dir>'); process.exit(2); }
  try {
    const repo = path.join(__dirname, '..', '..');
    const m = exportCommit(repo, commit, path.resolve(outDir));
    console.log('commit ' + m.commit + ': ' + m.files.length + ' files -> ' + path.join(path.resolve(outDir), 'upload'));
  } catch (err) { console.error('export failed: ' + err.message); process.exit(1); }
}
