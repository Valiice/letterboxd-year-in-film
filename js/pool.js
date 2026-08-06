(function (global) {
  'use strict';

  // Runs at most `concurrency` worker(item, index) calls at once. Results are
  // returned in input order regardless of completion order. If a worker
  // throws, the whole map rejects with that error and no new work is started
  // (work already in flight is left to finish on its own).
  function map(items, concurrency, worker) {
    return new Promise((resolve, reject) => {
      const total = items.length;
      if (total === 0) { resolve([]); return; }
      const limit = Math.max(1, Math.min(concurrency, total));
      const results = new Array(total);
      let nextIndex = 0;
      let completed = 0;
      let settled = false;

      function runNext() {
        if (settled || nextIndex >= total) return;
        const i = nextIndex++;
        Promise.resolve()
          .then(() => worker(items[i], i))
          .then(result => {
            if (settled) return;
            results[i] = result;
            completed++;
            if (completed === total) { settled = true; resolve(results); }
            else runNext();
          })
          .catch(err => {
            if (settled) return;
            settled = true;
            reject(err);
          });
      }

      for (let k = 0; k < limit; k++) runNext();
    });
  }

  const api = { map };
  if (typeof module !== 'undefined') module.exports = api;
  global.LBPool = api;
})(typeof window !== 'undefined' ? window : globalThis);
