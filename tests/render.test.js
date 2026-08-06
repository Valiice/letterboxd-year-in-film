'use strict';
const R = require('../js/render.js');

test('safeHref allows http/https URIs and neutralizes everything else', () => {
  eq(R.safeHref('https://boxd.it/abc'), 'https://boxd.it/abc');
  eq(R.safeHref('http://boxd.it/abc'), 'http://boxd.it/abc');
  eq(R.safeHref('javascript:alert(1)'), '#');
  eq(R.safeHref('data:text/html,<script>alert(1)</script>'), '#');
  eq(R.safeHref(null), '#');
  eq(R.safeHref(undefined), '#');
  eq(R.safeHref(''), '#');
});
