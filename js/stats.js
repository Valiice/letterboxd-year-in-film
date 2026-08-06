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
      lists: year === 'all' ? data.lists.length : 0,
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

  // ---- TMDB-dependent stats ----
  const LBParse = global.LBParse || (typeof require !== 'undefined' ? require('./parse.js') : null);
  const fkey = (name, year) => LBParse.filmKey(name, year);

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
        if (!cast.has(p.name)) cast.set(p.name, { name: p.name, profileUrl: p.profileUrl, count: 0, ratings: [] });
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
    // Cinemeta supplies no voteCount, so fall back to popularity - record which
    // basis won so the renderer can label the tile correctly.
    const popularityOrVotes = m => m.voteCount != null ? m.voteCount : m.popularity;
    const pickPopularity = dir => {
      const p = pick(films, popularityOrVotes, dir);
      return p && { ...p, basis: p.meta.voteCount != null ? 'votes' : 'popularity' };
    };
    return {
      highestAvg: pick(films, m => m.voteAverage, 1), lowestAvg: pick(films, m => m.voteAverage, -1),
      mostPopular: pickPopularity(1), mostObscure: pickPopularity(-1),
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

  // ---- "beyond parity" stats ----

  function tasteDivergence(entries, filmIndex, tmdbMap) {
    const rows = [];
    for (const f of uniqueFilms(entries, filmIndex)) {
      if (f.rating == null) continue;
      const m = tmdbMap.get(f.key);
      if (!m || !(m.voteAverage > 0)) continue;
      rows.push({ film: f, meta: m, delta: round1(f.rating * 2 - m.voteAverage) });
    }
    if (!rows.length) return { ratedCount: 0, meanDelta: null, meanAbsDelta: null, youHigher: [], youLower: [] };
    const meanDelta = round1(rows.reduce((a, r) => a + r.delta, 0) / rows.length);
    const meanAbsDelta = round1(rows.reduce((a, r) => a + Math.abs(r.delta), 0) / rows.length);
    const youHigher = rows.slice().sort((a, b) => b.delta - a.delta).slice(0, 6);
    const youLower = rows.slice().sort((a, b) => a.delta - b.delta).slice(0, 6);
    return { ratedCount: rows.length, meanDelta, meanAbsDelta, youHigher, youLower };
  }

  function yearOverYear(data, filmIndex, tmdbMap) {
    const years = [...new Set(data.diary.map(e => yearOf(e.watchedDate)).filter(Boolean))].sort((a, b) => a - b);
    return years.map(year => {
      const entries = entriesForYear(data, year);
      const ratings = entries.map(e => e.rating).filter(r => r != null);
      const genreCounts = new Map();
      for (const f of uniqueFilms(entries, filmIndex)) {
        const m = tmdbMap.get(f.key);
        if (!m) continue;
        for (const g of m.genres) genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
      }
      let topGenre = null;
      if (genreCounts.size) topGenre = [...genreCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      return {
        year, films: entries.length, hours: hoursWatched(entries, tmdbMap),
        avgRating: ratings.length ? round1(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null,
        topGenre, rewatches: entries.filter(e => e.rewatch === true).length,
      };
    });
  }

  function calendar(entries, year) {
    if (year === 'all') return null;
    const counts = new Map();
    for (const e of entries) {
      if (!e.watchedDate) continue;
      counts.set(e.watchedDate, (counts.get(e.watchedDate) || 0) + 1);
    }
    const offset = (new Date(Date.UTC(year, 0, 1)).getUTCDay() + 6) % 7;
    const yearStart = Date.UTC(year, 0, 1);
    const numDays = Math.round((Date.UTC(year + 1, 0, 1) - yearStart) / 86400000);
    const days = [];
    let total = 0, activeDays = 0, maxCount = 0;
    for (let dayIdx = 0; dayIdx < numDays; dayIdx++) {
      const date = new Date(yearStart + dayIdx * 86400000).toISOString().slice(0, 10);
      const count = counts.get(date) || 0;
      days.push({ date, count, dow: (dayIdx + offset) % 7, week: Math.floor((dayIdx + offset) / 7) });
      total += count;
      if (count > 0) activeDays++;
      if (count > maxCount) maxCount = count;
    }
    return { days, maxCount, activeDays, total };
  }

  function streaks(entries) {
    const counts = new Map();
    for (const e of entries) {
      if (!e.watchedDate) continue;
      counts.set(e.watchedDate, (counts.get(e.watchedDate) || 0) + 1);
    }
    const dates = [...counts.keys()].sort();
    const activeDays = dates.length;
    if (!activeDays) return { longest: null, biggestDay: null, longestGap: null, activeDays: 0 };

    const dayNum = ds => Math.round(Date.UTC(+ds.slice(0, 4), +ds.slice(5, 7) - 1, +ds.slice(8, 10)) / 86400000);

    let longest = { days: 1, start: dates[0], end: dates[0] };
    let curStart = dates[0], curLen = 1;
    for (let i = 1; i < dates.length; i++) {
      if (dayNum(dates[i]) === dayNum(dates[i - 1]) + 1) {
        curLen++;
      } else {
        if (curLen > longest.days) longest = { days: curLen, start: curStart, end: dates[i - 1] };
        curStart = dates[i]; curLen = 1;
      }
    }
    if (curLen > longest.days) longest = { days: curLen, start: curStart, end: dates[dates.length - 1] };

    let biggestDay = { date: dates[0], count: counts.get(dates[0]) };
    for (const d of dates) if (counts.get(d) > biggestDay.count) biggestDay = { date: d, count: counts.get(d) };

    let longestGap = null;
    for (let i = 1; i < dates.length; i++) {
      const gapDays = dayNum(dates[i]) - dayNum(dates[i - 1]) - 1;
      if (gapDays >= 1 && (!longestGap || gapDays > longestGap.days)) {
        longestGap = { days: gapDays, start: dates[i - 1], end: dates[i] };
      }
    }

    return { longest, biggestDay, longestGap, activeDays };
  }

  function watchlistAging(data, today) {
    const list = data.watchlist;
    if (!list.length) return { total: 0, medianDaysWaiting: null, addedByYear: [], oldest: [] };
    const dayMs = ds => Date.UTC(+ds.slice(0, 4), +ds.slice(5, 7) - 1, +ds.slice(8, 10));
    const todayMs = dayMs(today);
    const rows = list.map(w => ({
      name: w.name, year: w.year, uri: w.uri, added: w.date,
      daysWaiting: Math.max(0, Math.round((todayMs - dayMs(w.date)) / 86400000)),
    }));
    const sortedDays = rows.map(r => r.daysWaiting).sort((a, b) => a - b);
    const mid = Math.floor(sortedDays.length / 2);
    const medianDaysWaiting = sortedDays.length % 2
      ? sortedDays[mid]
      : Math.round((sortedDays[mid - 1] + sortedDays[mid]) / 2);
    const byYear = new Map();
    for (const w of list) {
      const y = yearOf(w.date);
      if (y == null) continue;
      byYear.set(y, (byYear.get(y) || 0) + 1);
    }
    const addedByYear = [...byYear.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year);
    const oldest = rows.slice().sort((a, b) => a.added.localeCompare(b.added)).slice(0, 8);
    return { total: rows.length, medianDaysWaiting, addedByYear, oldest };
  }

  function reviewInsights(data, year) {
    const hasText = r => r.review && r.review.trim().length;
    const byYearMap = new Map();
    for (const r of data.reviews) {
      if (!hasText(r) || !r.watchedDate) continue;
      const y = yearOf(r.watchedDate);
      byYearMap.set(y, (byYearMap.get(y) || 0) + 1);
    }
    const byYear = [...byYearMap.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year);

    const scoped = data.reviews.filter(r => hasText(r) && (year === 'all' || yearOf(r.watchedDate) === year));
    if (!scoped.length) return { count: 0, totalWords: 0, avgWords: 0, longest: null, byYear };

    const wordCount = text => text.trim().split(/\s+/).length;
    let totalWords = 0, longestReview = null, longestWords = -1;
    for (const r of scoped) {
      const words = wordCount(r.review);
      totalWords += words;
      if (words > longestWords) { longestWords = words; longestReview = r; }
    }
    const text = longestReview.review.trim();
    const excerpt = text.length > 160 ? text.slice(0, 160) + '…' : text;
    const longest = { name: longestReview.name, year: longestReview.year, uri: longestReview.uri, words: longestWords, excerpt };
    return { count: scoped.length, totalWords, avgWords: round1(totalWords / scoped.length), longest, byYear };
  }

  function mostRewatched(filmIndex, n) {
    return [...filmIndex.values()]
      .filter(f => f.watchedDates.length >= 2)
      .sort((a, b) => b.watchedDates.length - a.watchedDates.length || a.name.localeCompare(b.name))
      .slice(0, n || 8)
      .map(f => ({ film: f, count: f.watchedDates.length }));
  }

  function tagCounts(entries) {
    const counts = new Map();
    for (const e of entries) {
      for (const t of (e.tags || [])) counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  function latestWatchedDate(data) {
    let latest = null;
    for (const e of data.diary) {
      if (e.watchedDate && (!latest || e.watchedDate > latest)) latest = e.watchedDate;
    }
    return latest;
  }

  function computeStats(data, filmIndex, tmdbMap, year, today) {
    const entries = entriesForYear(data, year);
    const films = uniqueFilms(entries, filmIndex);
    const effectiveToday = today || latestWatchedDate(data);
    return {
      year, profile: data.profile,
      diarySynthesized: !!data.diarySynthesized,
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
      taste: tasteDivergence(entries, filmIndex, tmdbMap),
      yearOverYear: yearOverYear(data, filmIndex, tmdbMap),
      calendar: calendar(entries, year),
      streaks: streaks(entries),
      watchlistAging: watchlistAging(data, effectiveToday),
      reviews: reviewInsights(data, year),
      mostRewatched: mostRewatched(filmIndex),
      tags: tagCounts(entries),
    };
  }

  const api = { availableYears, entriesForYear, headerTotals, byWeek, weekdayCounts, averages, milestones, ratingsHistogram, breakdown, decades, watchlistAdded, yearOf, round1, uniqueFilms, hoursWatched, rankBy, genreStats, countryStats, languageStats, castCrew, highsLows, worldMap, watchlistUnseen, computeStats, tasteDivergence, yearOverYear, calendar, streaks, watchlistAging, reviewInsights, mostRewatched, tagCounts };
  if (typeof module !== 'undefined') module.exports = api;
  global.LBStats = api;
})(typeof window !== 'undefined' ? window : globalThis);
