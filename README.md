# Rwanda Coffee Traceability (NAEB)

Static app on GitHub Pages, no build step. **Portal is the only sign-in and the home of real farms, farmers and washing stations. Supabase stores chain records only.**

- Site: https://jcntirenganya.github.io/eudr-rwanda-traceability/
- Repo: https://github.com/JCNtirenganya/eudr-rwanda-traceability
- Local: `python -m http.server` → http://localhost:8000
- Deploy: push to `main`; `.github/workflows/pages.yml` publishes the site.

## Current state

`CFG.DEMO_CHAIN` in `src/config.js` is **temporarily `true`**. Portal sign-in is required and real farms, farmers and CWS are read live from Portal. Only the seven chain tables are indicative and generated in the browser; nothing chain-related is saved. A banner says so.

Set `CFG.DEMO_CHAIN` to `false` after the Supabase steps below. Sign-in and Portal reads stay the same; chain records then go to Supabase.

If sign-in fails, the message shows Portal's own detail. Use the exact Portal username (not an email unless that is the username).

## Architecture

```
GitHub Pages (static app)
  ├── ArcGIS Portal ── only login; real farm polygons, farmers and CWS
  │                    personal fields stay here; read-only National-ID lookup
  └── Supabase Edge Function "api"
        ├── checks the Portal token via community/self
        └── reads/writes seven chain tables in Postgres
```

No Supabase Auth, no second password, no farm/CWS mirror and no sync job. The browser sends the Portal token it already has to one `api` function; the function validates it before touching Postgres. The service key never reaches the browser.

## What is stored where

| Data | Home |
|---|---|
| Farmer name, phone, National ID | ArcGIS Portal only |
| Farm polygons, land use, planting years, yields | ArcGIS Portal only |
| Washing station details | ArcGIS Portal only |
| Cherry deliveries, lots, lot–delivery links | Supabase |
| Exporters, importers, export batches, batch–lot links | Supabase |
| Demo/indicative rows | Browser only; never saved |

`models/seed.json` defines exactly seven chain models. The read-only questionnaire finds a farmer by National ID in the Portal farms layer and saves nothing. Roles come from Portal only: `org_admin` or `Coffee_Trace` → admin, everyone else → viewer. Admins may write chain records; viewers read.

## Setup

### GitHub / Pages

Settings → Pages → Source: **GitHub Actions**. Push to `main` to deploy.

### Supabase

1. Create a project at https://supabase.com/dashboard.
2. Project Settings → API: put the Project URL in `SUPABASE_URL` and the public anon/publishable key in `SUPABASE_ANON_KEY` in `src/config.js`. These are public browser values.
3. SQL Editor → paste all of `supabase/schema.sql` → **Run**. It creates one `records` table with the seven allowed model names.
4. Deploy the function:

   ```powershell
   npx supabase@latest login
   npx supabase@latest link --project-ref <project-ref>
   npx supabase@latest secrets set PORTAL_URL=https://gis.naeb.gov.rw/portal PORTAL_OWNER=Coffee_Trace
   npx supabase@latest functions deploy api --no-verify-jwt
   ```

`<project-ref>` is the first part of the Project URL. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function automatically. Never paste service keys or Portal passwords into chat.

### Portal access

The app signs in at `https://gis.naeb.gov.rw/portal`. As a Portal org administrator:

1. Organization → Settings → Security → **Allowed Origins** → add `https://jcntirenganya.github.io` and `http://localhost:8000`.
2. Ensure staff can read the farms service in `CFG.FARMS_URL` and the CWS service in `CFG.CWS_URL`. The app reads them with each user's own token.
3. Leave `CONVERSION_FIELD` empty to auto-detect the conversion-date field, or set the exact field name.

### GitHub Secrets

Repo → Settings → Secrets and variables → Actions:

- **Secrets**: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (service role key; never in `src/config.js`), plus `ARCGIS_USER` + `ARCGIS_PASSWORD` or `ARCGIS_TOKEN` for the one-time migration.
- **Variables**: `PORTAL_URL`, `PORTAL_OWNER`, `CONVERSION_FIELD`, `FARMS_URL`. Unset values fall back to `src/config.js`.

### Migrate existing chain rows once

With schema, function and secrets ready, run **Actions → Migrate chain tables from Portal to Supabase → Run workflow** once. It copies only the seven chain models. Do not run it again after people start saving. You can delete `.github/workflows/migrate.yml` afterwards.

### Cut over

1. Set `CFG.DEMO_CHAIN` to `false` in `src/config.js` and push.
2. Sign in on the deployed site and confirm the status line shows real farm polygons and stations.
3. Open **Find a farmer in Portal** and look up a known National ID.
4. Save one chain record and confirm it is tagged Recorded, not Indicative.
5. Leave print/PDF untouched until the saved PDF has been verified.

`API_URL` can stay empty; the app uses `SUPABASE_URL + "/functions/v1/api"`.

## Chain and pre-screen rules

`src/trace.js` follows records only: farmer/farm → **delivery** → **lot** → **batch** → exporter → importer. A delivery must name one farm. Where no delivery exists, same-sector farms are shown as possible (inferred), never confirmed. Any indicative record marks the chain indicative everywhere. Print/CSV act on the current selection; with nothing selected they ask for confirmation.

The EUDR pre-screen uses land condition on 31 Dec 2020. Non-forest prior use → low; plot geometry overlap → blocked. For forest prior use, a conversion-date field decides: on/before cut-off → low, after → blocked. Otherwise first planting year is one-sided: planted ≤ 2020 proves conversion by then → low; planted after 2020 → review, never blocked. All results are declared until satellite confirmation. This is pre-screening, not a legal determination.

`src/landuse.js` classifies the three survey options plus free-text “Other:” entries. Unrecognised entries go to review unless coffee was first planted on or before 2020. Cherry price below `MIN_CHERRY_PRICE` (800 RWF/kg) and parchment yield outside 16–22% warn but never block.

## Map and reports

The Map page keeps filters, a closed browse list, a small legend and a zoom button. Indicators live on Overview. Print/PDF uses the same scope as lists and CSV; the report code is unchanged until the saved PDF is verified. Map library: Leaflet from cdnjs.

## Tests

`node tests/run.mjs` and `node tests/supabase.mjs` use fakes. `node tests/smoke.mjs` optionally needs Playwright and checks sign-in, live farm polygons and the read-only lookup.

## Layout

`models/seed.json` · `src/engine/schema.js` · `src/data/{http,supabase,live,demo,index}.js` · `supabase/{schema.sql,config.toml,functions/api/index.ts}` · `scripts/migrate_portal.mjs` · `.github/workflows/{pages,migrate}.yml` · `tests/{run,supabase,smoke}.mjs`.
