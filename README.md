# PS5 Release Board — self-updating

A single-page board of confirmed PS5 releases (rest of 2026 → 2027). Visitors pick games,
export an .ics calendar, and share their shortlist via link. Picks are stored per-browser.

## How auto-update works
- `games.json` — the catalog (seed). Committed to the repo.
- `netlify/functions/refresh.mjs` — runs **monthly** (1st, 12:00 UTC). It asks Claude (with web
  search) for newly announced PS5 games and date changes, merges them **without ever changing
  existing IDs**, and saves the result to Netlify Blobs. This protects everyone's saved picks.
- `netlify/functions/games.mjs` — what the page fetches; returns the live Blobs catalog, or the
  seed if Blobs is empty.
- The page auto-tags any past-dated game as **OUT NOW**, so it self-maintains as titles ship.

## One-time setup
1. Push this folder to a GitHub repo.
2. Netlify → **Add new site → Import an existing project** → pick the repo → Deploy.
3. Netlify → **Site settings → Environment variables** → add `ANTHROPIC_API_KEY` (your key from
   console.anthropic.com; the account needs credit/billing).
4. Re-deploy (Deploys → Trigger deploy) so the function picks up the key.

The site works immediately on the seed list. The catalog refreshes itself on the 1st of each month.

## Test the updater without waiting a month
In `refresh.mjs`, temporarily change the last line to fire a couple minutes ahead, e.g.
`export const config = { schedule: "*/5 * * * *" };` (every 5 min), push, watch
**Netlify → Logs / Functions → refresh**, then change it back to `"0 12 1 * *"` and push again.

## Notes
- If the search tool errors, update `SEARCH_TOOL` in `refresh.mjs` to the current
  `web_search_*` version from Anthropic's docs.
- Cost: ~a few cents per monthly run.
