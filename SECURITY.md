# Security

## Known advisories, accepted as not applicable

### GHSA-qwww-vcr4-c8h2 — react-router RSC Mode CSRF Bypass

`npm audit` flags `react-router`/`react-router-dom` (installed: `7.18.0`) as
high severity for [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2).

This advisory is specific to React Router's RSC (React Server Components)
mode. This app is a client-side Vite SPA using `BrowserRouter` — it does not
import `react-router/rsc` or use RSC mode anywhere, so the vulnerable code
path is never exercised.

No patched release exists in the `7.12.0 - 8.2.0` vulnerable range as of this
writing; the only available `npm audit fix --force` path is a downgrade to
`7.11.0`, which would drop several minor versions of unrelated bugfixes for
no functional security benefit here. Re-evaluate once upstream ships a
patched `7.x`/`8.x` release.
