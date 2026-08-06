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

  const ROOT_CSV_RE = /^(diary|watched|ratings|reviews|watchlist|profile|comments)\.csv$/;
  const LIKES_FILMS_RE = /^likes\/films\.csv$/;
  const LISTS_RE = /^lists\/([^/]+)\.csv$/;

  // Selects the canonical set of CSVs from a Letterboxd export's file list.
  // paths: array of file paths (no directory entries) as they appear in the zip.
  // Returns { canonicalKey: originalPath }. Every match is anchored to the full
  // (prefix-stripped) path so a root file can never be satisfied by a path that
  // has extra directory components in front of it (e.g. likes/reviews.csv,
  // deleted/diary.csv) - that was the bug: the old regex only anchored the end.
  function selectExportFiles(paths) {
    let prefix = '';
    if (paths.length && paths.every(p => p.includes('/'))) {
      const firstSegments = new Set(paths.map(p => p.slice(0, p.indexOf('/'))));
      if (firstSegments.size === 1) prefix = `${[...firstSegments][0]}/`;
    }

    const result = {};
    for (const original of paths) {
      const p = prefix && original.startsWith(prefix) ? original.slice(prefix.length) : original;
      let key = null;
      if (ROOT_CSV_RE.test(p)) key = p;
      else if (LIKES_FILMS_RE.test(p)) key = 'likes/films.csv';
      else {
        const m = p.match(LISTS_RE);
        if (m) key = `lists/${m[1]}.csv`;
      }
      if (key && !(key in result)) result[key] = original;
    }
    return result;
  }

  function filmKey(name, year) { return `${(name || '').toLowerCase()}|${year || ''}`; }

  // Builds diary-shaped entries from watched.csv for exports that have no
  // diary entries at all (films marked watched without being logged). Only
  // meant to be used when data.diary is completely empty - never merge into
  // a partial diary, since that would double-count or misdate real entries.
  function synthesizeDiary(data) {
    const ratingByKey = new Map();
    for (const r of data.ratings) {
      if (r.rating != null) ratingByKey.set(filmKey(r.name, r.year), r.rating);
    }
    const out = [];
    for (const w of data.watched) {
      if (!w.date) continue;
      out.push({
        name: w.name,
        year: w.year,
        uri: w.uri,
        rating: ratingByKey.has(filmKey(w.name, w.year)) ? ratingByKey.get(filmKey(w.name, w.year)) : null,
        rewatch: false,
        tags: [],
        date: w.date,
        watchedDate: w.date,
      });
    }
    return out;
  }

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

  const api = { parseCsv, parseExport, buildFilmIndex, filmKey, selectExportFiles, synthesizeDiary };
  if (typeof module !== 'undefined') module.exports = api;
  global.LBParse = api;
})(typeof window !== 'undefined' ? window : globalThis);
