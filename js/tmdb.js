(function (global) {
  'use strict';
  const API = 'https://api.themoviedb.org/3';
  const IMG = 'https://image.tmdb.org/t/p/';
  const KEEP_JOBS = new Set(['Director', 'Screenplay', 'Writer', 'Producer', 'Original Music Composer', 'Director of Photography', 'Editor', 'Casting']);
  const LBPool = typeof module !== 'undefined' ? require('./pool.js') : global.LBPool;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const REQUEST_TIMEOUT_MS = 10000;

  function normTitle(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  class TmdbClient {
    constructor({ apiKey, cache, fetchFn, delayMs, concurrency }) {
      this.apiKey = apiKey;
      this.cache = cache;
      this.fetchFn = fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(global) : null);
      this.delayMs = delayMs == null ? 0 : delayMs;
      this.concurrency = concurrency == null ? 8 : concurrency;
      this._consecutiveUnavailable = 0;
    }

    async _get(path, params) {
      const qs = new URLSearchParams(Object.assign({ api_key: this.apiKey }, params || {}));
      const url = `${API}${path}?${qs}`;
      for (let attempt = 0; attempt < 5; attempt++) {
        let res;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try { res = await this.fetchFn(url, { signal: controller.signal }); }
        catch (e) { clearTimeout(timer); await sleep(500 * 2 ** attempt); continue; } // network blip or timeout
        clearTimeout(timer);
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

    async _searchTv(name, year) {
      const params = { query: name };
      if (year) params.first_air_date_year = year;
      const json = await this._get('/search/tv', params);
      const results = (json && json.results) || [];
      if (!results.length) return null;
      const nt = normTitle(name);
      return results.find(r => normTitle(r.name) === nt || normTitle(r.original_name) === nt) || results[0];
    }

    _mapCommon(d) {
      const credits = d.credits || {};
      return {
        genres: (d.genres || []).map(g => g.name),
        countries: (d.production_countries || []).map(c => ({ code: c.iso_3166_1, name: c.name })),
        languages: (d.spoken_languages || []).map(l => l.english_name || l.name).filter(Boolean),
        posterUrl: d.poster_path ? IMG + 'w342' + d.poster_path : null,
        popularity: d.popularity || 0,
        voteAverage: d.vote_average || 0,
        voteCount: d.vote_count || 0,
        cast: (credits.cast || []).slice(0, 15).map(p => ({ name: p.name, profileUrl: p.profile_path ? IMG + 'w185' + p.profile_path : null })),
        crew: (credits.crew || []).filter(p => KEEP_JOBS.has(p.job)).map(p => ({ name: p.name, job: p.job })),
      };
    }

    async lookup(film) {
      let hit = await this._search(film.name, film.year);
      if (!hit && film.year) hit = await this._search(film.name, null);
      if (hit) {
        const d = await this._get(`/movie/${hit.id}`, { append_to_response: 'credits' });
        if (!d) return null;
        return {
          id: d.id, title: d.title, runtime: d.runtime || 0,
          releaseDate: d.release_date || null,
          mediaType: 'movie',
          ...this._mapCommon(d),
        };
      }
      let tvHit = await this._searchTv(film.name, film.year);
      if (!tvHit && film.year) tvHit = await this._searchTv(film.name, null);
      if (!tvHit) return null;
      const d = await this._get(`/tv/${tvHit.id}`, { append_to_response: 'credits' });
      if (!d) return null;
      return {
        id: d.id, title: d.name, runtime: (d.episode_run_time && d.episode_run_time[0]) || 0,
        releaseDate: d.first_air_date || null,
        mediaType: 'tv',
        ...this._mapCommon(d),
      };
    }

    async enrich(films, onProgress) {
      const out = new Map();
      let done = 0;
      this._consecutiveUnavailable = 0;
      await LBPool.map(films, this.concurrency, async film => {
        let meta = await this.cache.get(film.key);
        if (meta === undefined || meta === null) {
          try {
            meta = await this.lookup(film);
            await this.cache.set(film.key, meta); // null (no-match) is cached too
            this._consecutiveUnavailable = 0;
          } catch (e) {
            if (e.message === 'TMDB_UNAUTHORIZED') throw e;
            this._consecutiveUnavailable++;
            if (this._consecutiveUnavailable >= 8) throw e; // total outage: abort the whole run
            meta = null; // TMDB_UNAVAILABLE: do NOT cache, retry next run
          }
          if (this.delayMs) await sleep(this.delayMs);
        }
        out.set(film.key, meta);
        done++;
        if (onProgress) onProgress(done, films.length, film);
      });
      return out;
    }
  }

  const api = { TmdbClient, IMG, normTitle };
  if (typeof module !== 'undefined') module.exports = api;
  global.LBTmdb = api;
})(typeof window !== 'undefined' ? window : globalThis);