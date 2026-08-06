# Year in Film

A free, self-hosted version of Letterboxd's "Year in Film" stats page. Drop in your
own Letterboxd data export and get the whole thing back - posters, charts, genres,
cast, world map - without a Pro subscription.

Everything runs in your browser. Your export never leaves your machine; only film
titles are sent out, to look up posters and genres.

## Use it

1. Export your data from [letterboxd.com/settings/data](https://letterboxd.com/settings/data/).
2. Open the site and drop the zip on the page.
3. Wait for the one-time film lookup (a minute or two for a few hundred films),
   then browse. Results are cached in your browser, so it is instant next time.

No account, no API key, no install.

## What it shows

Per year, or all-time:

- Diary entries, reviews, likes and hours watched
- Highest rated films, films-per-week, weekday habits, first and last film
- A watch calendar heatmap with streaks, biggest day and longest gap
- Genres, countries and languages, sortable by most watched or highest rated
- Breakdown pies (premieres vs older, rewatches, reviewed) and a ratings histogram
- Cast and crew you watch most
- Highs and lows: highest and lowest rated, most popular and most obscure,
  newest, oldest, longest, shortest
- Taste vs the crowd - where your ratings diverge from the average
- Year-by-year trends, most rewatched films and your diary tags
- Review stats, watchlist aging, world map, and every poster you logged

## Optional: TMDB for more detail

By default film data comes from [Cinemeta](https://www.stremio.com/), which needs no
key. If you supply a free [TMDB](https://www.themoviedb.org/settings/api) API key
(v3 auth) in the setup panel, lookups use TMDB instead, which adds spoken languages,
full cast and crew (composers, cinematographers, producers), and more precise country
data for the world map.

## Run it locally

It is a static site - no build step, no dependencies to install.

```
python -m http.server 8000     # or any static file server
```

Then open `http://localhost:8000`.

## Development

- `node tests/run.js` - unit tests (no framework, no install)
- `dev.html` - renders fixture data without a zip or network access
- `js/parse.js` reads the export CSVs, `js/stats.js` computes every statistic as
  pure functions, `js/cinemeta.js` and `js/tmdb.js` fetch metadata behind one
  interface, `js/render.js` paints the DOM, `js/main.js` wires it together.

## Credits

Film metadata from [Cinemeta](https://www.stremio.com/) and
[TMDB](https://www.themoviedb.org/). This product uses the TMDB API but is not
endorsed or certified by TMDB. World map from
[@svg-maps/world](https://github.com/VictorCazanave/svg-maps) (MIT).

Not affiliated with Letterboxd.
