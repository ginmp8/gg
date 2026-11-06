# GG Analytics — brand and compatibility

**Public application name:** GG Analytics. **Monogram:** GG (uppercase).
**Tagline:** Local-first Git contribution and engineering analytics.

## Visual assets

- Canonical vector mark: [`assets/gg-desktop-icon.svg`](../assets/gg-desktop-icon.svg)
- Web application favicon: [`apps/web/app/icon.svg`](../apps/web/app/icon.svg)
- Header icon: [`apps/web/public/gg-mark.svg`](../apps/web/public/gg-mark.svg)
- Desktop icon images: derived from the SVG in the desktop packaging workflow
- README screenshots: `assets/app.png`, `assets/contributors.png`,
  and `assets/files.png`, captured from a running GG Analytics UI

The visual system uses a dark charcoal background, white geometric double-G
monogram, and a restrained mint-green underline. Reuse the same mark in all
platforms; do not restore the previous single-letter symbol.

## Runtime identity

| Component | New identity |
| --- | --- |
| Product and window title | GG Analytics |
| npm workspace scope | `@gg/*` |
| Root package | `gg-analytics` |
| Local CLI entry point | `scripts/gg-cli.ts` (`npm --silent run cli -- ...`) |
| Environment variables | `GG_*`, `NEXT_PUBLIC_GG_API_URL` |
| Tauri bundle identifier | `dev.gg.analytics` |
| New local database | `.gg/gg.sqlite` |
| Browser local preference keys | `gg.*` |

## Existing installation protection

The local data directory is never automatically moved, deleted or recreated as
a replacement for an existing populated installation. If no new database exists,
GG Analytics opens the existing `.gita/gita.sqlite` database and cache. Explicit
legacy `GITA_ROOT` / `GITA_DATA_DIR` paths also remain supported as fallbacks
when their GG equivalents are absent. A configured new path always wins.

Browser preferences under the previous `gita.*` keys are read as fallbacks to
new `gg.*` keys; subsequent writes use only the new keys. Reinstalling the app
under a different browser origin may still require transferring preferences.

Renaming the desktop bundle identifier can make operating systems treat this
as a separate installed app. Verify existing local files before uninstalling
older builds. Do not delete an installation's data directory to rename the app.

## GitHub repository and legal attribution

GitHub repository names and URLs are **not** changed by a branch commit. Until
an explicit repo-level rename, the valid URL remains
https://github.com/ginmp8/gita. See [NOTICE](../NOTICE.md) and [MIT LICENSE](../LICENSE)
for origin and copyright attribution.

## Reproducing screenshots

With Node 24 and Chromium installed (`npx playwright install chromium`), start
the local app using `npm run dev`, then run `npm run screenshots` from a
second terminal. This captures the real dashboard, Contributors, and Files &
focus views into the three PNG assets. The script creates a disposable local
Git fixture with synthetic authors, refreshes it and removes the fixture on
exit; never use sensitive repositories or hosted GitHub credentials.

The workflow [`screenshots.yml`](../.github/workflows/screenshots.yml) uses
Ubuntu 24.04 and refreshes the PNGs on `development` when application code or
the master icon changes. Screenshot-only commits do not retrigger the workflow.
Review visual changes before promoting the branch; generated screenshots
demonstrate sample data, not the user's own repositories.
