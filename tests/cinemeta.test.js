'use strict';
const { CinemetaClient } = require('../js/cinemeta.js');

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

const PARASITE_SEARCH = { metas: [{ id: 'tt6751668', imdb_id: 'tt6751668', type: 'movie', name: 'Parasite', poster: 'https://m.media-amazon.com/images/M/x.jpg', releaseInfo: '2019' }] };
const PARASITE_DETAILS = {
  meta: {
    name: 'Parasite', year: 2019, released: '2019-11-08T00:00:00.000Z', runtime: '133 min',
    genres: ['Drama', 'Thriller'], country: 'United States, United Kingdom', language: null,
    director: ['Bong Joon Ho'], writer: ['Bong Joon Ho', 'Han Jin-won'],
    cast: ['Song Kang-ho', 'Lee Sun-kyun', 'Cho Yeo-jeong'],
    imdbRating: '8.5', poster: 'https://images.metahub.space/poster/small/tt6751668/img',
    popularity: 42, description: 'desc',
  },
};
const film = { key: 'parasite|2019', name: 'Parasite', year: 2019 };

(async () => {
  {
    const f = fakeFetch([
      ['/catalog/movie/top/search=', PARASITE_SEARCH],
      ['/meta/movie/tt6751668', PARASITE_DETAILS],
    ]);
    const c = new CinemetaClient({ cache: mapCache(), fetchFn: f, delayMs: 0 });
    const out = await c.enrich([film], null);
    const meta = out.get('parasite|2019');
    if (meta.runtime !== 133) throw new Error('runtime wrong: ' + JSON.stringify(meta));
    if (meta.voteAverage !== 8.5) throw new Error('voteAverage wrong: ' + JSON.stringify(meta));
    if (JSON.stringify(meta.countries) !== JSON.stringify([{ code: 'US', name: 'United States' }, { code: 'GB', name: 'United Kingdom' }]))
      throw new Error('countries wrong: ' + JSON.stringify(meta.countries));
    if (meta.languages.length !== 0) throw new Error('languages should be empty: ' + JSON.stringify(meta.languages));
    if (!meta.crew.some(p => p.name === 'Bong Joon Ho' && p.job === 'Director')) throw new Error('crew missing director: ' + JSON.stringify(meta.crew));
    if (meta.cast[0].profileUrl !== null) throw new Error('cast profileUrl should be null: ' + JSON.stringify(meta.cast[0]));
    if (meta.posterUrl !== 'https://images.metahub.space/poster/small/tt6751668/img') throw new Error('posterUrl wrong: ' + JSON.stringify(meta));
    if (meta.mediaType !== 'movie') throw new Error('mediaType wrong: ' + JSON.stringify(meta));
    console.log('  ok   movie mapping');
  }
  {
    const SERIES_SEARCH = { metas: [{ id: 'tt1234567', imdb_id: 'tt1234567', type: 'series', name: 'Chernobyl', releaseInfo: '2019' }] };
    const SERIES_DETAILS = { meta: { name: 'Chernobyl', year: 2019, released: '2019-05-06T00:00:00.000Z', runtime: '60 min', genres: ['Drama'], country: 'United States', language: 'English', director: ['Johan Renck'], writer: ['Craig Mazin'], cast: ['Jared Harris'], imdbRating: '9.4', poster: 'https://x/y.jpg', popularity: 10 } };
    const f = fakeFetch([
      ['/catalog/movie/top/search=', { metas: [] }],
      ['/catalog/series/top/search=', SERIES_SEARCH],
      ['/meta/series/tt1234567', SERIES_DETAILS],
    ]);
    const c = new CinemetaClient({ cache: mapCache(), fetchFn: f, delayMs: 0 });
    const tvFilm = { key: 'chernobyl|2019', name: 'Chernobyl', year: 2019 };
    const out = await c.enrich([tvFilm], null);
    const meta = out.get('chernobyl|2019');
    if (!meta || meta.mediaType !== 'tv') throw new Error('series fallback should yield mediaType tv: ' + JSON.stringify(meta));
    if (!f.calls.some(u => u.includes('/meta/series/tt1234567'))) throw new Error('series details endpoint should have been called: ' + JSON.stringify(f.calls));
    console.log('  ok   series fallback');
  }
  {
    const SEARCH = { metas: [
      { id: 'tt1', imdb_id: 'tt1', type: 'movie', name: 'Same Title', releaseInfo: '2019' },
      { id: 'tt2', imdb_id: 'tt2', type: 'movie', name: 'Same Title', releaseInfo: '1982' },
      { id: 'tt3', imdb_id: 'tt3', type: 'movie', name: 'Same Title', releaseInfo: '2004' },
    ] };
    const DETAILS = { meta: { name: 'Same Title', year: 1982, runtime: '100 min', genres: [], country: '', cast: [], director: [], writer: [], imdbRating: '7.0', poster: null } };
    const f = fakeFetch([
      ['/catalog/movie/top/search=', SEARCH],
      ['/meta/movie/tt2', DETAILS],
    ]);
    const c = new CinemetaClient({ cache: mapCache(), fetchFn: f, delayMs: 0 });
    const disambigFilm = { key: 'same title|1982', name: 'Same Title', year: 1982 };
    const out = await c.enrich([disambigFilm], null);
    const meta = out.get('same title|1982');
    if (!meta || meta.id !== 'tt2') throw new Error('should have picked the 1982 match: ' + JSON.stringify(meta));
    if (!f.calls.some(u => u.includes('/meta/movie/tt2'))) throw new Error('should have fetched tt2 details: ' + JSON.stringify(f.calls));
    console.log('  ok   year disambiguation');
  }
  {
    // Regression: closest-year-with-no-exact-title-match must NOT be selected.
    // Real Cinemeta search for "Stranger Things 5: The Finale" returns only
    // related-but-different titles; picking the nearest year silently corrupts
    // stats (see live repro), so this must resolve null instead.
    const MOVIE_SEARCH = { metas: [
      { id: 'tt10', imdb_id: 'tt10', type: 'movie', name: 'One Last Adventure: The Making of Stranger Things 5', releaseInfo: '2026' },
      { id: 'tt11', imdb_id: 'tt11', type: 'movie', name: 'Behind the Curtain: Stranger Things - The First Shadow', releaseInfo: '2025' },
      { id: 'tt12', imdb_id: 'tt12', type: 'movie', name: 'Stranger Things', releaseInfo: '2010' },
    ] };
    const SERIES_SEARCH = { metas: [
      { id: 'tt13', imdb_id: 'tt13', type: 'series', name: 'Stranger Things', releaseInfo: '2016-2025' },
    ] };
    const f = fakeFetch([
      ['/catalog/movie/top/search=', MOVIE_SEARCH],
      ['/catalog/series/top/search=', SERIES_SEARCH],
    ]);
    const cache = mapCache();
    const c = new CinemetaClient({ cache, fetchFn: f, delayMs: 0 });
    const strangerFilm = { key: 'stranger things 5: the finale|2025', name: 'Stranger Things 5: The Finale', year: 2025 };
    const out = await c.enrich([strangerFilm], null);
    if (out.get(strangerFilm.key) !== null) throw new Error('no exact title match should resolve null, not the nearest-year decoy: ' + JSON.stringify(out.get(strangerFilm.key)));
    if (!cache.raw.has(`cine|${strangerFilm.key}`) || cache.raw.get(`cine|${strangerFilm.key}`) !== null) throw new Error('should cache null under cine| prefix');
    if (!f.calls.some(u => u.includes('/catalog/movie/top/search=')) || !f.calls.some(u => u.includes('/catalog/series/top/search='))) {
      throw new Error('should try both movie and series searches: ' + JSON.stringify(f.calls));
    }
    if (f.calls.some(u => u.includes('/meta/'))) throw new Error('should never fetch details for a non-exact-title decoy: ' + JSON.stringify(f.calls));
    console.log('  ok   no exact title match returns null (does not fall back to nearest year)');
  }
  {
    // Rule 3: the only exact-title candidate is still picked even when its year
    // is well outside +/-1 (year metadata legitimately differs between sources).
    const SEARCH = { metas: [{ id: 'tt20', imdb_id: 'tt20', type: 'movie', name: 'Old Movie', releaseInfo: '2017' }] };
    const DETAILS = { meta: { name: 'Old Movie', year: 2017, runtime: '90 min', genres: [], country: '', cast: [], director: [], writer: [], imdbRating: '6.0', poster: null } };
    const f = fakeFetch([
      ['/catalog/movie/top/search=', SEARCH],
      ['/meta/movie/tt20', DETAILS],
    ]);
    const c = new CinemetaClient({ cache: mapCache(), fetchFn: f, delayMs: 0 });
    const oldFilm = { key: 'old movie|2020', name: 'Old Movie', year: 2020 };
    const out = await c.enrich([oldFilm], null);
    const meta = out.get('old movie|2020');
    if (!meta || meta.id !== 'tt20') throw new Error('sole exact-title match should be picked despite year being 3 off: ' + JSON.stringify(meta));
    console.log('  ok   exact title match wins even with distant year (no other candidates)');
  }
  {
    const f = fakeFetch([
      ['/catalog/movie/top/search=', { metas: [] }],
      ['/catalog/series/top/search=', { metas: [] }],
    ]);
    const cache = mapCache();
    const c = new CinemetaClient({ cache, fetchFn: f, delayMs: 0 });
    const out = await c.enrich([film], null);
    if (out.get('parasite|2019') !== null) throw new Error('no-match should be null');
    if (!cache.raw.has('cine|parasite|2019') || cache.raw.get('cine|parasite|2019') !== null) throw new Error('no-match should be cached as null under cine| prefix');
    console.log('  ok   no match anywhere caches null under cine| prefix');
  }
  {
    const cache = mapCache();
    await cache.set('cine|parasite|2019', { id: 'tt6751668', runtime: 133 });
    const f = fakeFetch([]);
    const c = new CinemetaClient({ cache, fetchFn: f, delayMs: 0 });
    const out = await c.enrich([film], null);
    if (out.get('parasite|2019').runtime !== 133) throw new Error('cache not used');
    if (f.calls.length !== 0) throw new Error('fetched despite cache: ' + JSON.stringify(f.calls));
    console.log('  ok   cache hit short-circuits with zero fetches');
  }
  {
    const DETAILS = { meta: { name: 'Parasite', year: 2019, runtime: '133 min', genres: [], country: 'Freedonia', cast: [], director: [], writer: [], imdbRating: '8.5', poster: null } };
    const f = fakeFetch([
      ['/catalog/movie/top/search=', PARASITE_SEARCH],
      ['/meta/movie/tt6751668', DETAILS],
    ]);
    const c = new CinemetaClient({ cache: mapCache(), fetchFn: f, delayMs: 0 });
    const out = await c.enrich([film], null);
    const meta = out.get('parasite|2019');
    if (!meta || meta.countries.length !== 0) throw new Error('unknown country should be dropped: ' + JSON.stringify(meta));
    console.log('  ok   unknown country dropped');
  }
  {
    // Finding 1: a total outage (every lookup exhausting retries) must abort the
    // whole run instead of silently resolving every film to null.
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, 0, ...args); // skip the real retry backoff delays
    try {
      const alwaysDown = async url => { alwaysDown.calls.push(url); throw new Error('network down'); };
      alwaysDown.calls = [];
      const films8 = Array.from({ length: 8 }, (_, i) => ({ key: `outage${i}`, name: `Outage${i}` }));
      const c = new CinemetaClient({ cache: mapCache(), fetchFn: alwaysDown, delayMs: 0, concurrency: 1 });
      let err = null;
      try { await c.enrich(films8, null); } catch (e) { err = e; }
      if (!err || err.message !== 'CINEMETA_UNAVAILABLE') throw new Error('8 consecutive unreachable lookups should abort with CINEMETA_UNAVAILABLE, got: ' + (err && err.message));
      console.log('  ok   enrich aborts after 8 consecutive CINEMETA_UNAVAILABLE failures');
    } finally {
      global.setTimeout = realSetTimeout;
    }
  }
  {
    // Fewer than 8 consecutive failures must resolve normally: nulls for the
    // failures, real metas for whatever still succeeds.
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, 0, ...args);
    try {
      const dyn = async url => {
        if (url.includes('/catalog/movie/top/search=')) {
          const name = decodeURIComponent(/search=([^.]+)\.json/.exec(url)[1]);
          if (name.startsWith('Flaky')) throw new Error('network down');
          const id = 'tt' + name;
          return { ok: true, status: 200, json: async () => ({ metas: [{ id, imdb_id: id, type: 'movie', name, releaseInfo: '2020' }] }) };
        }
        if (url.includes('/catalog/series/top/search=')) return { ok: true, status: 200, json: async () => ({ metas: [] }) };
        if (url.includes('/meta/movie/')) {
          const id = url.split('/meta/movie/')[1].replace('.json', '');
          return { ok: true, status: 200, json: async () => ({ meta: { name: id.slice(2), year: 2020, runtime: '100 min', genres: [], country: '', cast: [], director: [], writer: [], imdbRating: '7.0', poster: null } }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      };
      const films = [
        { key: 'b0', name: 'Flaky0' }, { key: 'b1', name: 'Flaky1' }, { key: 'b2', name: 'Flaky2' },
        { key: 'b3', name: 'GoodB' },
      ];
      const c = new CinemetaClient({ cache: mapCache(), fetchFn: dyn, delayMs: 0, concurrency: 1 });
      const out = await c.enrich(films, null);
      if (out.get('b0') !== null || out.get('b1') !== null || out.get('b2') !== null)
        throw new Error('below-threshold consecutive failures should resolve to null, not abort: ' + JSON.stringify([...out]));
      if (!out.get('b3') || out.get('b3').id !== 'ttGoodB')
        throw new Error('lookup after a run of failures below the threshold should still succeed: ' + JSON.stringify(out.get('b3')));
      console.log('  ok   fewer than 8 consecutive failures resolves normally with nulls for the failures');
    } finally {
      global.setTimeout = realSetTimeout;
    }
  }
  {
    // Failures interleaved with successes must never abort, however many
    // failures accumulate in total, because each success resets the counter.
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, 0, ...args);
    try {
      const dyn = async url => {
        if (url.includes('/catalog/movie/top/search=')) {
          const name = decodeURIComponent(/search=([^.]+)\.json/.exec(url)[1]);
          if (name.startsWith('Flaky')) throw new Error('network down');
          const id = 'tt' + name;
          return { ok: true, status: 200, json: async () => ({ metas: [{ id, imdb_id: id, type: 'movie', name, releaseInfo: '2020' }] }) };
        }
        if (url.includes('/catalog/series/top/search=')) return { ok: true, status: 200, json: async () => ({ metas: [] }) };
        if (url.includes('/meta/movie/')) {
          const id = url.split('/meta/movie/')[1].replace('.json', '');
          return { ok: true, status: 200, json: async () => ({ meta: { name: id.slice(2), year: 2020, runtime: '100 min', genres: [], country: '', cast: [], director: [], writer: [], imdbRating: '7.0', poster: null } }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      };
      // 3 failures then 1 success, repeated 3 times: 9 failures overall (more
      // than the threshold of 8) but never more than 3 in a row.
      const films = [];
      for (let i = 0; i < 3; i++) {
        films.push({ key: `c-fail-${i}-0`, name: `Flaky${i}0` });
        films.push({ key: `c-fail-${i}-1`, name: `Flaky${i}1` });
        films.push({ key: `c-fail-${i}-2`, name: `Flaky${i}2` });
        films.push({ key: `c-good-${i}`, name: `GoodC${i}` });
      }
      const c = new CinemetaClient({ cache: mapCache(), fetchFn: dyn, delayMs: 0, concurrency: 1 });
      const out = await c.enrich(films, null);
      for (let i = 0; i < 3; i++) {
        if (out.get(`c-fail-${i}-0`) !== null || out.get(`c-fail-${i}-1`) !== null || out.get(`c-fail-${i}-2`) !== null)
          throw new Error('interleaved failures should resolve to null, not abort');
        if (!out.get(`c-good-${i}`) || out.get(`c-good-${i}`).id !== `ttGoodC${i}`)
          throw new Error('interleaved success should still resolve: ' + JSON.stringify(out.get(`c-good-${i}`)));
      }
      console.log('  ok   interleaved failures and successes never abort (counter resets on success)');
    } finally {
      global.setTimeout = realSetTimeout;
    }
  }
})().catch(e => { console.log('  FAIL cinemeta async: ' + e.message); process.exitCode = 1; });
