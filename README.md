# Rwanda Coffee Traceability (NAEB)

Static web app (ES modules, no build step) hosted on GitHub Pages. **Portal is the only sign-in and the home of real farms, farmers and washing stations. Supabase stores chain records only.**

Repo: https://github.com/JCNtirenganya/eudr-rwanda-traceability

Site: https://jcntirenganya.github.io/eudr-rwanda-traceability/

Run locally with `python -m http.server` → http://localhost:8000. Deploy: push to `main`; the Pages workflow publishes the site.

## Current state

`CFG.OFFLINE_DEMO` in `src/config.js` is **temporarily `true`**. Portal sign-in is still required; after a successful Portal token the app opens with **indicative** farms, stations and chain records generated in the browser. Nothing is saved, and a banner says so. This lets the deployed link work while Supabase is being configured.

Set `CFG.OFFLINE_DEMO` to `false` after the Supabase steps below. Sign-in stays the same, but farms/CWS are read directly from Portal and chain records are saved to Supabase.

If sign-in fails, the message shows Portal's own detail (for example, `Invalid username or password.`). Use the **exact Portal username**, not an email address unless that email is the username. Confirm it by signing in at https://gis.naeb.gov.rw/portal.

## Architecture

```
GitHub Pages (static app)
  ├── ArcGIS Portal ── only login; real farm polygons, farmers and CWS
  │                    personal fields stay here; read-only National-ID lookup
  └── Supabase Edge Function "api"
        ├── checks the Portal token via community/self
        └── reads/writes chain records in Postgres with the service key
```

There is no Supabase Auth, no second password, and no farm/CWS mirror. The browser never sees the Supabase service key; it sends the Portal token it already has to the single `api` function. The function validates that token before touching Postgres.

**No sync exists.** The former `.github/workflows/sync.yml` and `scripts/sync_arcgis.mjs` have been removed. Real farm polygons, farmers and CWS are read from Portal at runtime with the signed-in user's token.

## What is stored where

| Data | Home |
|---|---|
| Farmer name, phone, National ID | ArcGIS Portal only |
| Farm polygons, prior land use, planting years, yields | ArcGIS Portal only |
| Washing station location, capacity, owner, contacts | ArcGIS Portal only |
| Cherry deliveries, lots, lot–delivery links | Supabase |
| Exporters, importers, export batches, batch–lot links | Supabase |
| Demo/sample/indicative rows | Browser only; never saved to Supabase |
| Recorded farm/CWS forms, station assignments, audit log | Disabled for now |
| Model definitions | `models/seed.json` |

The read-only questionnaire finds a farmer by National ID in the Portal farms layer and shows that farmer's mapped plots. It saves nothing; GIS staff must change the Portal layer.

Roles come from Portal only: `org_admin` or `Coffee_Trace` → admin; everyone else → viewer. There are no station assignments or editor role for now. If you need admin access, ask the Portal organisation administrator to add your account to `Coffee_Trace`.

## Setup

### 1. GitHub / Pages

Already configured for this repo:

- Settings → Pages → Build and deployment → Source: **GitHub Actions**.
- Push to `main` → `.github/workflows/pages.yml` deploys the site.

If starting from scratch, create an empty repo without “3” in the name, add `origin`, and push `main`. GitHub credentials can be set up once with `gh auth login` (https://cli.github.com).

### 2. Supabase

1. Create a project at https://supabase.com/dashboard → **New project**. The database password is not needed by this app; keep it in a password manager.
2. Project Settings → API: copy **Project URL** into `SUPABASE_URL` in `src/config.js`. Copy the public **anon/publishable key** into `SUPABASE_ANON_KEY`. These are public browser values.
3. SQL Editor → **New query** → paste all of `supabase/schema.sql` → **Run**. It creates only the `records` table with a check constraint allowing the seven chain models.
4. Deploy the one function from this folder:

   ```powershell
   npx supabase@latest login
   npx supabase@latest link --project-ref <project-ref>
   npx supabase@latest secrets set PORTAL_URL=https://gis.naeb.gov.rw/portal PORTAL_OWNER=Coffee_Trace
   npx supabase@latest functions deploy api --no-verify-jwt
   ```

   `<project-ref>` is the first part of the Project URL (`https://<project-ref>.supabase.co`). `supabase/config.toml` also sets `verify_jwt = false`; if deploying from the dashboard instead, turn **Verify JWT** off on `api`. The function validates the Portal token itself. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function automatically.

There is no Supabase Auth setup. Do not paste service keys or Portal passwords into chat.

### 3. Portal access

The app signs in at `https://gis.naeb.gov.rw/portal`. As a Portal org administrator:

1. Organization → Settings → Security → **Allowed Origins** → add `https://jcntirenganya.github.io` and `http://localhost:8000` for local testing. Token requests send the browser origin as the referer; without this, sign-in fails.
2. Ensure staff can **read** the farms item `63a787f80563400fa9e46af7f006d714` and the CWS service `https://gis.naeb.gov.rw/server/rest/services/Hosted/Coffee_Washing_Station/FeatureServer/0` (values in `src/config.js`). The app reads them with each user's own token.
3. For the one-time migration only, create a read-only Portal account (for example `coffee_trace_sync`) with access to existing `EUDR_Trace_*` chain services. Staff never use that account.

If a value is unknown: get Portal item/service URLs from the Portal item page or `src/config.js`; get the exact conversion-date field from the farms layer (or leave `CONVERSION_FIELD` empty to detect a field containing “conver”); get Supabase keys from Project Settings → API.

### 4. GitHub Secrets and variables

Repo → Settings → Secrets and variables → Actions:

- **Secrets**: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (service role key from Supabase Project Settings → API — never put this in `src/config.js`), and either `ARCGIS_USER` + `ARCGIS_PASSWORD` or `ARCGIS_TOKEN` for the migration.
- **Variables**: `PORTAL_URL`, `PORTAL_OWNER`, `CONVERSION_FIELD`, `FARMS_URL`. Leave unset to use the defaults in `src/config.js`.

### 5. Migrate existing chain rows once

With schema, function and secrets ready, run **Actions → Migrate chain tables from Portal to Supabase → Run workflow** once. It discovers `EUDR_Trace_*` services owned by `Coffee_Trace`, copies only the seven chain models into `records`, and leaves farms, farmers, CWS and personal fields on Portal. Do not run it again after people start saving: it upserts on `(model, rec_key)` and would overwrite newer edits. You can delete `.github/workflows/migrate.yml` afterwards.

### 6. Cut over and verify

1. Set `CFG.OFFLINE_DEMO` to `false` in `src/config.js` and push.
2. Sign in on the deployed site with the same Portal account.
3. Confirm the status line shows the real farm polygons and stations from Portal.
4. Open **Find a farmer in Portal** from the Record menu and look up a known National ID.
5. Admin → **Test saving** checks sign-in, the Edge Function, Postgres and permissions.
6. Save a chain record and confirm it appears as Recorded, not Indicative.
7. Leave print/PDF untouched until the saved PDF has been verified.

`API_URL` in `src/config.js` can stay empty; the app uses `SUPABASE_URL + "/functions/v1/api"`.

## Chain and pre-screen rules

`src/trace.js` follows records only: farmer/farm → **delivery** → **lot** (lot–delivery link) → **batch** (batch–lot link) → exporter → importer. A delivery must name one farm. Where no delivery record exists, same-sector stations/farms are shown as **possible (inferred)**, never counted as confirmed links. A chain with any indicative record is marked indicative everywhere. Print/CSV act on the current selection and filters; with nothing selected they ask for confirmation. Nothing is truncated.

The EUDR pre-screen uses the land's condition on 31 Dec 2020. Non-forest prior use → low; plot geometry overlap → blocked. For forest prior use, a conversion-date field (any field containing “conver”, or `CONVERSION_FIELD`) decides: on/before the cut-off → low, after → blocked. Otherwise first planting year is used one-sidedly: planted ≤ 2020 proves conversion by then → low; planted after 2020 → review, never blocked. All results are declared until satellite confirmation. This is pre-screening only, not a legal determination.

`src/landuse.js` classifies the three survey options plus free-text “Other:” entries (for example *ishyamba* = forest, *ibishyimbo* = crops, *hatuwe* = homestead). Unrecognised entries go to review unless coffee was first planted on or before 2020.

Other built-in rules: cherry price is a **minimum** (`MIN_CHERRY_PRICE`, 800 RWF/kg); parchment yield outside 16–22% warns on lots; uniqueness (licence no., EORI, record IDs) is checked before saving.

## Map and reports

The **Map** page stays clean: filters, a closed-by-default browse list, a small legend and a “Zoom to focus” button. Filters zoom to the plots concerned; indicators live on **Overview**.

**Print / PDF** starts with a map extract (base tiles, in-focus plots coloured by risk, stations, scale bar, north arrow, legend, attribution) and a network extract, then the tables. Both use the same scope as the lists and CSV. Printing waits up to 7 s for tiles and needs internet for the base map; plots and stations still print on a blank background without it. This code is unchanged until the saved PDF is verified.

Map library: Leaflet from cdnjs; polygons drawn once on a canvas with a spatial grid for clicks.

## Tests

`node tests/run.mjs` (30 checks) and `node tests/supabase.mjs` (4 checks) use fakes. `tests/smoke.mjs` additionally needs Playwright. `tests/supabase.mjs` checks the adapter and that personal fields are never sent. The legacy `src/data/arcgis.js`, `src/data/publish.js` and `scripts/setup_tables.py` are kept for reference only; the app no longer calls them.

## Layout

`models/seed.json` · `src/engine/schema.js` · `src/data/{http,supabase,live,demo,index}.js` · `supabase/{schema.sql,config.toml,functions/api/index.ts}` · `scripts/migrate_portal.mjs` · `.github/workflows/{pages,migrate}.yml` · `tests/*.mjs`.
