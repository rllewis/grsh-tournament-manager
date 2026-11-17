# Tests

Run everything: `npm test`

- `tests/js/*.test.mjs` — pure logic (roster balancing, dashboard numbers). `build.mjs` copies `src/lib/*.js` to `tests/js/.build/*.mjs` first so Node can import them. Needs Node 18+.
- `tests/php/*_test.php` — the REST classes run against a SQLite stand-in for WordPress (`harness.php`). Needs `php` with `pdo_sqlite`. Not a substitute for trying the page on a real site: MySQL-only behaviour (the GET_LOCK lock, ONLY_FULL_GROUP_BY) is not exercised.

Run one: `php tests/php/dashboard_test.php` or `node tests/js/dashboardEngine.test.mjs`.
