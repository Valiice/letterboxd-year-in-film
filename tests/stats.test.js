'use strict';
const { FILES, META } = require('./fixtures.js');
const { parseExport, buildFilmIndex, synthesizeDiary } = require('../js/parse.js');
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

test('hoursWatched counts rewatches', () => {
  const { filmKey } = require('../js/parse.js');
  const tmdbMap = new Map(Object.entries(META));
  const e24 = S.entriesForYear(data, 2024);
  // Parasite 133×2 + Love, Simon 110 = 376 min
  eq(S.hoursWatched(e24, tmdbMap), 6.3);
});

test('genreStats most watched', () => {
  const { filmKey } = require('../js/parse.js');
  const tmdbMap = new Map(Object.entries(META));
  const e24 = S.entriesForYear(data, 2024);
  const g = S.genreStats(e24, idx, tmdbMap);
  eq(g.mostWatched[0], { label: 'Comedy', code: undefined, count: 2, avgRating: 4.3, films: ['parasite|2019', 'love, simon|2018'] });
});

test('countryStats carries codes', () => {
  const { filmKey } = require('../js/parse.js');
  const tmdbMap = new Map(Object.entries(META));
  const e24 = S.entriesForYear(data, 2024);
  const c = S.countryStats(e24, idx, tmdbMap);
  eq(c.mostWatched.map(r => r.code), ['KR', 'US']);
});

test('highsLows', () => {
  const { filmKey } = require('../js/parse.js');
  const tmdbMap = new Map(Object.entries(META));
  const e24 = S.entriesForYear(data, 2024);
  const h = S.highsLows(e24, idx, tmdbMap);
  eq(h.highestAvg.meta.title, 'Parasite');
  eq(h.longest.value, 133);
  eq(h.shortest.meta.title, 'Love, Simon');
  eq(h.newest.meta.title, 'Parasite');
  eq(h.oldest.meta.title, 'Love, Simon');
  eq(h.mostObscure.meta.title, 'Love, Simon');
});

test('highsLows basis is votes when voteCount is present', () => {
  const tmdbMap = new Map(Object.entries(META));
  const e24 = S.entriesForYear(data, 2024);
  const h = S.highsLows(e24, idx, tmdbMap);
  eq(h.mostPopular.basis, 'votes');
  eq(h.mostObscure.basis, 'votes');
});

test('highsLows falls back to popularity when voteCount is null', () => {
  const entries = [{ name: 'Film A', year: 2020, rating: null }, { name: 'Film B', year: 2020, rating: null }];
  const filmIndex = new Map([
    ['film a|2020', { key: 'film a|2020', name: 'Film A' }],
    ['film b|2020', { key: 'film b|2020', name: 'Film B' }],
  ]);
  const tmdbMap = new Map([
    ['film a|2020', { voteCount: null, popularity: 80 }],
    ['film b|2020', { voteCount: null, popularity: 20 }],
  ]);
  const h = S.highsLows(entries, filmIndex, tmdbMap);
  eq(h.mostPopular.film.name, 'Film A');
  eq(h.mostPopular.value, 80);
  eq(h.mostPopular.basis, 'popularity');
  eq(h.mostObscure.film.name, 'Film B');
  eq(h.mostObscure.value, 20);
  eq(h.mostObscure.basis, 'popularity');
});

test('castCrew carries profileUrl through', () => {
  // castCrew only keeps cast members appearing in >=2 unique films, so use
  // two synthetic films sharing an actor rather than the shared fixtures.
  const entries = [{ name: 'Film A', year: 2020, rating: null }, { name: 'Film B', year: 2020, rating: null }];
  const filmIndex = new Map([
    ['film a|2020', { key: 'film a|2020', name: 'Film A' }],
    ['film b|2020', { key: 'film b|2020', name: 'Film B' }],
  ]);
  const tmdbMap = new Map([
    ['film a|2020', { cast: [{ name: 'Actor X', profileUrl: 'https://image.tmdb.org/t/p/w185/x.jpg' }], crew: [] }],
    ['film b|2020', { cast: [{ name: 'Actor X', profileUrl: 'https://image.tmdb.org/t/p/w185/x.jpg' }], crew: [] }],
  ]);
  const cc = S.castCrew(entries, filmIndex, tmdbMap);
  eq(cc.cast[0].name, 'Actor X');
  eq(cc.cast[0].profileUrl, 'https://image.tmdb.org/t/p/w185/x.jpg');
});

test('worldMap counts', () => {
  const { filmKey } = require('../js/parse.js');
  const tmdbMap = new Map(Object.entries(META));
  const e24 = S.entriesForYear(data, 2024);
  const m = S.worldMap(e24, idx, tmdbMap);
  eq([...m.entries()].sort(), [['KR', 1], ['US', 1]]);
});

test('watchlistUnseen', () => {
  const { filmKey } = require('../js/parse.js');
  const tmdbMap = new Map(Object.entries(META));
  const u = S.watchlistUnseen(data, idx, tmdbMap);
  eq(u.map(f => f.name), ['Dune: Part Two']);
});

test('computeStats assembles and reports unmatched', () => {
  const { filmKey } = require('../js/parse.js');
  const tmdbMap = new Map(Object.entries(META));
  const partial = new Map(tmdbMap);
  partial.set('juno|2007', null);
  const s = S.computeStats(data, idx, partial, 'all');
  eq(s.unmatched.map(f => f.name), ['Juno']);
  eq(s.filmsGrid.length, 3);
  eq(s.highestRated[0].name, 'Parasite');
  ok(s.decades.length === 2);
});

test('tasteDivergence for 2024', () => {
  const tmdbMap = new Map(Object.entries(META));
  const e24 = S.entriesForYear(data, 2024);
  const t = S.tasteDivergence(e24, idx, tmdbMap);
  eq(t.ratedCount, 2);
  eq(t.meanDelta, 0.3);
  eq(t.youHigher[0].film.name, 'Parasite');
  eq(t.youHigher[0].delta, 1.5);
  eq(t.youLower[0].film.name, 'Love, Simon');
  eq(t.youLower[0].delta, -1);
});

test('yearOverYear rows ascending', () => {
  const tmdbMap = new Map(Object.entries(META));
  const rows = S.yearOverYear(data, idx, tmdbMap);
  eq(rows.map(r => r.year), [2023, 2024]);
  const y2024 = rows[1];
  eq(y2024.films, 3);
  eq(y2024.rewatches, 1);
  eq(y2024.avgRating, 4.5);
});

test('calendar for 2024', () => {
  const e24 = S.entriesForYear(data, 2024);
  const c = S.calendar(e24, 2024);
  eq(c.days.length, 366);
  eq(c.total, 3);
  eq(c.activeDays, 3);
  eq(c.maxCount, 1);
  const jan5 = c.days.find(d => d.date === '2024-01-05');
  eq(jan5.count, 1);
  eq(jan5.dow, 4);
  eq(S.calendar(S.entriesForYear(data, 'all'), 'all'), null);
});

test('streaks for 2024', () => {
  const e24 = S.entriesForYear(data, 2024);
  const s = S.streaks(e24);
  eq(s.activeDays, 3);
  eq(s.longest.days, 1);
  eq(s.biggestDay.date, '2024-01-05');
  // Brief said longestGap.days = 55 (the Jan5->Mar1 gap), but the spec defines
  // longestGap as the LARGEST empty-day span between consecutive active days.
  // Active dates are 2024-01-05, 2024-03-01, 2024-07-14: the Jan5->Mar1 gap is
  // 55 empty days, but the Mar1->Jul14 gap is 134 empty days, which is larger.
  // 134 is the correct longestGap per the spec's own definition.
  eq(s.longestGap.days, 134);
  eq(s.longestGap.start, '2024-03-01');
  eq(s.longestGap.end, '2024-07-14');
});

test('watchlistAging', () => {
  const w = S.watchlistAging(data, '2024-03-01');
  eq(w.total, 1);
  eq(w.oldest[0].daysWaiting, 29);
  eq(w.medianDaysWaiting, 29);
  eq(w.addedByYear, [{ year: 2024, count: 1 }]);
});

test('reviewInsights for 2024', () => {
  const r = S.reviewInsights(data, 2024);
  eq(r.count, 1);
  eq(r.totalWords, 1);
  eq(r.longest.name, 'Parasite');
  eq(r.longest.excerpt, 'Masterpiece.');
  eq(r.byYear, [{ year: 2024, count: 1 }]);
});

test('mostRewatched', () => {
  const m = S.mostRewatched(idx);
  eq(m[0].film.name, 'Parasite');
  eq(m[0].count, 2);
});

test('tagCounts for 2024', () => {
  const e24 = S.entriesForYear(data, 2024);
  eq(S.tagCounts(e24), [{ tag: 'cinema', count: 1 }, { tag: 'date night', count: 1 }]);
});

test('computeStats over a synthesized diary reports the real film count, not zero', () => {
  const noDiaryFiles = { ...FILES, 'diary.csv': '' };
  const d = parseExport(noDiaryFiles);
  eq(d.diary.length, 0);
  d.diary = synthesizeDiary(d);
  d.diarySynthesized = true;
  const synthIdx = buildFilmIndex(d);
  const tmdbMap = new Map(Object.entries(META));
  const s = S.computeStats(d, synthIdx, tmdbMap, 'all');
  eq(s.diarySynthesized, true);
  eq(s.totals.diaryEntries, 3);
  eq(s.filmsGrid.length, 3);
});

test('splitFilmsByPriority puts the year films in priority, rest elsewhere', () => {
  const { priority, rest } = S.splitFilmsByPriority(data, idx, 2024);
  eq(priority.map(f => f.name).sort(), ['Love, Simon', 'Parasite']);
  eq(rest.map(f => f.name).sort(), ['Dune: Part Two', 'Juno']);
});

test('splitFilmsByPriority has no film in both lists', () => {
  const { priority, rest } = S.splitFilmsByPriority(data, idx, 2024);
  const priorityKeys = new Set(priority.map(f => f.key));
  ok(rest.every(f => !priorityKeys.has(f.key)));
});

test("splitFilmsByPriority puts everything in priority for 'all'", () => {
  const { priority, rest } = S.splitFilmsByPriority(data, idx, 'all');
  eq(rest, []);
  eq(priority.map(f => f.name).sort(), [...idx.values()].filter(f => f.watched || f.inWatchlist).map(f => f.name).sort());
});

test('splitFilmsByPriority union equals the watched||inWatchlist selection', () => {
  const expected = [...idx.values()].filter(f => f.watched || f.inWatchlist).map(f => f.key).sort();
  const { priority, rest } = S.splitFilmsByPriority(data, idx, 2024);
  eq([...priority, ...rest].map(f => f.key).sort(), expected);
});

test('computeStats exposes new keys', () => {
  const tmdbMap = new Map(Object.entries(META));
  const s = S.computeStats(data, idx, tmdbMap, 2024, '2024-03-01');
  ok('taste' in s && 'yearOverYear' in s && 'calendar' in s && 'streaks' in s &&
    'watchlistAging' in s && 'reviews' in s && 'mostRewatched' in s && 'tags' in s);
  eq(s.taste.ratedCount, 2);
  eq(s.watchlistAging.total, 1);
});
