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
    if (meta.posterUrl !== 'https://image.tmdb.org/t/p/w342/p.jpg') throw new Error('posterUrl wrong: ' + JSON.stringify(meta));
    if (meta.cast[0].profileUrl !== 'https://image.tmdb.org/t/p/w185/s.jpg') throw new Error('profileUrl wrong: ' + JSON.stringify(meta));
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
    const f = fakeFetch([['/search/movie', { results: [] }], ['/search/tv', { results: [] }]]);
    const cache = mapCache();
    const c = new TmdbClient({ apiKey: 'k', cache, fetchFn: f, delayMs: 0 });
    const out = await c.enrich([film], null);
    if (out.get('parasite|2019') !== null) throw new Error('no-match should be null');
    if (cache.raw.get('parasite|2019') !== null) throw new Error('no-match should be cached as null');
    if (f.calls.length !== 4) throw new Error('should retry movie search without year then fall back to tv search, got ' + f.calls.length);
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
  {
    const TV_DETAILS = { id: 1, name: 'Chernobyl', first_air_date: '2019-05-06', episode_run_time: [63, 60], genres: [{ name: 'Drama' }], production_countries: [{ iso_3166_1: 'US', name: 'United States of America' }], spoken_languages: [{ english_name: 'English' }], poster_path: '/c.jpg', popularity: 80, vote_average: 8.6, vote_count: 9000, credits: { cast: [{ name: 'Jared Harris', profile_path: '/j.jpg' }], crew: [{ name: 'Johan Renck', job: 'Director', department: 'Directing' }] } };
    const tvFilm = { key: 'chernobyl|2019', name: 'Chernobyl', year: 2019 };
    const f = fakeFetch([
      ['/search/movie', { results: [] }],
      ['/search/tv', { results: [{ id: 1, name: 'Chernobyl', original_name: 'Chernobyl' }] }],
      ['/tv/1', TV_DETAILS],
    ]);
    const c = new TmdbClient({ apiKey: 'k', cache: mapCache(), fetchFn: f, delayMs: 0 });
    const out = await c.enrich([tvFilm], null);
    const meta = out.get('chernobyl|2019');
    if (!meta) throw new Error('tv fallback should have matched');
    if (meta.title !== 'Chernobyl') throw new Error('tv title should come from name: ' + JSON.stringify(meta));
    if (meta.releaseDate !== '2019-05-06') throw new Error('tv releaseDate should come from first_air_date: ' + JSON.stringify(meta));
    if (meta.runtime !== 63) throw new Error('tv runtime should come from episode_run_time[0]: ' + JSON.stringify(meta));
    if (meta.mediaType !== 'tv') throw new Error('tv meta should have mediaType tv: ' + JSON.stringify(meta));
    if (meta.posterUrl !== 'https://image.tmdb.org/t/p/w342/c.jpg') throw new Error('tv posterUrl wrong: ' + JSON.stringify(meta));
    if (!f.calls.some(u => u.includes('/search/tv') && u.includes('first_air_date_year=2019'))) throw new Error('tv search missing first_air_date_year param');
    console.log('  ok   enrich falls back to tv search and maps tv meta');
  }
  {
    const cache = mapCache();
    await cache.set('parasite|2019', null); // previously cached as a no-match
    const f = fakeFetch([
      ['/search/movie', { results: [{ id: 1, title: 'Parasite', original_title: '기생충' }] }],
      ['/movie/1', DETAILS],
    ]);
    const c = new TmdbClient({ apiKey: 'k', cache, fetchFn: f, delayMs: 0 });
    const out = await c.enrich([film], null);
    const meta = out.get('parasite|2019');
    if (!meta || meta.runtime !== 133) throw new Error('cached null should be retried and matched: ' + JSON.stringify(meta));
    if (!cache.raw.get('parasite|2019') || cache.raw.get('parasite|2019').runtime !== 133) throw new Error('cache should be updated with the retried match');
    console.log('  ok   enrich retries cached no-match and updates cache on new match');
  }
  {
    const f = fakeFetch([
      ['/search/movie', { results: [] }],
      ['/search/tv', { results: [] }],
    ]);
    const cache = mapCache();
    const c = new TmdbClient({ apiKey: 'k', cache, fetchFn: f, delayMs: 0 });
    const out = await c.enrich([film], null);
    if (out.get('parasite|2019') !== null) throw new Error('still-unmatched should be null');
    if (cache.raw.get('parasite|2019') !== null) throw new Error('still-unmatched should be cached as null');
    if (f.calls.length !== 4) throw new Error('should try movie+year, movie, tv+year, tv (4 calls), got ' + f.calls.length);
    console.log('  ok   enrich caches null after exhausting movie and tv searches');
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
      const c = new TmdbClient({ apiKey: 'k', cache: mapCache(), fetchFn: alwaysDown, delayMs: 0, concurrency: 1 });
      let err = null;
      try { await c.enrich(films8, null); } catch (e) { err = e; }
      if (!err || err.message !== 'TMDB_UNAVAILABLE') throw new Error('8 consecutive unreachable lookups should abort with TMDB_UNAVAILABLE, got: ' + (err && err.message));
      console.log('  ok   enrich aborts after 8 consecutive TMDB_UNAVAILABLE failures');
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
        if (url.includes('/search/movie')) {
          const name = decodeURIComponent(/query=([^&]+)/.exec(url)[1]);
          if (name.startsWith('Flaky')) throw new Error('network down');
          return { ok: true, status: 200, json: async () => ({ results: [{ id: name, title: name, original_title: name }] }) };
        }
        if (url.includes('/movie/')) {
          const id = url.split('/movie/')[1].split('?')[0];
          return { ok: true, status: 200, json: async () => ({ id, title: id, runtime: 100, genres: [], production_countries: [], spoken_languages: [], release_date: '2020-01-01', poster_path: null, popularity: 0, vote_average: 0, vote_count: 0, credits: { cast: [], crew: [] } }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      };
      const films = [
        { key: 'b0', name: 'Flaky0' }, { key: 'b1', name: 'Flaky1' }, { key: 'b2', name: 'Flaky2' },
        { key: 'b3', name: 'GoodB' },
      ];
      const c = new TmdbClient({ apiKey: 'k', cache: mapCache(), fetchFn: dyn, delayMs: 0, concurrency: 1 });
      const out = await c.enrich(films, null);
      if (out.get('b0') !== null || out.get('b1') !== null || out.get('b2') !== null)
        throw new Error('below-threshold consecutive failures should resolve to null, not abort: ' + JSON.stringify([...out]));
      if (!out.get('b3') || out.get('b3').id !== 'GoodB')
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
        if (url.includes('/search/movie')) {
          const name = decodeURIComponent(/query=([^&]+)/.exec(url)[1]);
          if (name.startsWith('Flaky')) throw new Error('network down');
          return { ok: true, status: 200, json: async () => ({ results: [{ id: name, title: name, original_title: name }] }) };
        }
        if (url.includes('/movie/')) {
          const id = url.split('/movie/')[1].split('?')[0];
          return { ok: true, status: 200, json: async () => ({ id, title: id, runtime: 100, genres: [], production_countries: [], spoken_languages: [], release_date: '2020-01-01', poster_path: null, popularity: 0, vote_average: 0, vote_count: 0, credits: { cast: [], crew: [] } }) };
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
      const c = new TmdbClient({ apiKey: 'k', cache: mapCache(), fetchFn: dyn, delayMs: 0, concurrency: 1 });
      const out = await c.enrich(films, null);
      for (let i = 0; i < 3; i++) {
        if (out.get(`c-fail-${i}-0`) !== null || out.get(`c-fail-${i}-1`) !== null || out.get(`c-fail-${i}-2`) !== null)
          throw new Error('interleaved failures should resolve to null, not abort');
        if (!out.get(`c-good-${i}`) || out.get(`c-good-${i}`).id !== `GoodC${i}`)
          throw new Error('interleaved success should still resolve: ' + JSON.stringify(out.get(`c-good-${i}`)));
      }
      console.log('  ok   interleaved failures and successes never abort (counter resets on success)');
    } finally {
      global.setTimeout = realSetTimeout;
    }
  }
})().catch(e => { console.log('  FAIL tmdb async: ' + e.message); process.exitCode = 1; });
