'use strict';
const { map } = require('../js/pool.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  {
    // Out-of-order completion (earlier items take longer) must not scramble result order.
    const items = [0, 1, 2, 3, 4];
    const delays = [50, 40, 30, 20, 10]; // item 4 finishes first, item 0 finishes last
    const out = await map(items, 5, async (item, i) => {
      await sleep(delays[i]);
      return item * 2;
    });
    if (JSON.stringify(out) !== JSON.stringify([0, 2, 4, 6, 8])) throw new Error('order not preserved: ' + JSON.stringify(out));
    console.log('  ok   preserves input order despite out-of-order completion');
  }
  {
    // No more than `concurrency` workers run at once.
    const items = Array.from({ length: 9 }, (_, i) => i);
    let live = 0, max = 0;
    const out = await map(items, 3, async item => {
      live++;
      max = Math.max(max, live);
      await sleep(15);
      live--;
      return item;
    });
    if (max > 3) throw new Error('exceeded concurrency limit: max was ' + max);
    if (max < 3) throw new Error('never reached full concurrency: max was ' + max);
    if (JSON.stringify(out) !== JSON.stringify(items)) throw new Error('results wrong: ' + JSON.stringify(out));
    console.log('  ok   never runs more than `concurrency` workers simultaneously');
  }
  {
    // A throwing worker rejects the whole map.
    const items = [1, 2, 3];
    let threw = false;
    try {
      await map(items, 3, async item => {
        if (item === 2) throw new Error('boom');
        await sleep(5);
        return item;
      });
    } catch (e) {
      threw = e.message === 'boom';
    }
    if (!threw) throw new Error('expected map to reject with worker error');
    console.log('  ok   a throwing worker rejects the map');
  }
  {
    // Empty input resolves to [].
    const out = await map([], 6, async () => { throw new Error('should never be called'); });
    if (JSON.stringify(out) !== '[]') throw new Error('expected empty array, got ' + JSON.stringify(out));
    console.log('  ok   empty input resolves to []');
  }
  {
    // concurrency is clamped to at least 1 and at most items.length.
    const items = [1, 2];
    let live = 0, max = 0;
    await map(items, 0, async item => {
      live++; max = Math.max(max, live);
      await sleep(5);
      live--;
      return item;
    });
    if (max < 1) throw new Error('concurrency should be clamped to at least 1');
    const items2 = [1, 2, 3];
    live = 0; max = 0;
    await map(items2, 99, async item => {
      live++; max = Math.max(max, live);
      await sleep(5);
      live--;
      return item;
    });
    if (max > items2.length) throw new Error('concurrency should be clamped to at most items.length, got max ' + max);
    console.log('  ok   concurrency clamped to [1, items.length]');
  }
})().catch(e => { console.log('  FAIL pool async: ' + e.message); process.exitCode = 1; });
