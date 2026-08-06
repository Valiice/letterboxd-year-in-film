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
          vq.onsuccess = () => res(vq.result);
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
  let zipFile = null, appData = null, filmIndex = null, tmdbMap = null, currentYear = null;

  function setError(msg) {
    const e = $('#setup-error');
    e.textContent = msg || ''; e.classList.toggle('hidden', !msg);
    e.classList.remove('ok');
  }
  function setNote(msg) {
    const e = $('#setup-error');
    e.textContent = msg || ''; e.classList.toggle('hidden', !msg);
    e.classList.add('ok');
  }
  function show(id) {
    for (const s of ['#setup', '#progress', '#stats']) $(s).classList.toggle('hidden', s !== id);
  }
  function arm() {
    $('#btn-start').disabled = !zipFile;
    $('#drop-zone').classList.toggle('armed', !!zipFile);
    if (zipFile) $('#drop-zone').firstChild.textContent = `Ready: ${zipFile.name} `;
  }

  async function readZip(file) {
    const zip = await JSZip.loadAsync(file);
    const paths = Object.entries(zip.files).filter(([, entry]) => !entry.dir).map(([path]) => path);
    const selected = LBParse.selectExportFiles(paths);
    const files = {};
    for (const [key, path] of Object.entries(selected)) files[key] = await zip.files[path].async('string');
    if (!files['diary.csv'] && !files['watched.csv']) throw new Error('That zip has no diary.csv/watched.csv - is it a Letterboxd export?');
    return files;
  }

  async function start() {
    setError('');
    const key = $('#tmdb-key').value.trim();
    localStorage.setItem('lbx-tmdb-key', key);
    try {
      const files = await readZip(zipFile);
      appData = LBParse.parseExport(files);
      if (appData.diary.length === 0 && appData.watched.length > 0) {
        appData.diary = LBParse.synthesizeDiary(appData);
        appData.diarySynthesized = true;
      }
      filmIndex = LBParse.buildFilmIndex(appData);
      const year = currentYearDefault();
      const { priority, rest } = LBStats.splitFilmsByPriority(appData, filmIndex, year);
      $('#progress h2').textContent = key ? 'Looking up your films on TMDB…' : 'Looking up your films…';
      show('#progress');
      const cache = new IdbCache(await openDb());
      const client = key
        ? new LBTmdb.TmdbClient({ apiKey: key, cache, fetchFn: (u) => fetch(u) })
        : new LBCinemeta.CinemetaClient({ cache, fetchFn: (u) => fetch(u) });
      const eta = makeEta(priority.length);
      tmdbMap = await client.enrich(priority, (done, total, film) => {
        $('#progress-bar').style.width = `${done / total * 100}%`;
        $('#progress-label').textContent = `${done} / ${total} - ${film.name}`;
        $('#progress-eta').textContent = eta(done);
      });
      buildYearSelect();
      renderYear(year);
      show('#stats');
      enrichRestInBackground(client, rest);
    } catch (e) {
      show('#setup');
      if (e.message === 'TMDB_UNAUTHORIZED') setError('TMDB rejected that API key - double-check it (v3 auth key), or clear the key field to continue without one.');
      else if (e.message === 'CINEMETA_UNAVAILABLE') setError("Couldn't reach the film database - check your connection and try again.");
      else setError(e.message);
    }
  }

  // Estimates time left from a rolling window of recent completions, so the
  // figure tracks real throughput instead of a stale overall average.
  function makeEta(total) {
    const stamps = [];
    return function tick(done) {
      stamps.push(Date.now());
      if (stamps.length > 40) stamps.shift();
      if (stamps.length < 8) return '';
      const span = (stamps[stamps.length - 1] - stamps[0]) / 1000;
      if (span <= 0) return '';
      const rate = (stamps.length - 1) / span;
      const secs = Math.max(0, total - done) / rate;
      if (!isFinite(secs) || secs <= 0) return '';
      if (secs < 45) return 'less than a minute left';
      const mins = Math.round(secs / 60);
      return mins <= 1 ? 'about a minute left' : `about ${mins} min left`;
    };
  }

  async function enrichRestInBackground(client, rest) {
    if (!rest.length) return;
    const status = $('#bg-status'), text = $('#bg-status-text'), fill = $('#bg-fill');
    status.classList.remove('hidden');
    text.textContent = `Loading ${rest.length} more films`;
    try {
      const eta = makeEta(rest.length);
      const restMap = await client.enrich(rest, (done, total) => {
        const left = eta(done);
        text.textContent = `Loading ${total - done} more films${left ? ` - ${left}` : ''}`;
        fill.style.width = `${done / total * 100}%`;
      });
      for (const [k, v] of restMap) tmdbMap.set(k, v);
      status.classList.add('hidden');
      renderYear(currentYear, { keepScroll: true });
    } catch (e) {
      text.textContent = 'Some films could not be loaded - reload to try again.';
      fill.style.width = '0';
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
  function renderYear(year, opts) {
    currentYear = year;
    const stats = LBStats.computeStats(appData, filmIndex, tmdbMap, year);
    stats._tmdb = tmdbMap;
    LBRender.renderAll(stats);
    if (!(opts && opts.keepScroll)) window.scrollTo(0, 0);
  }

  // ---- wiring ----
  window.addEventListener('DOMContentLoaded', () => {
    $('#tmdb-key').value = localStorage.getItem('lbx-tmdb-key') || '';
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
      setNote('Film cache cleared.');
    });
    arm();
  });
})();
