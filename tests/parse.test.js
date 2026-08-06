'use strict';
const { FILES } = require('./fixtures.js');
const { parseExport, buildFilmIndex, filmKey, selectExportFiles, synthesizeDiary } = require('../js/parse.js');

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

const FLAT_EXPORT_PATHS = [
  'diary.csv', 'watched.csv', 'ratings.csv', 'reviews.csv', 'watchlist.csv', 'profile.csv', 'comments.csv',
  'likes/films.csv', 'lists/top-10.csv', 'lists/2024.csv',
  // decoys that must NOT clobber the root files or be picked up as lists
  'likes/reviews.csv', 'likes/lists.csv', 'deleted/reviews.csv', 'deleted/diary.csv', 'orphaned/comments.csv', 'deleted/lists/x.csv',
];
const WANTED_KEYS = [
  'comments.csv', 'diary.csv', 'likes/films.csv', 'lists/2024.csv', 'lists/top-10.csv',
  'profile.csv', 'ratings.csv', 'reviews.csv', 'watched.csv', 'watchlist.csv',
];

test('selectExportFiles picks root files over likes/deleted/orphaned decoys', () => {
  const sel = selectExportFiles(FLAT_EXPORT_PATHS);
  eq(sel['reviews.csv'], 'reviews.csv');
  eq(sel['diary.csv'], 'diary.csv');
  eq(sel['comments.csv'], 'comments.csv');
  eq(sel['likes/films.csv'], 'likes/films.csv');
  eq(sel['lists/top-10.csv'], 'lists/top-10.csv');
  eq(sel['lists/2024.csv'], 'lists/2024.csv');
  eq(Object.keys(sel).sort(), WANTED_KEYS);
});

test('selectExportFiles tolerates a single top-level export folder prefix', () => {
  const paths = FLAT_EXPORT_PATHS.map(p => `myexport/${p}`);
  const sel = selectExportFiles(paths);
  eq(sel['reviews.csv'], 'myexport/reviews.csv');
  eq(sel['diary.csv'], 'myexport/diary.csv');
  eq(sel['comments.csv'], 'myexport/comments.csv');
  eq(sel['likes/films.csv'], 'myexport/likes/films.csv');
  eq(sel['lists/top-10.csv'], 'myexport/lists/top-10.csv');
  eq(sel['lists/2024.csv'], 'myexport/lists/2024.csv');
  eq(Object.keys(sel).sort(), WANTED_KEYS);
});

test('selectExportFiles returns an empty mapping for empty or non-matching input', () => {
  eq(selectExportFiles([]), {});
  eq(selectExportFiles(['README.txt', 'export-info.json', 'foo/bar.csv']), {});
});

test('synthesizeDiary builds entries from watched, attaching ratings by name+year', () => {
  const d = parseExport(FILES);
  const synth = synthesizeDiary(d);
  eq(synth.length, 3);
  eq(synth[0], {
    name: 'Parasite', year: 2019, uri: 'https://boxd.it/hTha', rating: 5,
    rewatch: false, tags: [], date: '2024-01-06', watchedDate: '2024-01-06',
  });
  eq(synth[1].name, 'Love, Simon');
  eq(synth[1].rating, null); // no ratings.csv entry for this film
  eq(synth[2].name, 'Juno');
  eq(synth[2].rating, 4);
});

test('synthesizeDiary skips watched rows with no usable date', () => {
  const data = {
    watched: [
      { name: 'A', year: 2020, uri: null, date: null },
      { name: 'B', year: 2021, uri: null, date: '2021-01-01' },
    ],
    ratings: [],
  };
  const synth = synthesizeDiary(data);
  eq(synth.length, 1);
  eq(synth[0].name, 'B');
});
