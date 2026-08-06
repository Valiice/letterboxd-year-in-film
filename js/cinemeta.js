(function (global) {
  'use strict';
  const API = 'https://v3-cinemeta.strem.io';
  const LBCountries = typeof module !== 'undefined' ? require('./country-codes.js') : global.LBCountries;
  const LBPool = typeof module !== 'undefined' ? require('./pool.js') : global.LBPool;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const REQUEST_TIMEOUT_MS = 10000;

  function localNormTitle(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  // Reuse LBTmdb.normTitle if it's already loaded at runtime, so the two providers
  // agree on title normalization; otherwise fall back to an identical local copy.
  function normTitle(s) {
    if (global.LBTmdb && typeof global.LBTmdb.normTitle === 'function') return global.LBTmdb.normTitle(s);
    return localNormTitle(s);
  }

  function parseYear(releaseInfo) {
    if (!releaseInfo) return null;
    const m = /(\d{4})/.exec(String(releaseInfo));
    return m ? parseInt(m[1], 10) : null;
  }

  class CinemetaClient {
    constructor({ cache, fetchFn, delayMs, concurrency }) {
      this.cache = cache;
      this.fetchFn = fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(global) : null);
      this.delayMs = delayMs == null ? 0 : delayMs;
      this.concurrency = concurrency == null ? 12 : concurrency;
      this._consecutiveUnavailable = 0;
    }

    async _get(url) {
      for (let attempt = 0; attempt < 5; attempt++) {
        let res;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try { res = await this.fetchFn(url, { signal: controller.signal }); }
        catch (e) { clearTimeout(timer); await sleep(500 * 2 ** attempt); continue; } // network blip or timeout
        clearTimeout(timer);
        if (res.status === 429 || res.status >= 500) { await sleep(500 * 2 ** attempt); continue; }
        if (!res.ok) return null;
        return res.json();
      }
      throw new Error('CINEMETA_UNAVAILABLE');
    }

    async _search(type, name) {
      const url = `${API}/catalog/${type}/top/search=${encodeURIComponent(name)}.json`;
      const json = await this._get(url);
      return (json && json.metas) || [];
    }

    // Only exact normalized-title matches are ever candidates: a title merely
    // being the closest year is not enough (a corrupted match is worse than no
    // match, since it silently poisons genre/country/runtime/hours stats).
    _pickBest(results, name, year) {
      const nt = normTitle(name);
      const exact = results.filter(r => normTitle(r.name) === nt);
      if (!exact.length) return null;
      if (year != null) {
        const nearYear = exact.find(r => { const y = parseYear(r.releaseInfo); return y != null && Math.abs(y - year) <= 1; });
        if (nearYear) return nearYear;
      }
      return exact[0]; // year metadata legitimately differs between sources
    }

    _mapMeta(d, imdbId, type) {
      const countries = (d.country || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(name => ({ code: LBCountries.toCode(name), name }))
        .filter(c => c.code);
      return {
        id: imdbId,
        title: d.name,
        runtime: parseInt(d.runtime, 10) || 0,
        genres: d.genres || [],
        countries,
        languages: d.language ? [d.language] : [],
        releaseDate: d.released ? d.released.slice(0, 10) : (d.year ? `${d.year}-01-01` : null),
        posterUrl: d.poster || null,
        popularity: Number(d.popularity) || 0,
        voteAverage: parseFloat(d.imdbRating) || 0,
        voteCount: null,
        cast: (d.cast || []).slice(0, 15).map(name => ({ name, profileUrl: null })),
        crew: [
          ...(d.director || []).map(name => ({ name, job: 'Director' })),
          ...(d.writer || []).map(name => ({ name, job: 'Writer' })),
        ],
        mediaType: type === 'series' ? 'tv' : 'movie',
      };
    }

    async lookup(film) {
      let results = await this._search('movie', film.name);
      let hit = this._pickBest(results, film.name, film.year);
      let type = 'movie';
      if (!hit) {
        results = await this._search('series', film.name);
        hit = this._pickBest(results, film.name, film.year);
        type = 'series';
      }
      if (!hit) return null;
      const imdbId = hit.imdb_id || hit.id;
      const json = await this._get(`${API}/meta/${type}/${imdbId}.json`);
      const d = json && json.meta;
      if (!d) return null;
      return this._mapMeta(d, imdbId, type);
    }

    async enrich(films, onProgress) {
      const out = new Map();
      let done = 0;
      this._consecutiveUnavailable = 0;
      await LBPool.map(films, this.concurrency, async film => {
        const cacheKey = `cine|${film.key}`;
        let meta = await this.cache.get(cacheKey);
        if (meta === undefined || meta === null) {
          try {
            meta = await this.lookup(film);
            await this.cache.set(cacheKey, meta); // null (no-match) is cached too
            this._consecutiveUnavailable = 0;
          } catch (e) {
            if (e.message === 'CINEMETA_UNAVAILABLE') {
              this._consecutiveUnavailable++;
              if (this._consecutiveUnavailable >= 8) throw e; // total outage: abort the whole run
            }
            meta = null; // CINEMETA_UNAVAILABLE: do NOT cache, retry next run
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

  const api = { CinemetaClient };
  if (typeof module !== 'undefined') module.exports = api;
  global.LBCinemeta = api;
})(typeof window !== 'undefined' ? window : globalThis);
