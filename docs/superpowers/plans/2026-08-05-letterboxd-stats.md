# Letterboxd Year-in-Film Stats Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static, client-side website that recreates the Letterboxd "Year in Film" stats page from any Letterboxd export zip, enriched via the TMDB API.

**Architecture:** Plain HTML/CSS/JS with no build step. Classic `<script>` files that attach namespaces to `window` AND export CommonJS modules when `module` exists (so pure logic runs under `node` for tests). Data flow: drop zip → JSZip → `parse.js` → `tmdb.js` enrichment (IndexedDB cache) → `stats.js` pure computation → `render.js` DOM/SVG painting. Spec: `docs/superpowers/specs/2026-08-05-letterboxd-stats-design.md`.

**Tech Stack:** Vanilla JS (ES2020, classic scripts), vendored JSZip 3.10.1 + PapaParse 5.4.1, vendored `@svg-maps/world` SVG, TMDB API v3, node (any ≥16) for unit tests, GitHub Pages for hosting.

## Global Constraints

- No build step, no framework, no CDN references at runtime — every runtime asset is vendored in `vendor/`.
- Every JS module ends with the dual-export footer: `if (typeof module !== 'undefined') module.exports = api; global.LB<Name> = api;` wrapped in `(function (global) { ... })(typeof window !== 'undefined' ? window : globalThis);`.
- Site must work when opened from `file://` — therefore NO `type="module"` scripts, no `fetch()` of local files at runtime (the world map SVG is inlined into `index.html` at authoring time).
- Visual style clones Letterboxd deliberately (brand-clone decision from spec — do not substitute a generic chart palette): background `#14181c`, cards `#2c3440`, body text `#9ab`, headings `#fff`, accent green `#00e054`, blue `#40bcf4`, orange `#ff8000`. Big numerals use `Georgia, serif`; everything else `system-ui` stack.
- Never commit user export data: `.gitignore` contains `*.zip` and `/data/`.
- Tests run with `node tests/run.js` and must exit 0. No test framework.
- Commits: single-line imperative messages, no Co-Authored-By (user rule).
- TMDB key is user-supplied at runtime (localStorage `lbx-tmdb-key`); never hardcode a key in the repo.

## File Structure

```
index.html                 — the whole page: setup panel, drop zone, progress, all stat sections, inlined world map SVG
css/style.css              — theme + all component styles
js/parse.js                — LBParse: CSV → data model, film index          (pure, tested)
js/stats.js                — LBStats: (data, index, tmdbMap, year) → stats  (pure, tested)
js/tmdb.js                 — LBTmdb: TmdbClient (injectable fetch + cache)  (tested with fakes)
js/render.js               — LBRender: stats → DOM/SVG
js/main.js                 — orchestration, IndexedDB cache, UI state machine
vendor/jszip.min.js
vendor/papaparse.min.js
tests/run.js               — tiny runner + assert
tests/parse.test.js
tests/stats.test.js
tests/tmdb.test.js
tests/fixtures.js          — shared CSV/meta fixtures
dev.html                   — loads fixtures + render.js for visual work without TMDB/zip
```

---

### Task 1: Scaffold, vendored libraries, test harness

**Files:**
- Create: `.gitignore`, `index.html` (skeleton), `css/style.css` (tokens only), `tests/run.js`, `vendor/jszip.min.js`, `vendor/papaparse.min.js`

**Interfaces:**
- Produces: `tests/run.js` auto-runs every `tests/*.test.js`; global test helpers `test(name, fn)`, `eq(actual, expected)` (deep equality via JSON), `ok(value)`.

- [ ] **Step 1: Create `.gitignore`**

```gitignore
*.zip
/data/
```

- [ ] **Step 2: Download vendor libraries**

```bash
mkdir -p vendor css js tests
curl -L -o vendor/jszip.min.js   https://unpkg.com/jszip@3.10.1/dist/jszip.min.js
curl -L -o vendor/papaparse.min.js https://unpkg.com/papaparse@5.4.1/papaparse.min.js
```

Verify both files are non-empty and start with JS (not an HTML error page): `head -c 200 vendor/jszip.min.js`.

- [ ] **Step 3: Write `tests/run.js`**

```js
'use strict';
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
global.test = (name, fn) => {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); }
};
global.eq = (actual, expected) => {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`expected ${b}\n       got      ${a}`);
};
global.ok = v => { if (!v) throw new Error(`expected truthy, got ${JSON.stringify(v)}`); };

for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js'))) {
  console.log(f);
  require(path.join(__dirname, f));
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 4: Write skeleton `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Year in Film — Letterboxd Stats</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<header class="topbar"><span class="logo"><i class="dot g"></i><i class="dot b"></i><i class="dot o"></i></span> <strong>Year in Film</strong> <span class="muted">— free Letterboxd stats from your export</span></header>
<main id="app">
  <section id="setup" class="panel"></section>
  <section id="progress" class="panel hidden"></section>
  <section id="stats" class="hidden"></section>
</main>
<script src="vendor/jszip.min.js"></script>
<script src="vendor/papaparse.min.js"></script>
<script src="js/parse.js"></script>
<script src="js/tmdb.js"></script>
<script src="js/stats.js"></script>
<script src="js/render.js"></script>
<script src="js/main.js"></script>
</body>
</html>
```

(`js/*.js` don't exist yet — create all five as empty files so the page loads without 404 noise: `touch js/parse.js js/tmdb.js js/stats.js js/render.js js/main.js`.)

- [ ] **Step 5: Write theme tokens in `css/style.css`**

```css
:root {
  --bg: #14181c; --card: #2c3440; --card-2: #232b34;
  --text: #9ab; --text-bright: #fff; --muted: #678;
  --green: #00e054; --blue: #40bcf4; --orange: #ff8000;
  --font-num: Georgia, 'Times New Roman', serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font: 14px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.hidden { display: none !important; }
.muted { color: var(--muted); }
.topbar { padding: 12px 24px; border-bottom: 1px solid #24303c; color: var(--text-bright); }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 2px; }
.dot.g { background: var(--green); } .dot.b { background: var(--blue); } .dot.o { background: var(--orange); }
main { max-width: 960px; margin: 0 auto; padding: 24px; }
.panel { background: var(--card-2); border-radius: 8px; padding: 24px; margin: 24px 0; }
```

- [ ] **Step 6: Verify**

Run: `node tests/run.js` → prints `0 passed, 0 failed`, exit 0.
Open `index.html` in a browser (or just confirm no 404s conceptually) — dark page with topbar.

- [ ] **Step 7: Commit**

```bash
git add .gitignore index.html css/style.css tests/run.js vendor/ js/
git commit -m "Scaffold static site with vendored libs and test harness"
```

---

### Task 2: `parse.js` — CSV parsing and film index

**Files:**
- Create: `js/parse.js`, `tests/parse.test.js`, `tests/fixtures.js`

**Interfaces:**
- Consumes: `Papa.parse` (vendor), test helpers from Task 1.
- Produces (used by stats.js, main.js):
  - `LBParse.parseExport(files: {relPath: string(csvText)}) → data` where `data = { profile: {username, displayName, joined}, diary: Entry[], watched: Entry[], ratings: Entry[], reviews: Entry[], watchlist: Entry[], likedFilms: Entry[], lists: [{name, count}] }` and `Entry = { name, year:number|null, uri, rating:number|null, rewatch:boolean, tags:string[], date:'YYYY-MM-DD'|null, watchedDate:'YYYY-MM-DD'|null, review?:string }`.
  - `LBParse.buildFilmIndex(data) → Map<key, Film>` with `Film = { key, name, year, uri, rating, watchedDates:string[], rewatchCount:number, reviewed:boolean, liked:boolean, inWatchlist:boolean, watched:boolean }` (`watched` true if the film appears in `watched.csv` or the diary — watchlist-only films have `watched:false`).
  - `LBParse.filmKey(name, year) → string` — `"<lowercased name>|<year>"`.

- [ ] **Step 1: Write fixtures (`tests/fixtures.js`)**

```js
'use strict';
const DIARY_CSV = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
2024-01-06,Parasite,2019,https://boxd.it/hTha,5,,,2024-01-05
2024-03-02,Parasite,2019,https://boxd.it/hThb,5,Yes,,2024-03-01
2024-07-15,"Love, Simon",2018,https://boxd.it/abc1,3.5,,"cinema, date night",2024-07-14
2023-12-31,Juno,2007,https://boxd.it/abc2,4,,,2023-12-30
`;
const WATCHED_CSV = `Date,Name,Year,Letterboxd URI
2024-01-06,Parasite,2019,https://boxd.it/hTha
2024-07-15,"Love, Simon",2018,https://boxd.it/abc1
2023-12-31,Juno,2007,https://boxd.it/abc2
`;
const RATINGS_CSV = `Date,Name,Year,Letterboxd URI,Rating
2024-01-06,Parasite,2019,https://boxd.it/hTha,5
2023-12-31,Juno,2007,https://boxd.it/abc2,4
`;
const REVIEWS_CSV = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date
2024-01-06,Parasite,2019,https://boxd.it/hTha,5,,Masterpiece.,,2024-01-05
`;
const WATCHLIST_CSV = `Date,Name,Year,Letterboxd URI
2024-02-01,Dune: Part Two,2024,https://boxd.it/xyz1
`;
const LIKES_FILMS_CSV = `Date,Name,Year,Letterboxd URI
2024-01-07,Parasite,2019,https://boxd.it/hTha
`;
const PROFILE_CSV = `Date Joined,Username,Given Name,Family Name,Email Address,Location,Website,Bio,Pronoun,Favorite Films
2020-03-13,filmfan,Alex,,,Barcelona,,,She / her,
`;
const FILES = {
  'diary.csv': DIARY_CSV, 'watched.csv': WATCHED_CSV, 'ratings.csv': RATINGS_CSV,
  'reviews.csv': REVIEWS_CSV, 'watchlist.csv': WATCHLIST_CSV,
  'likes/films.csv': LIKES_FILMS_CSV, 'profile.csv': PROFILE_CSV,
  'lists/top-10.csv': 'Position,Name,Year,URL\n1,Juno,2007,x\n',
};
// TMDB metadata fixture keyed by filmKey — used by stats tests and dev.html
const META = {
  'parasite|2019': { id: 496243, title: 'Parasite', runtime: 133, genres: ['Comedy', 'Thriller', 'Drama'], countries: [{ code: 'KR', name: 'South Korea' }], languages: ['Korean'], releaseDate: '2019-05-30', posterPath: '/p1.jpg', popularity: 90, voteAverage: 8.5, voteCount: 17000, cast: [{ name: 'Song Kang-ho', profilePath: '/s.jpg' }], crew: [{ name: 'Bong Joon Ho', job: 'Director' }] },
  'love, simon|2018': { id: 449176, title: 'Love, Simon', runtime: 110, genres: ['Comedy', 'Romance', 'Drama'], countries: [{ code: 'US', name: 'United States of America' }], languages: ['English'], releaseDate: '2018-02-16', posterPath: '/p2.jpg', popularity: 40, voteAverage: 8.0, voteCount: 6000, cast: [{ name: 'Nick Robinson', profilePath: '/n.jpg' }], crew: [{ name: 'Greg Berlanti', job: 'Director' }] },
  'juno|2007': { id: 7326, title: 'Juno', runtime: 96, genres: ['Comedy', 'Drama'], countries: [{ code: 'US', name: 'United States of America' }], languages: ['English'], releaseDate: '2007-12-05', posterPath: '/p3.jpg', popularity: 25, voteAverage: 7.2, voteCount: 7000, cast: [{ name: 'Elliot Page', profilePath: '/e.jpg' }], crew: [{ name: 'Jason Reitman', job: 'Director' }] },
  'dune: part two|2024': { id: 693134, title: 'Dune: Part Two', runtime: 167, genres: ['Science Fiction', 'Adventure'], countries: [{ code: 'US', name: 'United States of America' }], languages: ['English'], releaseDate: '2024-02-27', posterPath: '/p4.jpg', popularity: 300, voteAverage: 8.2, voteCount: 5000, cast: [], crew: [] },
};
module.exports = { FILES, META };
```

- [ ] **Step 2: Write failing tests (`tests/parse.test.js`)**

```js
'use strict';
const { FILES } = require('./fixtures.js');
const { parseExport, buildFilmIndex, filmKey } = require('../js/parse.js');

test('parseExport reads diary with quoted names and tags', () => {
  const d = parseExport(FILES);
  eq(d.diary.length, 4);
  eq(d.diary[2].name, 'Love, Simon');
  eq(d.diary[2].tags, ['cinema', 'date night']);
  eq(d.diary[1].rewatch, true);
  eq(d.diary[0].rating, 5);
  eq(d.diary[0].watchedDate, '2024-01-05');
});

test('parseExport reads profile, lists, likes', () => {
  const d = parseExport(FILES);
  eq(d.profile.username, 'filmfan');
  eq(d.profile.displayName, 'Alex');
  eq(d.lists, [{ name: 'top-10', count: 1 }]);
  eq(d.likedFilms.length, 1);
});

test('parseExport tolerates missing files', () => {
  const d = parseExport({ 'diary.csv': FILES['diary.csv'] });
  eq(d.diary.length, 4);
  eq(d.watchlist, []);
  eq(d.profile.username, '');
});

test('filmKey lowercases', () => eq(filmKey('Parasite', 2019), 'parasite|2019'));

test('buildFilmIndex merges sources', () => {
  const d = parseExport(FILES);
  const idx = buildFilmIndex(d);
  const p = idx.get('parasite|2019');
  eq(p.watchedDates, ['2024-01-05', '2024-03-01']);
  eq(p.rewatchCount, 1);
  eq(p.rating, 5);
  eq(p.reviewed, true);
  eq(p.liked, true);
  eq(p.watched, true);
  const dune = idx.get('dune: part two|2024');
  eq(dune.inWatchlist, true);
  eq(dune.watched, false);
});
```

- [ ] **Step 3: Run to verify failure** — `node tests/run.js` → FAIL (parse.js is empty, require returns `{}`, `parseExport is not a function`).

- [ ] **Step 4: Implement `js/parse.js`**

```js
(function (global) {
  'use strict';
  const Papa = global.Papa || require('../vendor/papaparse.min.js');

  function parseCsv(text) {
    if (!text) return [];
    const res = Papa.parse(text.replace(/^﻿/, '').trim(), { header: true, skipEmptyLines: true });
    return res.data;
  }

  function toEntry(row) {
    return {
      name: row['Name'] || '',
      year: row['Year'] ? parseInt(row['Year'], 10) : null,
      uri: row['Letterboxd URI'] || null,
      rating: row['Rating'] ? parseFloat(row['Rating']) : null,
      rewatch: row['Rewatch'] === 'Yes',
      tags: row['Tags'] ? row['Tags'].split(',').map(t => t.trim()).filter(Boolean) : [],
      date: row['Date'] || null,
      watchedDate: row['Watched Date'] || null,
      review: row['Review'] || undefined,
    };
  }

  function parseExport(files) {
    const get = n => files[n] || '';
    const profileRow = parseCsv(get('profile.csv'))[0] || {};
    const listPaths = Object.keys(files).filter(p => /^lists\/.+\.csv$/.test(p));
    return {
      profile: {
        username: profileRow['Username'] || '',
        displayName: profileRow['Given Name'] || profileRow['Username'] || '',
        joined: profileRow['Date Joined'] || null,
      },
      diary: parseCsv(get('diary.csv')).map(toEntry),
      watched: parseCsv(get('watched.csv')).map(toEntry),
      ratings: parseCsv(get('ratings.csv')).map(toEntry),
      reviews: parseCsv(get('reviews.csv')).map(toEntry),
      watchlist: parseCsv(get('watchlist.csv')).map(toEntry),
      likedFilms: parseCsv(get('likes/films.csv')).map(toEntry),
      lists: listPaths.map(p => ({ name: p.slice('lists/'.length, -'.csv'.length), count: parseCsv(files[p]).length })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  function filmKey(name, year) { return `${(name || '').toLowerCase()}|${year || ''}`; }

  function buildFilmIndex(data) {
    const index = new Map();
    const ensure = e => {
      const k = filmKey(e.name, e.year);
      if (!index.has(k)) index.set(k, {
        key: k, name: e.name, year: e.year, uri: e.uri, rating: null,
        watchedDates: [], rewatchCount: 0, reviewed: false, liked: false,
        inWatchlist: false, watched: false,
      });
      const f = index.get(k);
      if (!f.uri && e.uri) f.uri = e.uri;
      return f;
    };
    for (const e of data.watched) ensure(e).watched = true;
    for (const e of data.diary) {
      const f = ensure(e);
      f.watched = true;
      if (e.watchedDate) f.watchedDates.push(e.watchedDate);
      if (e.rewatch) f.rewatchCount++;
      if (e.rating != null) f.rating = e.rating;
    }
    for (const e of data.ratings) { const f = ensure(e); f.watched = true; if (f.rating == null) f.rating = e.rating; }
    for (const e of data.reviews) { const f = ensure(e); f.watched = true; f.reviewed = true; }
    for (const e of data.likedFilms) { ensure(e).liked = true; }
    for (const e of data.watchlist) { ensure(e).inWatchlist = true; }
    for (const f of index.values()) f.watchedDates.sort();
    return index;
  }

  const api = { parseCsv, parseExport, buildFilmIndex, filmKey };
  if (typeof module !== 'undefined') module.exports = api;
  global.LBParse = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 5: Run tests** — `node tests/run.js` → all parse tests PASS. (If `require('../vendor/papaparse.min.js')` fails, PapaParse UMD supports CommonJS — check the vendor download wasn't an error page.)

- [ ] **Step 6: Commit**

```bash
git add js/parse.js tests/parse.test.js tests/fixtures.js
git commit -m "Add export CSV parsing and film index"
```

---

### Task 3: `tmdb.js` — TMDB client with injectable fetch and cache

**Files:**
- Create: `js/tmdb.js`, `tests/tmdb.test.js`

**Interfaces:**
- Consumes: `LBParse.filmKey` shape (`film.key`, `film.name`, `film.year`).
- Produces (used by main.js):
  - `LBTmdb.TmdbClient` — `new TmdbClient({ apiKey, cache, fetchFn, delayMs })`; `cache` is `{ get(key)→Promise<meta|null|undefined>, set(key, meta|null)→Promise }` (`undefined` = not cached, `null` = cached no-match).
  - `client.enrich(films: Film[], onProgress(done, total, film)) → Promise<Map<key, Meta|null>>`.
  - `Meta = { id, title, runtime, genres:string[], countries:[{code,name}], languages:string[], releaseDate, posterPath, popularity, voteAverage, voteCount, cast:[{name, profilePath}] (≤15), crew:[{name, job}] }`.
  - Throws `Error('TMDB_UNAUTHORIZED')` on 401 (main.js re-prompts for key).
  - `LBTmdb.IMG = 'https://image.tmdb.org/t/p/'` (render.js builds `IMG + 'w185' + posterPath`).

- [ ] **Step 1: Write failing tests (`tests/tmdb.test.js`)**

```js
'use strict';
const { TmdbClient } = require('../js/tmdb.js');

function fakeFetch(routes) {
  const calls = [];
  const fn = async url => {
    calls.push(url);
    for (const [pattern, resp] of routes) {
      if (url.includes(pattern)) {
        if (typeof resp === 'number') return { ok: false, status: resp, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => resp };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  fn.calls = calls;
  return fn;
}
const mapCache = () => {
  const m = new Map();
  return { get: async k => m.get(k), set: async (k, v) => { m.set(k, v); }, raw: m };
};
const DETAILS = { id: 1, title: 'Parasite', runtime: 133, genres: [{ name: 'Drama' }], production_countries: [{ iso_3166_1: 'KR', name: 'South Korea' }], spoken_languages: [{ english_name: 'Korean' }], release_date: '2019-05-30', poster_path: '/p.jpg', popularity: 90, vote_average: 8.5, vote_count: 17000, credits: { cast: [{ name: 'Song Kang-ho', profile_path: '/s.jpg' }], crew: [{ name: 'Bong Joon Ho', job: 'Director', department: 'Directing' }] } };
const film = { key: 'parasite|2019', name: 'Parasite', year: 2019 };

test('enrich searches, fetches details, maps meta', async () => {}); // placeholder replaced below

(async () => {
  {
    const f = fakeFetch([
      ['/search/movie', { results: [{ id: 1, title: 'Parasite', original_title: '기생충' }] }],
      ['/movie/1', DETAILS],
    ]);
    const c = new TmdbClient({ apiKey: 'k', cache: mapCache(), fetchFn: f, delayMs: 0 });
    const out = await c.enrich([film], null);
    const meta = out.get('parasite|2019');
    if (meta.runtime !== 133 || meta.countries[0].code !== 'KR' || meta.crew[0].job !== 'Director') throw new Error('meta mapping wrong: ' + JSON.stringify(meta));
    if (!f.calls[0].includes('primary_release_year=2019')) throw new Error('search missing year param');
    console.log('  ok   enrich maps meta');
  }
  {
    const cache = mapCache();
    await cache.set('parasite|2019', { id: 1, runtime: 133 });
    const f = fakeFetch([]);
    const c = new TmdbClient({ apiKey: 'k', cache, fetchFn: f, delayMs: 0 });
    const out = await c.enrich([film], null);
    if (out.get('parasite|2019').runtime !== 133) throw new Error('cache not used');
    if (f.calls.length !== 0) throw new Error('fetched despite cache');
    console.log('  ok   enrich uses cache');
  }
  {
    const f = fakeFetch([['/search/movie', { results: [] }]]);
    const cache = mapCache();
    const c = new TmdbClient({ apiKey: 'k', cache, fetchFn: f, delayMs: 0 });
    const out = await c.enrich([film], null);
    if (out.get('parasite|2019') !== null) throw new Error('no-match should be null');
    if (cache.raw.get('parasite|2019') !== null) throw new Error('no-match should be cached as null');
    if (f.calls.length !== 2) throw new Error('should retry search without year, got ' + f.calls.length);
    console.log('  ok   enrich caches no-match as null');
  }
  {
    const f = fakeFetch([['/search/movie', 401]]);
    const c = new TmdbClient({ apiKey: 'bad', cache: mapCache(), fetchFn: f, delayMs: 0 });
    let threw = false;
    try { await c.enrich([film], null); } catch (e) { threw = e.message === 'TMDB_UNAUTHORIZED'; }
    if (!threw) throw new Error('401 should throw TMDB_UNAUTHORIZED');
    console.log('  ok   401 throws');
  }
})().catch(e => { console.log('  FAIL tmdb async: ' + e.message); process.exitCode = 1; });
```

Note: the async IIFE pattern is used because `tests/run.js` is synchronous; async failures set `process.exitCode = 1` directly. Remove the placeholder sync `test(...)` line — it is not needed (delete it when writing the file).

- [ ] **Step 2: Run to verify failure** — `node tests/run.js` → FAIL (`TmdbClient is not a constructor`).

- [ ] **Step 3: Implement `js/tmdb.js`**

```js
(function (global) {
  'use strict';
  const API = 'https://api.themoviedb.org/3';
  const IMG = 'https://image.tmdb.org/t/p/';
  const KEEP_JOBS = new Set(['Director', 'Screenplay', 'Writer', 'Producer', 'Original Music Composer', 'Director of Photography', 'Editor', 'Casting']);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function normTitle(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  class TmdbClient {
    constructor({ apiKey, cache, fetchFn, delayMs }) {
      this.apiKey = apiKey;
      this.cache = cache;
      this.fetchFn = fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(global) : null);
      this.delayMs = delayMs == null ? 30 : delayMs;
    }

    async _get(path, params) {
      const qs = new URLSearchParams(Object.assign({ api_key: this.apiKey }, params || {}));
      const url = `${API}${path}?${qs}`;
      for (let attempt = 0; attempt < 5; attempt++) {
        let res;
        try { res = await this.fetchFn(url); }
        catch (e) { await sleep(500 * 2 ** attempt); continue; } // network blip
        if (res.status === 401) throw new Error('TMDB_UNAUTHORIZED');
        if (res.status === 429 || res.status >= 500) { await sleep(500 * 2 ** attempt); continue; }
        if (!res.ok) return null;
        return res.json();
      }
      throw new Error('TMDB_UNAVAILABLE');
    }

    async _search(name, year) {
      const params = { query: name };
      if (year) params.primary_release_year = year;
      const json = await this._get('/search/movie', params);
      const results = (json && json.results) || [];
      if (!results.length) return null;
      const nt = normTitle(name);
      return results.find(r => normTitle(r.title) === nt || normTitle(r.original_title) === nt) || results[0];
    }

    async lookup(film) {
      let hit = await this._search(film.name, film.year);
      if (!hit && film.year) hit = await this._search(film.name, null);
      if (!hit) return null;
      const d = await this._get(`/movie/${hit.id}`, { append_to_response: 'credits' });
      if (!d) return null;
      const credits = d.credits || {};
      return {
        id: d.id, title: d.title, runtime: d.runtime || 0,
        genres: (d.genres || []).map(g => g.name),
        countries: (d.production_countries || []).map(c => ({ code: c.iso_3166_1, name: c.name })),
        languages: (d.spoken_languages || []).map(l => l.english_name || l.name).filter(Boolean),
        releaseDate: d.release_date || null,
        posterPath: d.poster_path || null,
        popularity: d.popularity || 0,
        voteAverage: d.vote_average || 0,
        voteCount: d.vote_count || 0,
        cast: (credits.cast || []).slice(0, 15).map(p => ({ name: p.name, profilePath: p.profile_path || null })),
        crew: (credits.crew || []).filter(p => KEEP_JOBS.has(p.job)).map(p => ({ name: p.name, job: p.job })),
      };
    }

    async enrich(films, onProgress) {
      const out = new Map();
      let done = 0;
      for (const film of films) {
        let meta = await this.cache.get(film.key);
        if (meta === undefined) {
          try {
            meta = await this.lookup(film);
            await this.cache.set(film.key, meta); // null (no-match) is cached too
          } catch (e) {
            if (e.message === 'TMDB_UNAUTHORIZED') throw e;
            meta = null; // TMDB_UNAVAILABLE: do NOT cache, retry next run
          }
          if (this.delayMs) await sleep(this.delayMs);
        }
        out.set(film.key, meta);
        done++;
        if (onProgress) onProgress(done, films.length, film);
      }
      return out;
    }
  }

  const api = { TmdbClient, IMG, normTitle };
  if (typeof module !== 'undefined') module.exports = api;
  global.LBTmdb = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run tests** — `node tests/run.js` → all four tmdb checks print `ok`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add js/tmdb.js tests/tmdb.test.js
git commit -m "Add TMDB client with caching, retry, and title matching"
```

---

### Task 4: `stats.js` part 1 — export-only stats

**Files:**
- Create: `js/stats.js`, `tests/stats.test.js`

**Interfaces:**
- Consumes: `data` and `filmIndex` from `LBParse`; `year` is a number or `'all'`.
- Produces (all on `LBStats`, all pure; used by Task 5, render.js, main.js):
  - `availableYears(data) → number[]` (desc, from diary watchedDates)
  - `entriesForYear(data, year) → Entry[]` (diary entries with a watchedDate in `year`, sorted by watchedDate asc; `'all'` = every dated entry)
  - `headerTotals(data, entries, year) → { diaryEntries, reviews, likes, lists }` (reviews counted by watchedDate year; likes & lists by `date` year; `'all'` counts everything)
  - `byWeek(entries, year) → number[52]`
  - `weekdayCounts(entries) → number[7]` (Mon-first)
  - `averages(entries, year) → { count, perMonth, perWeek }` (1-decimal rounding; for `'all'`, months = span between first and last entry inclusive)
  - `milestones(entries) → { first: Entry|null, last: Entry|null }`
  - `ratingsHistogram(entries) → { buckets: number[10], total }` (index 0 = ★½ 0.5 … index 9 = 5.0)
  - `breakdown(data, entries, filmIndex, year) → { premieres: {yes, no}, rewatches: {first, re}, reviewed: {yes, no} }` (premieres: film release `year === year`; for `'all'` premieres is `null`; reviewed matched by name+watchedDate against `data.reviews`)
  - `decades(entries) → [{ decade: '1990s', count }]` sorted by decade (for the all-time premieres slot)
  - `watchlistAdded(data, year) → number`

- [ ] **Step 1: Write failing tests** (append to new `tests/stats.test.js`)

```js
'use strict';
const { FILES, META } = require('./fixtures.js');
const { parseExport, buildFilmIndex } = require('../js/parse.js');
const S = require('../js/stats.js');

const data = parseExport(FILES);
const idx = buildFilmIndex(data);

test('availableYears finds diary years desc', () => eq(S.availableYears(data), [2024, 2023]));

test('entriesForYear filters by watched date', () => {
  eq(S.entriesForYear(data, 2024).length, 3);
  eq(S.entriesForYear(data, 2023).length, 1);
  eq(S.entriesForYear(data, 'all').length, 4);
  eq(S.entriesForYear(data, 2024)[0].name, 'Parasite');
});

test('headerTotals counts entries, reviews, likes', () => {
  const t = S.headerTotals(data, S.entriesForYear(data, 2024), 2024);
  eq(t, { diaryEntries: 3, reviews: 1, likes: 1, lists: 0 });
});

test('byWeek buckets', () => {
  const w = S.byWeek(S.entriesForYear(data, 2024), 2024);
  eq(w.length, 52);
  eq(w[0], 1);            // Jan 5
  eq(w.reduce((a, b) => a + b, 0), 3);
});

test('weekdayCounts is Mon-first', () => {
  // 2024-01-05 Fri, 2024-03-01 Fri, 2024-07-14 Sun
  eq(S.weekdayCounts(S.entriesForYear(data, 2024)), [0, 0, 0, 0, 2, 0, 1]);
});

test('averages', () => {
  eq(S.averages(S.entriesForYear(data, 2024), 2024), { count: 3, perMonth: 0.3, perWeek: 0.1 });
});

test('milestones first and last', () => {
  const m = S.milestones(S.entriesForYear(data, 2024));
  eq(m.first.watchedDate, '2024-01-05');
  eq(m.last.watchedDate, '2024-07-14');
});

test('ratingsHistogram', () => {
  const h = S.ratingsHistogram(S.entriesForYear(data, 2024));
  eq(h.total, 3);
  eq(h.buckets[9], 2);  // two 5s
  eq(h.buckets[6], 1);  // one 3.5
});

test('breakdown', () => {
  const b = S.breakdown(data, S.entriesForYear(data, 2024), idx, 2024);
  eq(b.premieres, { yes: 0, no: 3 });
  eq(b.rewatches, { first: 2, re: 1 });
  eq(b.reviewed, { yes: 1, no: 2 });
});

test('decades', () => {
  eq(S.decades(S.entriesForYear(data, 'all')), [{ decade: '2000s', count: 1 }, { decade: '2010s', count: 3 }]);
});

test('watchlistAdded', () => eq(S.watchlistAdded(data, 2024), 1));
```

- [ ] **Step 2: Run to verify failure** — `node tests/run.js` → stats tests FAIL.

- [ ] **Step 3: Implement part 1 of `js/stats.js`**

```js
(function (global) {
  'use strict';
  const round1 = n => Math.round(n * 10) / 10;
  const yearOf = d => d ? parseInt(d.slice(0, 4), 10) : null;

  function availableYears(data) {
    const ys = new Set(data.diary.map(e => yearOf(e.watchedDate)).filter(Boolean));
    return [...ys].sort((a, b) => b - a);
  }

  function entriesForYear(data, year) {
    return data.diary
      .filter(e => e.watchedDate && (year === 'all' || yearOf(e.watchedDate) === year))
      .sort((a, b) => a.watchedDate.localeCompare(b.watchedDate));
  }

  function headerTotals(data, entries, year) {
    const inYear = d => year === 'all' ? !!d : yearOf(d) === year;
    return {
      diaryEntries: entries.length,
      reviews: data.reviews.filter(r => inYear(r.watchedDate)).length,
      likes: data.likedFilms.filter(l => inYear(l.date)).length,
      lists: data.lists.length && year === 'all' ? data.lists.length : 0,
    };
  }

  function dayOfYear(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const start = Date.UTC(d.getUTCFullYear(), 0, 1);
    return Math.floor((d.getTime() - start) / 86400000);
  }

  function byWeek(entries, year) {
    const weeks = new Array(52).fill(0);
    for (const e of entries) weeks[Math.min(51, Math.floor(dayOfYear(e.watchedDate) / 7))]++;
    return weeks;
  }

  function weekdayCounts(entries) {
    const days = new Array(7).fill(0);
    for (const e of entries) {
      const js = new Date(e.watchedDate + 'T00:00:00Z').getUTCDay(); // 0=Sun
      days[(js + 6) % 7]++; // Mon-first
    }
    return days;
  }

  function averages(entries, year) {
    let months = 12;
    if (year === 'all' && entries.length) {
      const first = entries[0].watchedDate, last = entries[entries.length - 1].watchedDate;
      months = Math.max(1, (yearOf(last) - yearOf(first)) * 12 + (+last.slice(5, 7) - +first.slice(5, 7)) + 1);
    }
    return { count: entries.length, perMonth: round1(entries.length / months), perWeek: round1(entries.length / (months * 4.345)) };
  }

  function milestones(entries) {
    return { first: entries[0] || null, last: entries[entries.length - 1] || null };
  }

  function ratingsHistogram(entries) {
    const buckets = new Array(10).fill(0);
    let total = 0;
    for (const e of entries) {
      if (e.rating == null) continue;
      const i = Math.round(e.rating * 2) - 1; // 0.5→0 … 5→9
      if (i >= 0 && i < 10) { buckets[i]++; total++; }
    }
    return { buckets, total };
  }

  function breakdown(data, entries, filmIndex, year) {
    const reviewKeys = new Set(data.reviews.map(r => `${(r.name || '').toLowerCase()}|${r.watchedDate}`));
    let premYes = 0, premNo = 0, first = 0, re = 0, revYes = 0, revNo = 0;
    for (const e of entries) {
      if (e.year === yearOf(e.watchedDate)) premYes++; else premNo++;
      if (e.rewatch) re++; else first++;
      if (reviewKeys.has(`${(e.name || '').toLowerCase()}|${e.watchedDate}`)) revYes++; else revNo++;
    }
    return {
      premieres: year === 'all' ? null : { yes: premYes, no: premNo },
      rewatches: { first, re },
      reviewed: { yes: revYes, no: revNo },
    };
  }

  function decades(entries) {
    const m = new Map();
    for (const e of entries) {
      if (!e.year) continue;
      const dec = `${Math.floor(e.year / 10) * 10}s`;
      m.set(dec, (m.get(dec) || 0) + 1);
    }
    return [...m.entries()].map(([decade, count]) => ({ decade, count })).sort((a, b) => a.decade.localeCompare(b.decade));
  }

  function watchlistAdded(data, year) {
    return data.watchlist.filter(w => year === 'all' ? true : yearOf(w.date) === year).length;
  }

  const api = { availableYears, entriesForYear, headerTotals, byWeek, weekdayCounts, averages, milestones, ratingsHistogram, breakdown, decades, watchlistAdded, yearOf, round1 };
  if (typeof module !== 'undefined') module.exports = api;
  global.LBStats = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

Note on `headerTotals.lists`: per-year list counts aren't derivable (list CSVs carry no dates) — show total list count only in 'all' view; render.js hides the tile when 0. Note on `breakdown.premieres`: uses the film's release year from the CSV (matches Letterboxd's "2024 Premieres" semantics), so no TMDB dependency.

- [ ] **Step 4: Run tests** — `node tests/run.js` → all pass. If `averages` expectations are off by 0.1, recheck the fixture math (3/12 = 0.25 → 0.3 with round1; 3/52.14 ≈ 0.06 → 0.1) — fix the implementation, not the test.

- [ ] **Step 5: Commit**

```bash
git add js/stats.js tests/stats.test.js
git commit -m "Add export-only stats computations"
```

---

### Task 5: `stats.js` part 2 — TMDB-dependent stats + `computeStats` orchestrator

**Files:**
- Modify: `js/stats.js` (add functions + extend `api`)
- Modify: `tests/stats.test.js` (append tests)

**Interfaces:**
- Consumes: `tmdbMap: Map<key, Meta|null>` (Task 3 shape), `filmKey` from LBParse.
- Produces (appended to `LBStats`):
  - `uniqueFilms(entries, filmIndex) → Film[]` (unique by key, in first-watch order)
  - `hoursWatched(entries, tmdbMap) → number` (1-decimal; every entry counts, rewatches included)
  - `rankBy(entries, filmIndex, tmdbMap, extract) → [{ label, code?, count, avgRating, films:string[] }]` — generic list ranker; `extract(meta) → string[] | {label, code}[]`; counts unique films; `avgRating` from user ratings (null-safe); sorted count desc then label asc.
  - `genreStats / countryStats / languageStats (entries, filmIndex, tmdbMap) → { mostWatched: [...], highestRated: [...] }` (highestRated = same rows, ≥1 rated film, sorted avgRating desc, count desc)
  - `castCrew(entries, filmIndex, tmdbMap) → { cast: [{ name, profilePath, count, avgRating }] (count≥2, top 12), crew: { [job]: [{ name, count, avgRating }] } }`
  - `highsLows(entries, filmIndex, tmdbMap) → { highestAvg, lowestAvg, mostPopular, mostObscure, newest, oldest, longest, shortest }` — each `{ film, meta, value }` or null; popularity via voteCount, only films with meta.
  - `worldMap(entries, filmIndex, tmdbMap) → Map<code, count>`
  - `watchlistUnseen(data, filmIndex, tmdbMap, n=8) → Film[]` (in watchlist, not watched, has meta, sorted voteAverage desc)
  - `computeStats(data, filmIndex, tmdbMap, year) → Stats` — one object with every section: `{ year, profile, totals, hours, highestRated (top 8 rated Films desc, ties by meta.voteAverage), week, weekdays, averages, milestones, genres, countries, languages, breakdown, decades, histogram, castCrew, highsLows, filmsGrid (uniqueFilms), map, watchlist: { added, unseen }, unmatched: Film[] }`.

- [ ] **Step 1: Write failing tests** (append to `tests/stats.test.js`)

```js
const { filmKey } = require('../js/parse.js');
const tmdbMap = new Map(Object.entries(META));
const e24 = S.entriesForYear(data, 2024);

test('hoursWatched counts rewatches', () => {
  // Parasite 133×2 + Love, Simon 110 = 376 min
  eq(S.hoursWatched(e24, tmdbMap), 6.3);
});

test('genreStats most watched', () => {
  const g = S.genreStats(e24, idx, tmdbMap);
  eq(g.mostWatched[0], { label: 'Comedy', count: 2, avgRating: 4.3, films: ['parasite|2019', 'love, simon|2018'] });
});

test('countryStats carries codes', () => {
  const c = S.countryStats(e24, idx, tmdbMap);
  eq(c.mostWatched.map(r => r.code), ['KR', 'US']);
});

test('highsLows', () => {
  const h = S.highsLows(e24, idx, tmdbMap);
  eq(h.highestAvg.meta.title, 'Parasite');
  eq(h.longest.value, 133);
  eq(h.shortest.meta.title, 'Love, Simon');
  eq(h.newest.meta.title, 'Parasite');
  eq(h.oldest.meta.title, 'Love, Simon');
  eq(h.mostObscure.meta.title, 'Love, Simon');
});

test('worldMap counts', () => {
  const m = S.worldMap(e24, idx, tmdbMap);
  eq([...m.entries()].sort(), [['KR', 1], ['US', 1]]);
});

test('watchlistUnseen', () => {
  const u = S.watchlistUnseen(data, idx, tmdbMap);
  eq(u.map(f => f.name), ['Dune: Part Two']);
});

test('computeStats assembles and reports unmatched', () => {
  const partial = new Map(tmdbMap);
  partial.set('juno|2007', null);
  const s = S.computeStats(data, idx, partial, 'all');
  eq(s.unmatched.map(f => f.name), ['Juno']);
  eq(s.filmsGrid.length, 3);
  eq(s.highestRated[0].name, 'Parasite');
  ok(s.decades.length === 2);
});
```

- [ ] **Step 2: Run to verify failure** — `node tests/run.js`.

- [ ] **Step 3: Implement part 2** (append inside the IIFE in `js/stats.js`, before the `api` line; extend `api` with the new names)

```js
  // ---- TMDB-dependent stats ----
  const fkey = (name, year) => `${(name || '').toLowerCase()}|${year || ''}`;

  function uniqueFilms(entries, filmIndex) {
    const seen = new Set(), out = [];
    for (const e of entries) {
      const k = fkey(e.name, e.year);
      if (seen.has(k)) continue;
      seen.add(k);
      const f = filmIndex.get(k);
      if (f) out.push(f);
    }
    return out;
  }

  function hoursWatched(entries, tmdbMap) {
    let min = 0;
    for (const e of entries) {
      const m = tmdbMap.get(fkey(e.name, e.year));
      if (m && m.runtime) min += m.runtime;
    }
    return round1(min / 60);
  }

  function rankBy(entries, filmIndex, tmdbMap, extract) {
    const rows = new Map();
    for (const f of uniqueFilms(entries, filmIndex)) {
      const m = tmdbMap.get(f.key);
      if (!m) continue;
      for (const item of extract(m)) {
        const label = typeof item === 'string' ? item : item.name || item.label;
        const code = typeof item === 'string' ? undefined : item.code;
        if (!rows.has(label)) rows.set(label, { label, code, count: 0, ratings: [], films: [] });
        const r = rows.get(label);
        r.count++;
        r.films.push(f.key);
        if (f.rating != null) r.ratings.push(f.rating);
      }
    }
    return [...rows.values()].map(r => ({
      label: r.label, code: r.code, count: r.count,
      avgRating: r.ratings.length ? round1(r.ratings.reduce((a, b) => a + b, 0) / r.ratings.length) : null,
      films: r.films,
    })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  function withHighestRated(rows) {
    return {
      mostWatched: rows,
      highestRated: rows.filter(r => r.avgRating != null)
        .slice().sort((a, b) => b.avgRating - a.avgRating || b.count - a.count),
    };
  }
  const genreStats = (e, i, t) => withHighestRated(rankBy(e, i, t, m => m.genres));
  const countryStats = (e, i, t) => withHighestRated(rankBy(e, i, t, m => m.countries));
  const languageStats = (e, i, t) => withHighestRated(rankBy(e, i, t, m => m.languages));

  function castCrew(entries, filmIndex, tmdbMap) {
    const cast = new Map(), crew = new Map();
    for (const f of uniqueFilms(entries, filmIndex)) {
      const m = tmdbMap.get(f.key);
      if (!m) continue;
      for (const p of m.cast) {
        if (!cast.has(p.name)) cast.set(p.name, { name: p.name, profilePath: p.profilePath, count: 0, ratings: [] });
        const c = cast.get(p.name); c.count++; if (f.rating != null) c.ratings.push(f.rating);
      }
      for (const p of m.crew) {
        const key = `${p.job}|${p.name}`;
        if (!crew.has(key)) crew.set(key, { name: p.name, job: p.job, count: 0, ratings: [] });
        const c = crew.get(key); c.count++; if (f.rating != null) c.ratings.push(f.rating);
      }
    }
    const finish = list => list.map(c => ({ ...c, avgRating: c.ratings.length ? round1(c.ratings.reduce((a, b) => a + b, 0) / c.ratings.length) : null, ratings: undefined }));
    const castOut = finish([...cast.values()].sort((a, b) => b.count - a.count)).filter(c => c.count >= 2).slice(0, 12);
    const crewOut = {};
    for (const c of finish([...crew.values()].sort((a, b) => b.count - a.count))) {
      if (c.count < 2) continue;
      (crewOut[c.job] = crewOut[c.job] || []).push(c);
    }
    return { cast: castOut, crew: crewOut };
  }

  function highsLows(entries, filmIndex, tmdbMap) {
    const films = uniqueFilms(entries, filmIndex)
      .map(f => ({ film: f, meta: tmdbMap.get(f.key) })).filter(x => x.meta);
    const pick = (arr, sel, dir) => {
      const c = arr.filter(x => sel(x.meta) != null && sel(x.meta) !== 0 && sel(x.meta) !== '');
      if (!c.length) return null;
      const best = c.reduce((a, b) => (dir * (sel(a.meta) < sel(b.meta) ? -1 : sel(a.meta) > sel(b.meta) ? 1 : 0) >= 0 ? a : b));
      return { film: best.film, meta: best.meta, value: sel(best.meta) };
    };
    return {
      highestAvg: pick(films, m => m.voteAverage, 1), lowestAvg: pick(films, m => m.voteAverage, -1),
      mostPopular: pick(films, m => m.voteCount, 1), mostObscure: pick(films, m => m.voteCount, -1),
      newest: pick(films, m => m.releaseDate, 1), oldest: pick(films, m => m.releaseDate, -1),
      longest: pick(films, m => m.runtime, 1), shortest: pick(films, m => m.runtime, -1),
    };
  }

  function worldMap(entries, filmIndex, tmdbMap) {
    const m = new Map();
    for (const f of uniqueFilms(entries, filmIndex)) {
      const meta = tmdbMap.get(f.key);
      if (!meta) continue;
      for (const c of meta.countries) m.set(c.code, (m.get(c.code) || 0) + 1);
    }
    return m;
  }

  function watchlistUnseen(data, filmIndex, tmdbMap, n) {
    return [...filmIndex.values()]
      .filter(f => f.inWatchlist && !f.watched && tmdbMap.get(f.key))
      .sort((a, b) => tmdbMap.get(b.key).voteAverage - tmdbMap.get(a.key).voteAverage)
      .slice(0, n || 8);
  }

  function computeStats(data, filmIndex, tmdbMap, year) {
    const entries = entriesForYear(data, year);
    const films = uniqueFilms(entries, filmIndex);
    return {
      year, profile: data.profile,
      totals: headerTotals(data, entries, year),
      hours: hoursWatched(entries, tmdbMap),
      highestRated: films.filter(f => f.rating != null)
        .sort((a, b) => b.rating - a.rating || ((tmdbMap.get(b.key) || {}).voteAverage || 0) - ((tmdbMap.get(a.key) || {}).voteAverage || 0))
        .slice(0, 8),
      week: byWeek(entries, year), weekdays: weekdayCounts(entries),
      averages: averages(entries, year), milestones: milestones(entries),
      genres: genreStats(entries, filmIndex, tmdbMap),
      countries: countryStats(entries, filmIndex, tmdbMap),
      languages: languageStats(entries, filmIndex, tmdbMap),
      breakdown: breakdown(data, entries, filmIndex, year),
      decades: decades(entries),
      histogram: ratingsHistogram(entries),
      castCrew: castCrew(entries, filmIndex, tmdbMap),
      highsLows: highsLows(entries, filmIndex, tmdbMap),
      filmsGrid: films, map: worldMap(entries, filmIndex, tmdbMap),
      watchlist: { added: watchlistAdded(data, year), unseen: watchlistUnseen(data, filmIndex, tmdbMap, 8) },
      unmatched: films.filter(f => !tmdbMap.get(f.key)),
    };
  }
```

Extend the `api` object: add `uniqueFilms, hoursWatched, rankBy, genreStats, countryStats, languageStats, castCrew, highsLows, worldMap, watchlistUnseen, computeStats`.

- [ ] **Step 4: Run tests** — `node tests/run.js` → all pass. (`hoursWatched` fixture math: 133+133+110 = 376 min = 6.266… → 6.3.)

- [ ] **Step 5: Commit**

```bash
git add js/stats.js tests/stats.test.js
git commit -m "Add TMDB-dependent stats and computeStats orchestrator"
```

---

### Task 6: Full page markup, styles, and world map asset

**Files:**
- Modify: `index.html` (all section containers + inlined world map SVG)
- Modify: `css/style.css` (all component styles)
- Create: `dev.html`

**Interfaces:**
- Produces: DOM contract for render.js — every section root has a fixed id: `#s-header, #s-highest, #s-week, #s-averages, #s-milestones, #s-meta (genres/countries/languages), #s-breakdown, #s-castcrew, #s-highslows, #s-grid, #s-map, #s-watchlist, #s-unmatched`. Inside `#s-map` sits the inlined `<svg id="worldmap">` whose `<path>` elements carry lowercase ISO alpha-2 ids. Setup panel ids: `#setup, #tmdb-key, #zip-input, #drop-zone, #btn-start, #btn-clear-cache`; progress ids: `#progress, #progress-bar, #progress-label`; stats chrome: `#year-select, #stats`.

- [ ] **Step 1: Vendor the world map**

```bash
curl -L -o vendor/world.svg https://unpkg.com/@svg-maps/world@1.0.1/world.svg
```

Verify it contains `<path` elements with `id="es"`-style lowercase alpha-2 ids: `grep -o 'id="[a-z][a-z]"' vendor/world.svg | head`. If the URL 404s, fetch the package tarball `npm pack @svg-maps/world` and copy `world.svg` from it. If path ids turn out to be full country names instead of codes, check for a `data-id` or per-path `id` attribute and adjust the render contract accordingly (the file is inspected in this step precisely to lock this down).

- [ ] **Step 2: Build the full `index.html` body**

Replace the `<main>` skeleton with (keep topbar and scripts):

```html
<main id="app">
  <section id="setup" class="panel">
    <h2>Show my Year in Film</h2>
    <p>1. Get a free TMDB API key: create an account at
       <a href="https://www.themoviedb.org/signup" target="_blank" rel="noopener">themoviedb.org</a>,
       then Settings → API → request a key (choose "Developer"). Paste the "API Key" (v3) below.</p>
    <input id="tmdb-key" type="password" placeholder="TMDB API key" autocomplete="off">
    <p>2. Export your data from
       <a href="https://letterboxd.com/settings/data/" target="_blank" rel="noopener">letterboxd.com/settings/data</a>
       and drop the zip here:</p>
    <div id="drop-zone" tabindex="0">Drop your <code>letterboxd-*.zip</code> here or click to browse
      <input id="zip-input" type="file" accept=".zip" hidden>
    </div>
    <p class="muted">Everything runs in your browser — your data is never uploaded anywhere except film-title lookups to TMDB.</p>
    <button id="btn-start" disabled>Build my stats</button>
    <button id="btn-clear-cache" class="ghost">Clear film cache</button>
    <p id="setup-error" class="error hidden"></p>
  </section>

  <section id="progress" class="panel hidden">
    <h2>Looking up your films…</h2>
    <div class="bar-track"><div id="progress-bar"></div></div>
    <p id="progress-label" class="muted"></p>
    <p class="muted">Only needed once — results are cached in your browser.</p>
  </section>

  <section id="stats" class="hidden">
    <div id="s-header"></div>
    <div class="controls"><label>Year <select id="year-select"></select></label></div>
    <section id="s-highest"><h3>Highest rated films</h3><div class="body"></div></section>
    <section id="s-week"><h3>By week</h3><div class="body"></div></section>
    <section id="s-averages"><div class="body"></div></section>
    <section id="s-milestones"><h3>Milestones</h3><div class="body"></div></section>
    <section id="s-meta"><h3>Genres, countries &amp; languages</h3>
      <div class="toggle" data-for="meta"><button class="on" data-mode="mostWatched">Most watched</button><button data-mode="highestRated">Highest rated</button></div>
      <div class="body"></div></section>
    <section id="s-breakdown"><h3>Breakdown</h3><div class="body"></div></section>
    <section id="s-castcrew"><h3>Cast &amp; crew</h3>
      <div class="toggle" data-for="castcrew"><button class="on" data-mode="mostWatched">Most watched</button><button data-mode="highestRated">Highest rated</button></div>
      <div class="body"></div></section>
    <section id="s-highslows"><h3>Highs and lows</h3><div class="body"></div></section>
    <section id="s-grid"><h3>Films watched</h3><div class="body"></div></section>
    <section id="s-map"><h3>World map</h3><!-- WORLD_MAP_SVG --><div class="map-tip hidden"></div></section>
    <section id="s-watchlist"><h3>Watchlist</h3><div class="body"></div></section>
    <section id="s-unmatched" class="hidden"><h3>Films TMDB couldn't match</h3><div class="body muted"></div></section>
  </section>
</main>
```

Then inline the map: replace `<!-- WORLD_MAP_SVG -->` with the contents of `vendor/world.svg`, adding `id="worldmap"` to the `<svg>` tag (scriptable: a one-off `node -e` splice, or manual paste).

- [ ] **Step 3: Write component CSS** (append to `css/style.css`)

```css
h3 { color: var(--text-bright); text-transform: uppercase; font-size: 13px; letter-spacing: 1px;
     border-bottom: 1px solid #24303c; padding-bottom: 6px; }
section > section { margin: 40px 0; }
input[type=password], input[type=text] { width: 100%; padding: 10px; background: var(--card);
  border: 1px solid #456; border-radius: 4px; color: var(--text-bright); }
button { background: var(--green); color: #14181c; font-weight: 700; border: 0; border-radius: 4px;
  padding: 10px 18px; cursor: pointer; }
button:disabled { opacity: .4; cursor: default; }
button.ghost { background: transparent; color: var(--muted); border: 1px solid #456; }
.error { color: #ff6060; }
#drop-zone { border: 2px dashed #456; border-radius: 8px; padding: 40px; text-align: center;
  margin: 12px 0; cursor: pointer; }
#drop-zone.armed { border-color: var(--green); color: var(--text-bright); }
.bar-track { background: var(--card); border-radius: 4px; height: 12px; overflow: hidden; }
#progress-bar { background: var(--green); height: 100%; width: 0; transition: width .2s; }
/* header */
.big-year { font: 700 96px/1 var(--font-num); color: var(--text-bright); text-align: center; }
.byline { text-align: center; margin-bottom: 24px; }
.totals { display: flex; justify-content: center; gap: 40px; border-top: 1px solid #24303c;
  border-bottom: 1px solid #24303c; padding: 16px 0; }
.totals .num { font: 28px var(--font-num); color: var(--text-bright); display: block; text-align: center; }
.totals .lbl { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); }
/* posters */
.poster-row { display: flex; gap: 12px; flex-wrap: wrap; }
.poster { width: 90px; }
.poster img, .poster .noimg { width: 90px; height: 135px; border-radius: 4px; object-fit: cover;
  background: var(--card); display: block; }
.poster .noimg { display: flex; align-items: center; justify-content: center; text-align: center;
  font-size: 11px; padding: 4px; color: var(--text-bright); }
.poster .sub { font-size: 11px; color: var(--muted); text-align: center; margin-top: 4px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 8px; }
.grid .poster { width: auto; }
.grid .poster img, .grid .poster .noimg { width: 100%; height: auto; aspect-ratio: 2/3; }
/* charts */
.hbar-row { display: grid; grid-template-columns: 110px 1fr 40px; gap: 8px; align-items: center; margin: 4px 0; }
.hbar-row .bar { height: 14px; border-radius: 2px; background: var(--green); min-width: 2px; }
.hbar-row.c-blue .bar { background: var(--blue); } .hbar-row.c-orange .bar { background: var(--orange); }
.meta-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; }
.toggle button { background: none; color: var(--muted); font-weight: 400; padding: 2px 8px; }
.toggle button.on { color: var(--blue); }
svg .wk { fill: var(--green); } svg .axis { stroke: #24303c; }
.pies { display: flex; gap: 40px; flex-wrap: wrap; justify-content: center; }
.pie-block { text-align: center; }
/* people */
.people { display: flex; gap: 24px; flex-wrap: wrap; }
.person { text-align: center; width: 110px; }
.person img, .person .noimg { width: 96px; height: 96px; border-radius: 50%; object-fit: cover; background: var(--card); }
.crew-cols { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px 24px; }
.crew-cols h4 { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px; }
/* highs/lows */
.hl-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; text-align: center; }
/* map */
#worldmap { width: 100%; height: auto; }
#worldmap path { fill: #2c3440; stroke: #14181c; stroke-width: .5; }
.map-tip { position: fixed; background: #000; color: #fff; padding: 4px 8px; border-radius: 4px;
  font-size: 12px; pointer-events: none; z-index: 10; }
@media (max-width: 640px) { .totals { flex-wrap: wrap; gap: 16px; } .big-year { font-size: 64px; } }
```

- [ ] **Step 4: Create `dev.html`** — same as `index.html` but with fixtures preloaded and no vendor/zip needs beyond what render uses:

```html
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>dev</title>
<link rel="stylesheet" href="css/style.css"></head><body>
<main id="app"><section id="stats"><!-- copy the entire #stats inner markup from index.html, including the inlined worldmap svg --></section></main>
<script src="vendor/papaparse.min.js"></script>
<script src="js/parse.js"></script>
<script src="js/stats.js"></script>
<script src="js/render.js"></script>
<script>
// Paste tests/fixtures.js FILES + META objects here (without module.exports)
const data = LBParse.parseExport(FILES);
const idx = LBParse.buildFilmIndex(data);
const tmdbMap = new Map(Object.entries(META));
const stats = LBStats.computeStats(data, idx, tmdbMap, 2024);
document.getElementById('stats').classList.remove('hidden');
LBRender.renderAll(stats);   // will exist after Task 7
</script></body></html>
```

- [ ] **Step 5: Verify** — open `index.html`: setup panel styled, dark theme, drop zone visible, world map renders gray at the bottom (temporarily unhide `#stats` in devtools to see it). `node tests/run.js` still green.

- [ ] **Step 6: Commit**

```bash
git add index.html css/style.css dev.html vendor/world.svg
git commit -m "Add full page markup, theme styles, and world map asset"
```

---

### Task 7: `render.js` part 1 — header, posters, bar charts, meta lists, milestones

**Files:**
- Create: `js/render.js`
- Modify: `dev.html` (nothing beyond Task 6 paste — it now works partially)

**Interfaces:**
- Consumes: `Stats` object from `LBStats.computeStats`, DOM ids from Task 6, `LBTmdb.IMG`.
- Produces (used by main.js and Task 8):
  - `LBRender.renderAll(stats)` — fills every section; internally calls per-section functions and stores `stats` as module state `current` so toggle buttons re-render.
  - Helpers reused in Task 8: `el(tag, attrs, ...children) → HTMLElement` (attrs: `class`, `text`, any attribute; children: nodes/strings), `posterCard(film, meta, subText) → el`, `img(url, cls, altText)`, `hbarList(container, rows, colorClass, valueKey)`.
  - Toggle protocol: `.toggle button` click → sets `.on`, re-renders that section with `data-mode` (`mostWatched` | `highestRated`).

- [ ] **Step 1: Implement `js/render.js` (part 1)**

```js
(function (global) {
  'use strict';
  const IMG = (global.LBTmdb && global.LBTmdb.IMG) || 'https://image.tmdb.org/t/p/';
  let current = null;

  function el(tag, attrs, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v);
    }
    for (const c of children) if (c != null) n.append(c);
    return n;
  }
  const body = id => { const b = document.querySelector(`${id} .body`) || document.querySelector(id); b.innerHTML = ''; return b; };
  const fmtDate = d => d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';

  function posterCard(film, meta, subText) {
    const card = el('div', { class: 'poster' });
    const link = el('a', { href: film.uri || '#', target: '_blank', rel: 'noopener' });
    if (meta && meta.posterPath) link.append(el('img', { src: `${IMG}w185${meta.posterPath}`, alt: film.name, loading: 'lazy' }));
    else link.append(el('div', { class: 'noimg', text: `${film.name} (${film.year || '?'})` }));
    card.append(link);
    if (subText) card.append(el('div', { class: 'sub', text: subText }));
    return card;
  }

  function stars(rating) { return rating == null ? '' : '★'.repeat(Math.floor(rating)) + (rating % 1 ? '½' : ''); }

  function renderHeader(stats) {
    const c = body('#s-header');
    c.append(el('div', { class: 'big-year', text: stats.year === 'all' ? 'All time' : String(stats.year) }));
    c.append(el('div', { class: 'byline muted', text: `${stats.profile.displayName || stats.profile.username}’s ${stats.year === 'all' ? 'life' : 'year'} in film` }));
    const totals = el('div', { class: 'totals' });
    const tile = (num, lbl) => el('div', {}, el('span', { class: 'num', text: String(num) }), el('span', { class: 'lbl', text: lbl }));
    totals.append(tile(stats.totals.diaryEntries, 'Diary entries'), tile(stats.totals.reviews, 'Reviews'),
      tile(stats.totals.likes, 'Likes'), tile(stats.hours, 'Hours'));
    c.append(totals);
  }

  function renderHighest(stats) {
    const c = body('#s-highest');
    const row = el('div', { class: 'poster-row' });
    for (const f of stats.highestRated) row.append(posterCard(f, mapGet(stats, f), stars(f.rating)));
    c.append(row);
    toggleSection('#s-highest', stats.highestRated.length);
  }

  function mapGet(stats, film) { return stats._tmdb ? stats._tmdb.get(film.key) : null; }

  function renderWeek(stats) {
    const c = body('#s-week');
    const w = 720, h = 90, n = stats.week.length, bw = w / n;
    const max = Math.max(1, ...stats.week);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h + 16}`);
    for (let i = 0; i < n; i++) {
      const bh = stats.week[i] / max * h;
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', i * bw + 1); r.setAttribute('y', h - bh);
      r.setAttribute('width', Math.max(1, bw - 3)); r.setAttribute('height', bh);
      r.setAttribute('class', 'wk');
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      t.textContent = `Week ${i + 1}: ${stats.week[i]} films`;
      r.append(t); svg.append(r);
    }
    const axis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    axis.setAttribute('x1', 0); axis.setAttribute('x2', w); axis.setAttribute('y1', h); axis.setAttribute('y2', h);
    axis.setAttribute('class', 'axis'); svg.append(axis);
    c.append(svg);
    const lbl = el('div', { class: 'muted' }); lbl.style.display = 'flex'; lbl.style.justifyContent = 'space-between';
    lbl.append(el('span', { text: 'Jan' }), el('span', { text: 'Dec' })); c.append(lbl);
  }

  function renderAverages(stats) {
    const c = body('#s-averages');
    const t = el('div', { class: 'totals' });
    const tile = (num, lbl) => el('div', {}, el('span', { class: 'num', text: String(num) }), el('span', { class: 'lbl', text: lbl }));
    t.append(tile(stats.averages.count, 'Films logged'), tile(stats.averages.perMonth, 'Average per month'), tile(stats.averages.perWeek, 'Average per week'));
    c.append(t);
    // weekday mini chart
    const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const max = Math.max(1, ...stats.weekdays);
    const wrap = el('div', { class: 'pies' });
    const chart = el('div');
    chart.style.cssText = 'display:flex;gap:4px;align-items:flex-end;height:70px;justify-content:center';
    stats.weekdays.forEach((v, i) => {
      const col = el('div');
      col.style.cssText = 'width:18px;text-align:center;font-size:10px;color:var(--muted)';
      const bar = el('div', { title: `${v} films` });
      bar.style.cssText = `height:${Math.max(2, v / max * 50)}px;background:var(--card);border-radius:2px;margin-bottom:2px`;
      if (v === max && v > 0) bar.style.background = 'var(--blue)';
      col.append(bar, days[i]);
      chart.append(col);
    });
    wrap.append(chart); c.append(wrap);
  }

  function renderMilestones(stats) {
    const c = body('#s-milestones');
    const row = el('div', { class: 'pies' });
    const block = (label, e) => {
      if (!e) return null;
      const k = global.LBParse.filmKey(e.name, e.year);
      const film = { key: k, name: e.name, year: e.year, uri: e.uri };
      const b = el('div', { class: 'pie-block' }, el('h4', { text: label }),
        posterCard(film, stats._tmdb && stats._tmdb.get(k), fmtDate(e.watchedDate)));
      return b;
    };
    row.append(block('First film', stats.milestones.first), block('Last film', stats.milestones.last));
    c.append(row);
  }

  function hbarList(container, rows, colorClass, valueKey) {
    const max = Math.max(1, ...rows.map(r => r[valueKey] || 0));
    for (const r of rows) {
      const row = el('div', { class: `hbar-row ${colorClass}` });
      const bar = el('div', { class: 'bar', title: r.films ? `${r.count} films` : '' });
      bar.style.width = `${(r[valueKey] || 0) / max * 100}%`;
      row.append(el('span', { text: r.label }), bar, el('span', { class: 'muted', text: String(r[valueKey]) }));
      container.append(row);
    }
  }

  function renderMeta(stats, mode) {
    const c = body('#s-meta');
    const cols = el('div', { class: 'meta-cols' });
    const specs = [[stats.genres, '', 'Genres'], [stats.countries, 'c-blue', 'Countries'], [stats.languages, 'c-orange', 'Languages']];
    for (const [s, color, title] of specs) {
      const col = el('div', {}, el('h4', { text: title, class: 'muted' }));
      const rows = s[mode].slice(0, 10);
      hbarList(col, rows, color, mode === 'highestRated' ? 'avgRating' : 'count');
      cols.append(col);
    }
    c.append(cols);
  }

  function toggleSection(id, hasContent) {
    document.querySelector(id).classList.toggle('hidden', !hasContent);
  }

  // renderAll assembled in Task 8 once every section renderer exists
  const api = { el, posterCard, hbarList, stars, fmtDate, body, mapGet, toggleSection,
    renderHeader, renderHighest, renderWeek, renderAverages, renderMilestones, renderMeta,
    _state: () => current, _setState: s => { current = s; } };
  if (typeof module !== 'undefined') module.exports = api;
  global.LBRender = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

Note the `stats._tmdb` convention: main.js attaches the tmdb Map to the stats object as `_tmdb` before rendering (documented again in Task 9).

- [ ] **Step 2: Wire `dev.html`** — after the fixture paste add `stats._tmdb = tmdbMap;` then call the five renderers directly (renderAll doesn't exist yet):

```js
stats._tmdb = tmdbMap;
LBRender._setState(stats);
LBRender.renderHeader(stats); LBRender.renderHighest(stats); LBRender.renderWeek(stats);
LBRender.renderAverages(stats); LBRender.renderMilestones(stats); LBRender.renderMeta(stats, 'mostWatched');
```

- [ ] **Step 3: Verify in browser** — open `dev.html`: big "2024" header with 4 totals (3 entries / 1 review / 1 like / 6.3 hours), poster placeholders (fixture posterPaths are fake so `.noimg` boxes with names are OK — images 404 to broken icons; acceptable in dev), 52-bar week chart with bars in weeks 1, 9, 28, weekday chart with Friday tallest, milestones Parasite→Love Simon, three meta columns (green/blue/orange).

- [ ] **Step 4: Commit**

```bash
git add js/render.js dev.html
git commit -m "Render header, charts, milestones, and meta lists"
```

---

### Task 8: `render.js` part 2 — pies, histogram, cast/crew, highs/lows, grid, map, watchlist, renderAll

**Files:**
- Modify: `js/render.js` (append renderers + `renderAll` + toggle wiring), `dev.html` (switch to `renderAll`)

**Interfaces:**
- Consumes: helpers and state from Task 7.
- Produces: `LBRender.renderAll(stats)` — the single entry point main.js calls; wires `.toggle` buttons (event delegation, re-render section on click); fills `#s-unmatched` and unhides it when `stats.unmatched.length > 0`.

- [ ] **Step 1: Append renderers to `js/render.js`** (inside the IIFE, before `api`; then add all new names + `renderAll` to `api`)

```js
  function pieSvg(a, b, colorA, colorB, size) {
    const s = size || 110, r = s / 2, total = a + b;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${s} ${s}`); svg.style.width = s + 'px';
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bg.setAttribute('cx', r); bg.setAttribute('cy', r); bg.setAttribute('r', r); bg.setAttribute('fill', colorB);
    svg.append(bg);
    if (total > 0 && a > 0) {
      const frac = a / total;
      if (frac >= 1) { bg.setAttribute('fill', colorA); return svg; }
      const ang = frac * 2 * Math.PI;
      const x = r + r * Math.sin(ang), y = r - r * Math.cos(ang);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${r},${r} L${r},0 A${r},${r} 0 ${ang > Math.PI ? 1 : 0} 1 ${x},${y} Z`);
      path.setAttribute('fill', colorA); svg.append(path);
    }
    return svg;
  }

  function renderBreakdown(stats) {
    const c = body('#s-breakdown');
    const pies = el('div', { class: 'pies' });
    const block = (title, a, b, la, lb) => {
      const w = el('div', { class: 'pie-block' });
      w.append(el('div', { class: 'muted', text: title }), pieSvg(a, b, '#00e054', '#2c3440'),
        el('div', { class: 'muted', text: `${la} ${a} · ${lb} ${b}` }));
      return w;
    };
    if (stats.breakdown.premieres) pies.append(block(`${stats.year} premieres`, stats.breakdown.premieres.yes, stats.breakdown.premieres.no, 'Premieres', 'Older'));
    else if (stats.decades.length) { // all-time: decades bar list instead of premieres pie
      const d = el('div', { class: 'pie-block' }, el('div', { class: 'muted', text: 'By decade' }));
      hbarList(d, stats.decades.map(x => ({ label: x.decade, count: x.count })), '', 'count');
      pies.append(d);
    }
    pies.append(block('Watches', stats.breakdown.rewatches.first, stats.breakdown.rewatches.re, 'First-time', 'Rewatch'));
    pies.append(block('Reviewed', stats.breakdown.reviewed.yes, stats.breakdown.reviewed.no, 'Reviewed', 'Not'));
    c.append(pies);
    // ratings histogram
    const hist = el('div', { class: 'pie-block' }, el('div', { class: 'muted', text: `${stats.year === 'all' ? 'All' : stats.year} ratings` }));
    const bars = el('div');
    bars.style.cssText = 'display:flex;gap:2px;align-items:flex-end;height:60px;justify-content:center;margin-top:8px';
    const max = Math.max(1, ...stats.histogram.buckets);
    stats.histogram.buckets.forEach((v, i) => {
      const b = el('div', { title: `${(i + 1) / 2}★: ${v}` });
      b.style.cssText = `width:14px;height:${Math.max(2, v / max * 56)}px;background:${v ? 'var(--green)' : 'var(--card)'};border-radius:1px`;
      bars.append(b);
    });
    hist.append(bars, el('div', { class: 'muted', text: '½★ → ★★★★★' }));
    c.append(el('div', { class: 'pies' }, hist));
  }

  function personBlock(p, sub) {
    const w = el('div', { class: 'person' });
    if (p.profilePath) w.append(el('img', { src: `${IMG}w185${p.profilePath}`, alt: p.name, loading: 'lazy' }));
    else w.append(el('div', { class: 'noimg', text: p.name.split(' ').map(x => x[0]).join('') }));
    w.append(el('div', { text: p.name, class: 'muted' }), el('div', { class: 'sub muted', text: sub }));
    return w;
  }

  function renderCastCrew(stats, mode) {
    const c = body('#s-castcrew');
    const sortBy = mode === 'highestRated'
      ? (a, b) => (b.avgRating || 0) - (a.avgRating || 0) || b.count - a.count
      : (a, b) => b.count - a.count;
    const cast = stats.castCrew.cast.slice().sort(sortBy);
    const people = el('div', { class: 'people' });
    for (const p of cast.slice(0, 6)) people.append(personBlock(p, mode === 'highestRated' ? `★ ${p.avgRating}` : `${p.count} films`));
    c.append(people);
    const crew = el('div', { class: 'crew-cols' });
    for (const [job, list] of Object.entries(stats.castCrew.crew)) {
      const col = el('div', {}, el('h4', { text: job }));
      for (const p of list.slice().sort(sortBy).slice(0, 5))
        col.append(el('div', {}, el('span', { text: p.name }), el('span', { class: 'muted', text: mode === 'highestRated' ? ` ★${p.avgRating}` : ` ${p.count}` })));
      crew.append(col);
    }
    c.append(crew);
    toggleSection('#s-castcrew', cast.length + Object.keys(stats.castCrew.crew).length);
  }

  function renderHighsLows(stats) {
    const c = body('#s-highslows');
    const grid = el('div', { class: 'hl-grid' });
    const items = [
      ['Highest average', stats.highsLows.highestAvg, v => `★ ${round(v.value, 1)}`],
      ['Lowest average', stats.highsLows.lowestAvg, v => `★ ${round(v.value, 1)}`],
      ['Most popular', stats.highsLows.mostPopular, v => `${v.value.toLocaleString()} votes`],
      ['Most obscure', stats.highsLows.mostObscure, v => `${v.value.toLocaleString()} votes`],
      ['Newest', stats.highsLows.newest, v => fmtLong(v.value)],
      ['Oldest', stats.highsLows.oldest, v => fmtLong(v.value)],
      ['Longest', stats.highsLows.longest, v => `${v.value} minutes`],
      ['Shortest', stats.highsLows.shortest, v => `${v.value} minutes`],
    ];
    for (const [label, v, fmt] of items) {
      if (!v) continue;
      grid.append(el('div', { class: 'pie-block' }, el('div', { class: 'muted', text: label }),
        posterCard(v.film, v.meta, fmt(v))));
    }
    c.append(grid);
  }
  const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
  const fmtLong = d => d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';

  function renderGrid(stats) {
    const c = body('#s-grid');
    const g = el('div', { class: 'grid' });
    for (const f of stats.filmsGrid) g.append(posterCard(f, mapGet(stats, f), null));
    c.append(g);
  }

  function renderMap(stats) {
    const svg = document.getElementById('worldmap');
    if (!svg) return;
    const max = Math.max(1, ...stats.map.values());
    for (const p of svg.querySelectorAll('path')) {
      const code = (p.id || '').toUpperCase();
      const count = stats.map.get(code) || 0;
      p.style.fill = count ? `rgba(0,224,84,${0.35 + 0.65 * count / max})` : '';
      const name = p.getAttribute('name') || p.getAttribute('aria-label') || code;
      p.querySelector('title') && p.querySelector('title').remove();
      if (count) {
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        t.textContent = `${name}: ${count} film${count > 1 ? 's' : ''}`;
        p.append(t);
      }
    }
  }

  function renderWatchlist(stats) {
    const c = body('#s-watchlist');
    c.append(el('p', { class: 'muted', text: `${stats.watchlist.added} films added to watchlist` }));
    if (stats.watchlist.unseen.length) {
      c.append(el('h4', { class: 'muted', text: 'Highly rated films you are yet to see' }));
      const row = el('div', { class: 'poster-row' });
      for (const f of stats.watchlist.unseen) row.append(posterCard(f, mapGet(stats, f), `★ ${round(mapGet(stats, f).voteAverage, 1)}`));
      c.append(row);
    }
  }

  function renderUnmatched(stats) {
    const c = body('#s-unmatched');
    c.textContent = stats.unmatched.map(f => `${f.name} (${f.year})`).join(' · ');
    toggleSection('#s-unmatched', stats.unmatched.length);
  }

  function renderAll(stats) {
    current = stats;
    renderHeader(stats); renderHighest(stats); renderWeek(stats); renderAverages(stats);
    renderMilestones(stats); renderMeta(stats, modeOf('meta')); renderBreakdown(stats);
    renderCastCrew(stats, modeOf('castcrew')); renderHighsLows(stats); renderGrid(stats);
    renderMap(stats); renderWatchlist(stats); renderUnmatched(stats);
  }
  function modeOf(name) {
    const on = document.querySelector(`.toggle[data-for="${name}"] button.on`);
    return on ? on.dataset.mode : 'mostWatched';
  }
  // toggle wiring — once, at load
  document.addEventListener('click', ev => {
    const btn = ev.target.closest('.toggle button');
    if (!btn || !current) return;
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
    const which = btn.parentElement.dataset.for;
    if (which === 'meta') renderMeta(current, btn.dataset.mode);
    if (which === 'castcrew') renderCastCrew(current, btn.dataset.mode);
  });
```

Add to `api`: `renderAll, renderBreakdown, renderCastCrew, renderHighsLows, renderGrid, renderMap, renderWatchlist, renderUnmatched, pieSvg`.

Guard for node: the `document.addEventListener` line must be wrapped in `if (typeof document !== 'undefined') { ... }` so `require('../js/render.js')` doesn't crash if a test ever imports it.

- [ ] **Step 2: Switch `dev.html` to `renderAll(stats)`** (replace the per-function calls).

- [ ] **Step 3: Verify in browser** — `dev.html` shows every section: 3 pies (premieres 0/3 fully gray-green split, watches 2/1, reviewed 1/2), histogram with bars at 3.5 and 5, no cast section (fixture counts are 1 each → hidden), highs/lows 8 tiles, 3-poster grid, map with KR + US tinted green, watchlist row with Dune. Toggles switch meta lists to avgRating widths without errors in console.

- [ ] **Step 4: Run `node tests/run.js`** — still green (render.js not imported by tests, but the require-guard must not break anything).

- [ ] **Step 5: Commit**

```bash
git add js/render.js dev.html
git commit -m "Render breakdown, cast, highs and lows, map, and watchlist"
```

---

### Task 9: `main.js` — orchestration, IndexedDB cache, UI flow

**Files:**
- Create: `js/main.js`

**Interfaces:**
- Consumes: everything — `JSZip`, `LBParse`, `LBTmdb.TmdbClient`, `LBStats`, `LBRender.renderAll`.
- Produces: the working app. Key internals:
  - `IdbCache` implementing the Task 3 cache contract over IndexedDB db `lbx-stats`, store `tmdb` (`undefined` when key absent — use a cursor/getKey check, since stored value may legitimately be `null`).
  - localStorage keys: `lbx-tmdb-key`.
  - Attaches `stats._tmdb = tmdbMap` before every `renderAll` (render contract from Task 7).

- [ ] **Step 1: Implement `js/main.js`**

```js
(function () {
  'use strict';
  const $ = s => document.querySelector(s);

  // ---- IndexedDB cache (contract: get → meta | null | undefined) ----
  function openDb() {
    return new Promise((res, rej) => {
      const req = indexedDB.open('lbx-stats', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('tmdb');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  class IdbCache {
    constructor(db) { this.db = db; }
    _tx(mode) { return this.db.transaction('tmdb', mode).objectStore('tmdb'); }
    get(key) {
      return new Promise((res, rej) => {
        const store = this._tx('readonly');
        const kq = store.getKey(key);
        kq.onsuccess = () => {
          if (kq.result === undefined) return res(undefined); // never fetched
          const vq = store.get(key);
          vq.onsuccess = () => res(vq.result === undefined ? null : vq.result);
          vq.onerror = () => rej(vq.error);
        };
        kq.onerror = () => rej(kq.error);
      });
    }
    set(key, value) {
      return new Promise((res, rej) => {
        const q = this._tx('readwrite').put(value, key);
        q.onsuccess = () => res(); q.onerror = () => rej(q.error);
      });
    }
    clear() {
      return new Promise((res, rej) => {
        const q = this._tx('readwrite').clear();
        q.onsuccess = () => res(); q.onerror = () => rej(q.error);
      });
    }
  }

  // ---- state ----
  let zipFile = null, appData = null, filmIndex = null, tmdbMap = null;

  function setError(msg) {
    const e = $('#setup-error');
    e.textContent = msg || ''; e.classList.toggle('hidden', !msg);
  }
  function show(id) {
    for (const s of ['#setup', '#progress', '#stats']) $(s).classList.toggle('hidden', s !== id);
  }
  function arm() {
    $('#btn-start').disabled = !(zipFile && $('#tmdb-key').value.trim());
    $('#drop-zone').classList.toggle('armed', !!zipFile);
    if (zipFile) $('#drop-zone').firstChild.textContent = `Ready: ${zipFile.name} `;
  }

  async function readZip(file) {
    const zip = await JSZip.loadAsync(file);
    const files = {};
    const wanted = /(^|\/)((diary|watched|ratings|reviews|watchlist|profile)\.csv|likes\/films\.csv|lists\/[^/]+\.csv)$/;
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const m = path.match(wanted);
      if (m && !/(^|\/)(deleted|orphaned)\//.test(path)) files[m[0].replace(/^\//, '')] = await entry.async('string');
    }
    if (!files['diary.csv'] && !files['watched.csv']) throw new Error('That zip has no diary.csv/watched.csv — is it a Letterboxd export?');
    return files;
  }

  async function start() {
    setError('');
    const key = $('#tmdb-key').value.trim();
    localStorage.setItem('lbx-tmdb-key', key);
    try {
      const files = await readZip(zipFile);
      appData = LBParse.parseExport(files);
      filmIndex = LBParse.buildFilmIndex(appData);
      const films = [...filmIndex.values()].filter(f => f.watched || f.inWatchlist);
      show('#progress');
      const cache = new IdbCache(await openDb());
      const client = new LBTmdb.TmdbClient({ apiKey: key, cache, fetchFn: (u) => fetch(u) });
      tmdbMap = await client.enrich(films, (done, total, film) => {
        $('#progress-bar').style.width = `${done / total * 100}%`;
        $('#progress-label').textContent = `${done} / ${total} — ${film.name}`;
      });
      buildYearSelect();
      renderYear(currentYearDefault());
      show('#stats');
    } catch (e) {
      show('#setup');
      if (e.message === 'TMDB_UNAUTHORIZED') setError('TMDB rejected that API key — double-check it (v3 auth key).');
      else setError(e.message);
    }
  }

  function currentYearDefault() {
    const years = LBStats.availableYears(appData);
    return years[0] != null ? years[0] : 'all';
  }
  function buildYearSelect() {
    const sel = $('#year-select');
    sel.innerHTML = '';
    for (const y of LBStats.availableYears(appData)) sel.append(new Option(y, y));
    sel.append(new Option('All time', 'all'));
    sel.onchange = () => renderYear(sel.value === 'all' ? 'all' : parseInt(sel.value, 10));
  }
  function renderYear(year) {
    const stats = LBStats.computeStats(appData, filmIndex, tmdbMap, year);
    stats._tmdb = tmdbMap;
    LBRender.renderAll(stats);
    window.scrollTo(0, 0);
  }

  // ---- wiring ----
  window.addEventListener('DOMContentLoaded', () => {
    $('#tmdb-key').value = localStorage.getItem('lbx-tmdb-key') || '';
    $('#tmdb-key').addEventListener('input', arm);
    const dz = $('#drop-zone');
    dz.addEventListener('click', () => $('#zip-input').click());
    $('#zip-input').addEventListener('change', ev => { zipFile = ev.target.files[0] || null; arm(); });
    dz.addEventListener('dragover', ev => { ev.preventDefault(); dz.classList.add('armed'); });
    dz.addEventListener('dragleave', () => dz.classList.toggle('armed', !!zipFile));
    dz.addEventListener('drop', ev => {
      ev.preventDefault();
      const f = [...ev.dataTransfer.files].find(f => f.name.endsWith('.zip'));
      if (f) { zipFile = f; arm(); } else setError('Please drop a .zip file.');
    });
    $('#btn-start').addEventListener('click', start);
    $('#btn-clear-cache').addEventListener('click', async () => {
      const cache = new IdbCache(await openDb());
      await cache.clear();
      setError('Film cache cleared.');
    });
    arm();
  });
})();
```

- [ ] **Step 2: Run unit tests** — `node tests/run.js` still green (main.js is browser-only, never required).

- [ ] **Step 3: End-to-end test with the real export** — serve locally (`python -m http.server 8080` or open `index.html` directly), get the user's TMDB key entered, drop `letterboxd-filmfan-2026-08-05.zip`, watch progress (~1,230 films, several minutes first run). Verify: header numbers plausible vs. the CSVs (`wc -l` counts from the design spec: 964 diary rows), year dropdown lists every year 2020–2026 + All time, posters load, map shades, unmatched panel small (<5% of films). Then re-drop the same zip → enrichment completes near-instantly (cache hit). **This step needs the user present for their TMDB key — coordinate with them.**

- [ ] **Step 4: Fix what E2E surfaces** — typical issues and their intended fixes: TMDB title mismatches (adjust `_search` fallbacks — e.g. strip trailing "(film)" or try `year ± 1` via a third search pass `primary_release_year = film.year - 1`), progress UI jank (batch DOM updates every 5 films), zip path prefixes (some exports nest files under a folder — the `wanted` regex already tolerates a prefix; verify).

- [ ] **Step 5: Commit**

```bash
git add js/main.js
git commit -m "Wire zip loading, TMDB enrichment flow, and year switching"
```

---

### Task 10: README, GitHub repo, Pages deployment

**Files:**
- Create: `README.md`

**Interfaces:** none new — publishing only.

- [ ] **Step 1: Write `README.md`**

```markdown
# Year in Film — free Letterboxd stats

Recreates the Letterboxd Pro "Year in Film" stats page from your own
Letterboxd data export — entirely in your browser. Nothing is uploaded
anywhere; film metadata comes from your own free TMDB API key and is
cached locally.

## Use it

1. Open the site (GitHub Pages link here after deploy).
2. Get a free TMDB API key: themoviedb.org → Settings → API.
3. Export your data: letterboxd.com/settings/data → drop the zip on the page.
4. First run looks up each film once (a few minutes); after that it's instant.

## Develop

- `node tests/run.js` — unit tests
- `dev.html` — renders fixture data without a zip or TMDB key
- No build step; everything is vendored.

## Credits

Film metadata and images from [TMDB](https://www.themoviedb.org/) (this
product uses the TMDB API but is not endorsed or certified by TMDB).
World map from [@svg-maps/world](https://github.com/VictorCazanave/svg-maps) (MIT).
Layout inspired by Letterboxd's Year in Review pages; not affiliated with Letterboxd.
```

- [ ] **Step 2: Confirm with the user, then create the GitHub repo and push** — the repo must be **public** for free GitHub Pages; ask the user to confirm public is OK before running:

```bash
gh repo create letterboxd-stats --public --source . --push
```

- [ ] **Step 3: Enable Pages**

```bash
gh api -X POST "repos/{owner}/letterboxd-stats/pages" -f "source[branch]=main" -f "source[path]=/" || \
gh api -X PUT "repos/{owner}/letterboxd-stats/pages" -f "source[branch]=main" -f "source[path]=/"
```

(If the API shape fails, fall back to telling the user: repo Settings → Pages → Deploy from branch `main` / root.)

- [ ] **Step 4: Verify the live URL** — `https://<owner>.github.io/letterboxd-stats/` loads the setup panel; run a quick smoke test with the real zip on the live site.

- [ ] **Step 5: Update README with the live link, commit, push**

```bash
git add README.md
git commit -m "Add README with usage and deploy link"
git push
```

---

## Plan Self-Review (done at authoring time)

- **Spec coverage:** every spec section maps to a task — parsing (T2), TMDB+cache+errors (T3, T9), all 12 page sections (T4/T5 compute, T6 markup, T7/T8 render), file-drop/progress/key UX (T6, T9), unmatched panel (T5 `unmatched`, T8 `renderUnmatched`), world map (T6 asset, T8 shading), tests (T1 harness, T2–T5), hosting (T10). *Deviation from spec:* per-film "manual re-search of unmatched titles" was cut (YAGNI — the unmatched list + clear-cache covers the need); noted here deliberately.
- **Placeholder scan:** clean — every code step ships real code; the two "adjust if reality differs" notes (world-map ids in T6, zip prefixes in T9) are verification steps, not deferred work.
- **Type consistency:** `Meta`, `Film`, `Entry`, cache contract (`undefined` vs `null`), `stats._tmdb` convention, and section ids are each defined once and referenced by the same names in T3→T5→T7→T8→T9.
