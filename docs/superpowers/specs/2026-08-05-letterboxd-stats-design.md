# Letterboxd Year-in-Film Stats Site — Design

**Date:** 2026-08-05
**Status:** Approved by user

## Goal

Recreate the Letterboxd Pro "Year in Film" stats page (e.g. `letterboxd.com/<user>/year/2024/`) as a free, static, client-side website that works with any Letterboxd export zip. No paid Letterboxd Pro, no server, no install — hosted on GitHub Pages, usable by anyone in a browser.

## Constraints & decisions

- **Pure static site** (HTML/CSS/vanilla JS, no build step, no framework). Chosen over a Rust/C# local app so people without anything installed can open it. All processing happens in the browser.
- **Metadata enrichment via TMDB API** (user-supplied free API key). The Letterboxd export contains only date/name/year/rating/rewatch/tags — no genres, countries, languages, runtimes, posters, cast, or crew. TMDB fills that gap.
- **Scope: full parity** with the reference page except Letterboxd-proprietary "Themes & Nanogenres", which cannot be reconstructed.
- **Views: each diary year + "All time"** via a dropdown.
- Vendored libraries only (JSZip for zip extraction, PapaParse for CSV) — no CDN dependencies, so the page also works offline/from `file://` (except TMDB fetches, which need network).

## Input data (Letterboxd export zip)

Root CSVs: `diary.csv` (Date, Name, Year, Letterboxd URI, Rating, Rewatch, Tags, Watched Date), `watched.csv`, `ratings.csv`, `reviews.csv`, `watchlist.csv`, `comments.csv`, `profile.csv` (username, given name, pronoun, favorite films). Folders: `likes/` (films, reviews, lists), `lists/` (one CSV per list), `deleted/`, `orphaned/` (ignored).

Diary is the primary source for per-year stats (uses **Watched Date**). `watched.csv` is the all-time film log. Rewatch flag distinguishes watches vs re-watches. Ratings histogram from diary ratings (fallback `ratings.csv` for all-time).

## Architecture

```
index.html          — single page, all sections
css/style.css       — Letterboxd dark theme (near-black bg, green/blue/orange accents)
js/
  main.js           — orchestration: file drop → parse → enrich → compute → render
  parse.js          — unzip + CSV parsing into a normalized data model
  tmdb.js           — TMDB client: search + details, rate limiting, IndexedDB cache
  stats.js          — pure functions: (films, year) → stats objects
  render.js         — DOM/SVG rendering of every section
vendor/             — jszip.min.js, papaparse.min.js, world map SVG (TopoJSON-derived)
```

Data flow: **drop zip → parse.js → film index (unique title+year) → tmdb.js enriches with progress bar → stats.js computes for selected year → render.js paints**. Year dropdown re-runs only compute+render (cheap, all in memory).

### TMDB enrichment

- Per unique film: `GET /search/movie?query=<name>&year=<year>` → best match → `GET /movie/<id>?append_to_response=credits` (genres, production_countries, spoken_languages, runtime, poster_path, popularity, vote_average, vote_count, release_date, cast, crew).
- Client-side rate limit ≈ 4 req/s (TMDB allows ~50/s but stay conservative). ~1,200 unique films ≈ a few minutes on first run, with a progress bar and film-by-film status.
- **Cache:** IndexedDB keyed by `title|year`, stores full enriched record. New zips only fetch films not already cached. Cache never expires (film metadata is stable); a "clear cache" button in settings.
- **API key:** entered once, stored in localStorage. Link + instructions to TMDB signup shown inline.
- **Unmatched films:** counted, listed in a collapsible panel, included in export-only stats (counts, ratings, streaks, first/last) but absent from metadata-based stats (genres, hours, map, cast). Optional manual re-search by typing an alternate title.
- Posters/profile images loaded lazily from `image.tmdb.org` (w185/w342 sizes).

## Page sections (top to bottom)

1. **Header** — big year title, "<name>'s year in film", totals row: diary entries, reviews, likes, hours watched (sum of runtimes incl. rewatches).
2. **Highest rated films** — top ~8 posters by user rating (ties broken by TMDB average).
3. **By week** — 52-bar chart of films logged per week.
4. **Averages** — films logged, average per month, average per week, plus per-weekday mini bar chart.
5. **Milestones** — first and last film of the year with posters and dates.
6. **Genres, countries & languages** — horizontal bar lists with "Most watched / Highest rated" toggle.
7. **Breakdown** — pie charts: year premieres vs older, watches vs re-watches, reviewed vs not; ratings histogram (half-star buckets); watchlist tile (added vs watched-from-watchlist).
8. **Cast & crew** — most-watched actors (circular photos, film counts) and crew by department (director, writer, producer, composer, cinematographer…), each with most-watched/highest-rated toggle.
9. **Highs and lows** — highest/lowest TMDB average, most popular/most obscure (vote_count), newest/oldest (release date), longest/shortest (runtime).
10. **Films watched grid** — every poster for the year, linking to Letterboxd via the export URI.
11. **World map** — SVG world map, production countries shaded green by count, hover tooltip.
12. **Watchlist** — count added this year; highly-rated films still unseen (from watchlist, sorted by TMDB rating).

"All time" view: same sections aggregated over the full diary; "premieres" pie becomes decade breakdown.

## Error handling

- Invalid/missing zip entries: tolerate absent CSVs (older exports differ), show what's computable.
- TMDB errors: 401 → re-prompt for key; 429/network → exponential backoff and resume; enrichment is resumable since each film persists to cache on arrival.
- Malformed CSV rows skipped with a console warning, never a crash.

## Testing

- `stats.js` and CSV parsing are pure functions → unit-testable with a tiny fixture dataset (run via a `tests.html` page or node, no framework lock-in).
- Manual end-to-end check with the real export zip (Alex's, 1,231 films) plus a second zip to verify the cache-reuse path.

## Out of scope

Themes & Nanogenres, likes-received/comments-received (not in export), diary entry editing, multi-user comparison, server-side anything.
