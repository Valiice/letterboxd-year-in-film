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
// TMDB metadata fixture keyed by filmKey - used by stats tests and dev.html
const META = {
  'parasite|2019': { id: 496243, title: 'Parasite', runtime: 133, genres: ['Comedy', 'Thriller', 'Drama'], countries: [{ code: 'KR', name: 'South Korea' }], languages: ['Korean'], releaseDate: '2019-05-30', posterUrl: 'https://image.tmdb.org/t/p/w342/p1.jpg', popularity: 90, voteAverage: 8.5, voteCount: 17000, cast: [{ name: 'Song Kang-ho', profileUrl: 'https://image.tmdb.org/t/p/w185/s.jpg' }], crew: [{ name: 'Bong Joon Ho', job: 'Director' }] },
  'love, simon|2018': { id: 449176, title: 'Love, Simon', runtime: 110, genres: ['Comedy', 'Romance', 'Drama'], countries: [{ code: 'US', name: 'United States of America' }], languages: ['English'], releaseDate: '2018-02-16', posterUrl: 'https://image.tmdb.org/t/p/w342/p2.jpg', popularity: 40, voteAverage: 8.0, voteCount: 6000, cast: [{ name: 'Nick Robinson', profileUrl: 'https://image.tmdb.org/t/p/w185/n.jpg' }], crew: [{ name: 'Greg Berlanti', job: 'Director' }] },
  'juno|2007': { id: 7326, title: 'Juno', runtime: 96, genres: ['Comedy', 'Drama'], countries: [{ code: 'US', name: 'United States of America' }], languages: ['English'], releaseDate: '2007-12-05', posterUrl: 'https://image.tmdb.org/t/p/w342/p3.jpg', popularity: 25, voteAverage: 7.2, voteCount: 7000, cast: [{ name: 'Elliot Page', profileUrl: 'https://image.tmdb.org/t/p/w185/e.jpg' }], crew: [{ name: 'Jason Reitman', job: 'Director' }] },
  'dune: part two|2024': { id: 693134, title: 'Dune: Part Two', runtime: 167, genres: ['Science Fiction', 'Adventure'], countries: [{ code: 'US', name: 'United States of America' }], languages: ['English'], releaseDate: '2024-02-27', posterUrl: 'https://image.tmdb.org/t/p/w342/p4.jpg', popularity: 300, voteAverage: 8.2, voteCount: 5000, cast: [], crew: [] },
};
module.exports = { FILES, META };
