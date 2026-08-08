(function (global) {
  'use strict';
  let current = null;

  function el(tag, attrs, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v);
    }
    for (const c of children) if (c != null) n.append(c);
    return n;
  }
  const body = id => { const b = document.querySelector(`${id} .body`) || document.querySelector(id); b.innerHTML = ''; return b; };
  const fmtDate = d => d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';

  function safeHref(uri) { return /^https?:\/\//i.test(uri || '') ? uri : '#'; }

  function posterCard(film, meta, subText) {
    const card = el('div', { class: 'poster' });
    const link = el('a', { href: safeHref(film.uri), target: '_blank', rel: 'noopener' });
    if (meta && meta.posterUrl) link.append(el('img', { src: meta.posterUrl, alt: film.name, loading: 'lazy' }));
    else link.append(el('div', { class: 'noimg', text: `${film.name} (${film.year || '?'})` }));
    card.append(link);
    if (subText) card.append(el('div', { class: 'sub', text: subText }));
    return card;
  }

  function stars(rating) { return rating == null ? '' : '★'.repeat(Math.floor(rating)) + (rating % 1 ? '½' : ''); }

  function renderHeader(stats) {
    const c = body('#s-header');
    c.append(el('div', { class: 'big-year', text: stats.year === 'all' ? 'All time' : String(stats.year) }));
    c.append(el('div', { class: 'byline muted', text: `${stats.profile.displayName || stats.profile.username}'s ${stats.year === 'all' ? 'life' : 'year'} in film` }));
    if (stats.diarySynthesized) {
      c.append(el('p', { class: 'muted', text: 'Dates come from when you marked films watched - this export has no diary entries.' }));
    }
    const totals = el('div', { class: 'totals' });
    const tile = (num, lbl) => el('div', {}, el('span', { class: 'num', text: String(num) }), el('span', { class: 'lbl', text: lbl }));
    totals.append(tile(stats.totals.diaryEntries, 'Diary entries'), tile(stats.totals.reviews, 'Reviews'),
      tile(stats.totals.likes, 'Likes'), tile(stats.hours, 'Hours'));
    c.append(totals);
  }

  function renderHighest(stats) {
    const c = body('#s-highest');
    const row = el('div', { class: 'poster-row' });
    for (const f of stats.highestRated) row.append(posterCard(f, mapGet(stats, f), stars(f.rating)));
    c.append(row);
    toggleSection('#s-highest', stats.highestRated.length);
  }

  function mapGet(stats, film) { return stats._tmdb ? stats._tmdb.get(film.key) : null; }

  function renderWeek(stats) {
    const c = body('#s-week');
    const w = 720, h = 90, n = stats.week.length, bw = w / n;
    const max = Math.max(1, ...stats.week);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h + 16}`);
    for (let i = 0; i < n; i++) {
      const bh = stats.week[i] / max * h;
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', i * bw + 1); r.setAttribute('y', h - bh);
      r.setAttribute('width', Math.max(1, bw - 3)); r.setAttribute('height', bh);
      r.setAttribute('class', 'wk');
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      t.textContent = `Week ${i + 1}: ${stats.week[i]} films`;
      r.append(t); svg.append(r);
    }
    const axis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    axis.setAttribute('x1', 0); axis.setAttribute('x2', w); axis.setAttribute('y1', h); axis.setAttribute('y2', h);
    axis.setAttribute('class', 'axis'); svg.append(axis);
    c.append(svg);
    const lbl = el('div', { class: 'muted' }); lbl.style.display = 'flex'; lbl.style.justifyContent = 'space-between';
    lbl.append(el('span', { text: 'Jan' }), el('span', { text: 'Dec' })); c.append(lbl);
  }

  function renderAverages(stats) {
    const c = body('#s-averages');
    const t = el('div', { class: 'totals' });
    const tile = (num, lbl) => el('div', {}, el('span', { class: 'num', text: String(num) }), el('span', { class: 'lbl', text: lbl }));
    t.append(tile(stats.averages.count, 'Films logged'), tile(stats.averages.perMonth, 'Average per month'), tile(stats.averages.perWeek, 'Average per week'));
    c.append(t);
    // weekday mini chart
    const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const max = Math.max(1, ...stats.weekdays);
    const wrap = el('div', { class: 'pies' });
    const chart = el('div');
    chart.style.cssText = 'display:flex;gap:4px;align-items:flex-end;height:70px;justify-content:center';
    stats.weekdays.forEach((v, i) => {
      const col = el('div');
      col.style.cssText = 'width:18px;text-align:center;font-size:10px;color:var(--muted)';
      const bar = el('div', { title: `${v} films` });
      bar.style.cssText = `height:${Math.max(2, v / max * 50)}px;background:var(--card);border-radius:2px;margin-bottom:2px`;
      if (v === max && v > 0) bar.style.background = 'var(--blue)';
      col.append(bar, days[i]);
      chart.append(col);
    });
    wrap.append(chart); c.append(wrap);
  }

  function renderMilestones(stats) {
    const c = body('#s-milestones');
    const row = el('div', { class: 'pies' });
    const block = (label, e) => {
      if (!e) return null;
      const k = global.LBParse.filmKey(e.name, e.year);
      const film = { key: k, name: e.name, year: e.year, uri: e.uri };
      const b = el('div', { class: 'pie-block' }, el('h4', { text: label }),
        posterCard(film, stats._tmdb && stats._tmdb.get(k), fmtDate(e.watchedDate)));
      return b;
    };
    row.append(block('First film', stats.milestones.first), block('Last film', stats.milestones.last));
    c.append(row);
  }

  function hbarList(container, rows, colorClass, valueKey) {
    const max = Math.max(1, ...rows.map(r => r[valueKey] || 0));
    for (const r of rows) {
      const row = el('div', { class: `hbar-row ${colorClass}` });
      const bar = el('div', { class: 'bar', title: r.films ? `${r.count} films` : '' });
      bar.style.width = `${(r[valueKey] || 0) / max * 100}%`;
      row.append(el('span', { text: r.label }), bar, el('span', { class: 'muted', text: String(r[valueKey]) }));
      container.append(row);
    }
  }

  function renderMeta(stats, mode) {
    const c = body('#s-meta');
    const cols = el('div', { class: 'meta-cols' });
    const specs = [[stats.genres, '', 'Genres'], [stats.countries, 'c-blue', 'Countries'], [stats.languages, 'c-orange', 'Languages']];
    let anyRows = false;
    for (const [s, color, title] of specs) {
      const rows = s[mode].slice(0, 10);
      if (!rows.length) continue; // e.g. Languages under Cinemeta, which supplies none
      anyRows = true;
      const col = el('div', {}, el('h4', { text: title, class: 'muted' }));
      hbarList(col, rows, color, mode === 'highestRated' ? 'avgRating' : 'count');
      cols.append(col);
    }
    c.append(cols);
    toggleSection('#s-meta', anyRows);
  }

  function toggleSection(id, hasContent) {
    document.querySelector(id).classList.toggle('hidden', !hasContent);
  }

  function pieSvg(a, b, colorA, colorB, size) {
    const s = size || 110, r = s / 2, total = a + b;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${s} ${s}`); svg.style.width = s + 'px';
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bg.setAttribute('cx', r); bg.setAttribute('cy', r); bg.setAttribute('r', r); bg.setAttribute('fill', colorB);
    svg.append(bg);
    if (total > 0 && a > 0) {
      const frac = a / total;
      if (frac >= 1) { bg.setAttribute('fill', colorA); return svg; }
      const ang = frac * 2 * Math.PI;
      const x = r + r * Math.sin(ang), y = r - r * Math.cos(ang);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${r},${r} L${r},0 A${r},${r} 0 ${ang > Math.PI ? 1 : 0} 1 ${x},${y} Z`);
      path.setAttribute('fill', colorA); svg.append(path);
    }
    return svg;
  }

  function renderBreakdown(stats) {
    const c = body('#s-breakdown');
    const pies = el('div', { class: 'pies' });
    const block = (title, a, b, la, lb) => {
      const w = el('div', { class: 'pie-block' });
      w.append(el('div', { class: 'muted', text: title }), pieSvg(a, b, '#00e054', '#2c3440'),
        el('div', { class: 'muted', text: `${la} ${a} · ${lb} ${b}` }));
      return w;
    };
    if (stats.breakdown.premieres) pies.append(block(`${stats.year} premieres`, stats.breakdown.premieres.yes, stats.breakdown.premieres.no, 'Premieres', 'Older'));
    else if (stats.decades.length) { // all-time: decades bar list instead of premieres pie
      const d = el('div', { class: 'pie-block' }, el('div', { class: 'muted', text: 'By decade' }));
      hbarList(d, stats.decades.map(x => ({ label: x.decade, count: x.count })), '', 'count');
      pies.append(d);
    }
    pies.append(block('Watches', stats.breakdown.rewatches.first, stats.breakdown.rewatches.re, 'First-time', 'Rewatch'));
    pies.append(block('Reviewed', stats.breakdown.reviewed.yes, stats.breakdown.reviewed.no, 'Reviewed', 'Not'));
    c.append(pies);
    // ratings histogram
    const hist = el('div', { class: 'pie-block' }, el('div', { class: 'muted', text: `${stats.year === 'all' ? 'All' : stats.year} ratings` }));
    const bars = el('div');
    bars.style.cssText = 'display:flex;gap:2px;align-items:flex-end;height:60px;justify-content:center;margin-top:8px';
    const max = Math.max(1, ...stats.histogram.buckets);
    stats.histogram.buckets.forEach((v, i) => {
      const b = el('div', { title: `${(i + 1) / 2}★: ${v}` });
      b.style.cssText = `width:14px;height:${Math.max(2, v / max * 56)}px;background:${v ? 'var(--green)' : 'var(--card)'};border-radius:1px`;
      bars.append(b);
    });
    hist.append(bars, el('div', { class: 'muted', text: '½★ → ★★★★★' }));
    c.append(el('div', { class: 'pies' }, hist));
  }

  function personBlock(p, sub) {
    const w = el('div', { class: 'person' });
    if (p.profileUrl) w.append(el('img', { src: p.profileUrl, alt: p.name, loading: 'lazy' }));
    else w.append(el('div', { class: 'noimg', text: p.name.split(' ').map(x => x[0]).join('') }));
    w.append(el('div', { text: p.name, class: 'muted' }), el('div', { class: 'sub muted', text: sub }));
    return w;
  }

  function renderCastCrew(stats, mode) {
    const c = body('#s-castcrew');
    const sortBy = mode === 'highestRated'
      ? (a, b) => (b.avgRating || 0) - (a.avgRating || 0) || b.count - a.count
      : (a, b) => b.count - a.count;
    const cast = stats.castCrew.cast.slice().sort(sortBy);
    const people = el('div', { class: 'people' });
    for (const p of cast.slice(0, 6)) people.append(personBlock(p, mode === 'highestRated' ? `★ ${p.avgRating}` : `${p.count} films`));
    c.append(people);
    const crew = el('div', { class: 'crew-cols' });
    for (const [job, list] of Object.entries(stats.castCrew.crew)) {
      const col = el('div', {}, el('h4', { text: job }));
      for (const p of list.slice().sort(sortBy).slice(0, 5))
        col.append(el('div', {}, el('span', { text: p.name }), el('span', { class: 'muted', text: mode === 'highestRated' ? ` ★${p.avgRating}` : ` ${p.count}` })));
      crew.append(col);
    }
    c.append(crew);
    toggleSection('#s-castcrew', cast.length + Object.keys(stats.castCrew.crew).length);
  }

  function renderHighsLows(stats) {
    const c = body('#s-highslows');
    const grid = el('div', { class: 'hl-grid' });
    const items = [
      ['Highest average', stats.highsLows.highestAvg, v => `★ ${round(v.value, 1)}`],
      ['Lowest average', stats.highsLows.lowestAvg, v => `★ ${round(v.value, 1)}`],
      ['Most popular', stats.highsLows.mostPopular, v => v.basis === 'popularity' ? `popularity ${round(v.value, 1)}` : `${v.value.toLocaleString()} votes`],
      ['Most obscure', stats.highsLows.mostObscure, v => v.basis === 'popularity' ? `popularity ${round(v.value, 1)}` : `${v.value.toLocaleString()} votes`],
      ['Newest', stats.highsLows.newest, v => fmtLong(v.value)],
      ['Oldest', stats.highsLows.oldest, v => fmtLong(v.value)],
      ['Longest', stats.highsLows.longest, v => `${v.value} minutes`],
      ['Shortest', stats.highsLows.shortest, v => `${v.value} minutes`],
    ];
    for (const [label, v, fmt] of items) {
      if (!v) continue;
      grid.append(el('div', { class: 'pie-block' }, el('div', { class: 'muted', text: label }),
        posterCard(v.film, v.meta, fmt(v))));
    }
    c.append(grid);
  }
  const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
  const fmtLong = d => d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  const fmtDateYear = d => d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';

  function renderCalendar(stats) {
    const c = body('#s-calendar');
    const cal = stats.calendar;
    toggleSection('#s-calendar', !!cal);
    if (!cal) return;
    const grid = el('div', { class: 'cal-grid' });
    for (const d of cal.days) {
      const cell = el('div', { class: 'cal-day', title: `${fmtDateYear(d.date)} - ${d.count} film${d.count === 1 ? '' : 's'}` });
      cell.style.gridColumn = d.week + 1;
      cell.style.gridRow = d.dow + 1;
      if (d.count > 0) cell.style.background = `rgba(0,224,84,${0.25 + 0.75 * d.count / cal.maxCount})`;
      grid.append(cell);
    }
    c.append(grid);
    const s = stats.streaks;
    const totals = el('div', { class: 'totals' });
    const tile = (num, lbl, note) => {
      const t = el('div', {}, el('span', { class: 'num', text: String(num) }), el('span', { class: 'lbl', text: lbl }));
      if (note) t.append(el('div', { class: 'note', text: note }));
      return t;
    };
    if (cal.activeDays != null) totals.append(tile(cal.activeDays, 'Days watched'));
    if (s.longest) totals.append(tile(s.longest.days, 'Longest streak', `${fmtDate(s.longest.start)} - ${fmtDate(s.longest.end)}`));
    if (s.biggestDay) totals.append(tile(s.biggestDay.count, 'Biggest day', fmtDateYear(s.biggestDay.date)));
    if (s.longestGap) totals.append(tile(s.longestGap.days, 'Longest gap', `${fmtDate(s.longestGap.start)} - ${fmtDate(s.longestGap.end)}`));
    c.append(totals);
  }

  function renderTaste(stats) {
    const c = body('#s-taste');
    const t = stats.taste;
    toggleSection('#s-taste', t.ratedCount > 0);
    if (!t.ratedCount) return;
    const headline = t.meanDelta > 0 ? `You rate ${t.meanDelta} points higher than TMDB users`
      : t.meanDelta < 0 ? `You rate ${Math.abs(t.meanDelta)} points lower than TMDB users`
      : 'You rate right in line with TMDB users';
    c.append(el('p', { text: headline }));
    c.append(el('p', { class: 'muted', text: `typical gap ${t.meanAbsDelta} points across ${t.ratedCount} rated films (TMDB's 10-point scale)` }));
    const posterRow = (title, rows) => {
      if (!rows.length) return;
      c.append(el('h4', { class: 'muted', text: title }));
      const row = el('div', { class: 'poster-row' });
      for (const r of rows) row.append(posterCard(r.film, r.meta, `${stars(r.film.rating)} vs ${r.meta.voteAverage.toFixed(1)}`));
      c.append(row);
    };
    posterRow('You liked these more than the crowd', t.youHigher);
    posterRow('The crowd liked these more', t.youLower);
  }

  function renderReviews(stats) {
    const c = body('#s-reviews');
    const r = stats.reviews;
    const hasContent = r.count > 0 || r.byYear.length > 0;
    toggleSection('#s-reviews', hasContent);
    if (!hasContent) return;
    const totals = el('div', { class: 'totals' });
    const tile = (num, lbl) => el('div', {}, el('span', { class: 'num', text: String(num) }), el('span', { class: 'lbl', text: lbl }));
    totals.append(tile(r.count, 'Reviews written'), tile(r.totalWords, 'Words'), tile(r.avgWords, 'Words per review'));
    c.append(totals);
    if (r.longest) {
      const card = el('div', { class: 'panel review-card' });
      const titleText = `Longest review - ${r.longest.name} (${r.longest.year})`;
      const h = el('h4', {});
      h.append(r.longest.uri ? el('a', { href: safeHref(r.longest.uri), target: '_blank', rel: 'noopener', text: titleText }) : document.createTextNode(titleText));
      card.append(h, el('p', { class: 'muted', text: `${r.longest.words} words` }),
        el('blockquote', {}, el('em', { text: r.longest.excerpt })));
      c.append(card);
    }
    if (r.byYear.length > 1) {
      c.append(el('h4', { class: 'muted', text: 'Reviews per year' }));
      const list = el('div');
      hbarList(list, r.byYear.map(y => ({ label: String(y.year), count: y.count })), '', 'count');
      c.append(list);
    }
  }

  function renderTrends(stats) {
    const c = body('#s-trends');
    const yoy = stats.yearOverYear;
    toggleSection('#s-trends', yoy.length > 0);
    if (!yoy.length) return;
    const maxFilms = Math.max(1, ...yoy.map(y => y.films));
    for (const y of yoy) {
      const on = stats.year !== 'all' && y.year === stats.year;
      const row = el('div', { class: `yoy-row${on ? ' on' : ''}` });
      const bar = el('div', { class: 'bar' });
      bar.style.width = `${y.films / maxFilms * 100}%`;
      const meta = `${y.films} films · ${y.hours}h${y.avgRating ? ` · ★${y.avgRating}` : ''}${y.topGenre ? ` · ${y.topGenre}` : ''}`;
      row.append(el('span', { class: 'yr', text: String(y.year) }), bar, el('span', { class: 'muted', text: meta }));
      c.append(row);
    }
    if (stats.mostRewatched.length) {
      c.append(el('h4', { class: 'muted', text: 'Most rewatched' }));
      const row = el('div', { class: 'poster-row' });
      for (const f of stats.mostRewatched) row.append(posterCard(f.film, mapGet(stats, f.film), `×${f.count}`));
      c.append(row);
    }
    if (stats.tags.length) {
      c.append(el('h4', { class: 'muted', text: 'Your tags' }));
      const list = el('div');
      hbarList(list, stats.tags.slice(0, 10).map(t => ({ label: t.tag, count: t.count })), '', 'count');
      c.append(list);
    }
  }

  function renderGrid(stats) {
    const c = body('#s-grid');
    const g = el('div', { class: 'grid' });
    for (const f of stats.filmsGrid) g.append(posterCard(f, mapGet(stats, f), null));
    c.append(g);
  }

  // The map is 1.2 MB of path data, so it is kept out of the page and pulled in the first
  // time a map is actually drawn. A script tag rather than fetch, so opening the page
  // straight off disk (file://) still works.
  let worldMapLoad = null;
  function loadWorldMap() {
    if (global.LBWorldMap) return Promise.resolve(global.LBWorldMap);
    if (!worldMapLoad) {
      worldMapLoad = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'js/worldmap.js';
        s.onload = () => global.LBWorldMap ? res(global.LBWorldMap) : rej(new Error('worldmap.js exported nothing'));
        s.onerror = () => rej(new Error('could not load js/worldmap.js'));
        document.head.append(s);
      });
    }
    return worldMapLoad;
  }

  function paintMap(svg, stats) {
    const max = Math.max(1, ...stats.map.values());
    for (const p of svg.querySelectorAll('path')) {
      const code = (p.id || '').toUpperCase();
      const count = stats.map.get(code) || 0;
      p.style.fill = count ? `rgba(0,224,84,${0.35 + 0.65 * count / max})` : '';
      const name = p.getAttribute('name') || p.getAttribute('aria-label') || code;
      p.querySelector('title') && p.querySelector('title').remove();
      if (count) {
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        t.textContent = `${name}: ${count} film${count > 1 ? 's' : ''}`;
        p.append(t);
      }
    }
  }

  function renderMap(stats) {
    const holder = document.getElementById('worldmap-holder');
    if (!holder) return;
    const drawn = document.getElementById('worldmap');
    if (drawn) return paintMap(drawn, stats);
    toggleSection('#s-map', true);
    loadWorldMap().then(m => {
      holder.innerHTML = m.svg;
      const svg = document.getElementById('worldmap');
      // Paint the year showing now - the user may have switched while this was loading.
      if (svg) paintMap(svg, current || stats);
    }).catch(() => toggleSection('#s-map', false));
  }

  function renderWatchlist(stats) {
    const c = body('#s-watchlist');
    c.append(el('p', { class: 'muted', text: `${stats.watchlist.added} films added to watchlist` }));
    if (stats.watchlist.unseen.length) {
      c.append(el('h4', { class: 'muted', text: 'Highly rated films you are yet to see' }));
      const row = el('div', { class: 'poster-row' });
      for (const f of stats.watchlist.unseen) row.append(posterCard(f, mapGet(stats, f), `★ ${round(mapGet(stats, f).voteAverage, 1)}`));
      c.append(row);
    }
    const aging = stats.watchlistAging;
    if (aging && aging.total > 0) {
      c.append(el('p', { class: 'muted', text: `${aging.total} films waiting${aging.medianDaysWaiting != null ? `, typically ${aging.medianDaysWaiting} days` : ''}` }));
      if (aging.oldest.length) {
        c.append(el('h4', { class: 'muted', text: 'Longest waiting' }));
        const list = el('div', { class: 'aging-list' });
        for (const f of aging.oldest) {
          const nameText = `${f.name} (${f.year})`;
          const row = el('div', { class: 'aging-row', title: `waiting ${f.daysWaiting} days` });
          row.append(f.uri ? el('a', { href: safeHref(f.uri), target: '_blank', rel: 'noopener', text: nameText }) : el('span', { text: nameText }));
          row.append(el('span', { class: 'muted', text: `added ${fmtDateYear(f.added)}` }));
          list.append(row);
        }
        c.append(list);
      }
    }
  }

  function renderUnmatched(stats) {
    const c = body('#s-unmatched');
    c.textContent = stats.unmatched.map(f => `${f.name} (${f.year})`).join(' · ');
    toggleSection('#s-unmatched', stats.unmatched.length);
  }

  function renderAll(stats) {
    current = stats;
    renderHeader(stats); renderHighest(stats); renderWeek(stats); renderAverages(stats);
    renderCalendar(stats);
    renderMilestones(stats); renderMeta(stats, modeOf('meta')); renderBreakdown(stats);
    renderTaste(stats); renderReviews(stats);
    renderCastCrew(stats, modeOf('castcrew')); renderHighsLows(stats);
    renderTrends(stats);
    renderGrid(stats);
    renderMap(stats); renderWatchlist(stats); renderUnmatched(stats);
  }
  function modeOf(name) {
    const on = document.querySelector(`.toggle[data-for="${name}"] button.on`);
    return on ? on.dataset.mode : 'mostWatched';
  }
  // toggle wiring - once, at load
  if (typeof document !== 'undefined') {
    document.addEventListener('click', ev => {
      const btn = ev.target.closest('.toggle button');
      if (!btn || !current) return;
      btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
      const which = btn.parentElement.dataset.for;
      if (which === 'meta') renderMeta(current, btn.dataset.mode);
      if (which === 'castcrew') renderCastCrew(current, btn.dataset.mode);
    });
  }

  const api = { el, posterCard, hbarList, stars, fmtDate, body, mapGet, toggleSection, safeHref,
    renderHeader, renderHighest, renderWeek, renderAverages, renderMilestones, renderMeta,
    renderAll, renderBreakdown, renderCastCrew, renderHighsLows, renderGrid, renderMap, renderWatchlist, renderUnmatched, pieSvg,
    renderCalendar, renderTaste, renderReviews, renderTrends,
    _state: () => current, _setState: s => { current = s; } };
  if (typeof module !== 'undefined') module.exports = api;
  global.LBRender = api;
})(typeof window !== 'undefined' ? window : globalThis);
