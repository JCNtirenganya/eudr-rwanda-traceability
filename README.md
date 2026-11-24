# Rwanda Coffee Traceability (NAEB)

Static web app (ES modules, no build step) hosted on GitHub Pages. **Portal sign-in, Supabase storage.**
Run locally with `python -m http.server` → http://localhost:8000 · Deploy: push to `main`.

## Architecture

```
GitHub Pages (static app)
  ├── ArcGIS Portal ── the only login; farmer_name / phone / national_id stay here
  ├── Supabase Edge Function "api" ── validates the Portal token, owns all app records
  └── Supabase Postgres ── deliveries, lots, batches, exporters, importers, recorded
                           farms/CWS, assignments, audit log, de-identified farms/CWS

ArcGIS farms + CWS ──scheduled, one-way──► Supabase source tables
```

The app has one sign-in. A single Edge Function accepts the Portal token the app already holds,
checks it against `community/self`, and reads/writes Postgres with the service key. Supabase has
no separate passwords. Personal identity stays in ArcGIS: the questionnaire looks up a National ID
directly against the farms layer with the signed-in user's token, and those three fields are never
written to Supabase.

The bridge is one-way: `.github/workflows/sync.yml` runs `scripts/sync_arcgis.mjs` every 15 minutes,
copying sanitized farms and washing stations into Supabase. At cutover, disable that workflow —
the app keeps working on the Supabase copy.

## Setup (one time)

### 1. GitHub

1. Create an empty repository at https://github.com/new (public is simplest; GitHub Pages is free).
   Do not initialize it with a README if you want a clean first push.
2. Repo → Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Push this folder to `main`:

   ```powershell
   cd C:\Particip\EXTRAS\eudr-rwanda-phase3
   git init
   git remote add origin https://github.com/<account>/<repo>.git
   git add .
   git commit -m "Move app to Supabase"
   git branch -M main
   git push -u origin main
   ```

   If GitHub asks for credentials, install `gh` from https://cli.github.com and run `gh auth login`
   once first. The `Deploy to GitHub Pages` workflow then publishes the site at
   `https://<account>.github.io/<repo>/`.

### 2. Supabase

1. Create a project at https://supabase.com/dashboard → **New project**. Keep the database password
   in a password manager; this app never needs it.
2. Project Settings → API: copy **Project URL** into `SUPABASE_URL` in `src/config.js`. Copy the
   public **anon** key (new projects may call it **publishable key**) into `SUPABASE_ANON_KEY` there.
   This key is public and safe in the browser.
3. SQL Editor → **New query** → paste all of `supabase/schema.sql` → **Run**.
4. Deploy the one function from this folder:

   ```powershell
   npx supabase@latest login
   npx supabase@latest link --project-ref <project-ref>
   npx supabase@latest secrets set PORTAL_URL=https://gis.naeb.gov.rw/portal PORTAL_OWNER=Coffee_Trace
   npx supabase@latest functions deploy api --no-verify-jwt
   ```

   `<project-ref>` is the first part of the Project URL (`https://<project-ref>.supabase.co`).
   `supabase/config.toml` also sets `verify_jwt = false`; if you deploy from the dashboard instead,
   turn **Verify JWT** off on the `api` function. The function validates the Portal token itself, so
   Supabase's JWT check must not run first. Supabase supplies `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` to the function automatically.

### 3. Portal access

The app still signs in at `https://gis.naeb.gov.rw/portal`. As a Portal org administrator:

1. Organization → Settings → Security → **Allowed Origins** → add `https://<account>.github.io`
   (and `http://localhost:8000` for local testing). Token requests send the browser origin as the
   referer; without this, sign-in fails with a CORS/token error.
2. Create a dedicated read-only account for the scheduled importer, e.g. `coffee_trace_sync`, and
   give it View access to the farms item `63a787f80563400fa9e46af7f006d714` and the CWS service
   `.../Coffee_Washing_Station/FeatureServer/0` from `src/config.js`. Use that account's username and
   password in GitHub Secrets below. Staff keep signing in with their own Portal accounts.
3. Ensure staff who use the questionnaire can read the farms layer. The National-ID lookup goes
   straight to that layer with the signed-in user's own token.

### 4. GitHub Secrets and variables

Repo → Settings → Secrets and variables → Actions:

- **Secrets**: `SUPABASE_URL` (same Project URL), `SUPABASE_SERVICE_KEY` (the `service_role` secret
  key from Supabase Project Settings → API — never put this in `src/config.js` or in chat), and either
  `ARCGIS_USER` + `ARCGIS_PASSWORD` (recommended; no token rotation) or `ARCGIS_TOKEN` (a long-lived
  Portal token if your administrator issues one).
- **Variables**: `PORTAL_URL`, `PORTAL_OWNER`, `CONVERSION_FIELD`, `FARMS_ITEM_ID`, `FARMS_URL`,
  `CWS_URL`. Leave these unset to use the defaults in `src/config.js` and `scripts/sync_arcgis.mjs`.
  `CONVERSION_FIELD` is normally left empty so the importer detects "conver" fields.

### 5. Migrate existing Portal rows once

With the schema, function and secrets ready, run **Actions → Migrate existing Portal tables to
Supabase → Run workflow** once. It discovers every `EUDR_Trace_*` service owned by `Coffee_Trace`,
copies rows into `records`, strips personal fields, and seeds `profiles` from `user_assignment`.
Do not run it again after people start saving: it upserts on `(model, rec_key)` and would overwrite
newer edits. You can delete `.github/workflows/migrate.yml` afterwards.

### 6. Start the bridge and verify

1. Run **Actions → Sync ArcGIS farms and CWS to Supabase → Run workflow** once. Scheduled runs then
   repeat every 15 minutes.
2. Sign in on the deployed site with the same Portal account as before.
3. Admin → **Test saving** checks sign-in, the Edge Function, Postgres and permissions.
4. Confirm farms and CWS appear on Map/Overview from the Supabase mirror, and that questionnaire
   National-ID lookup works directly against ArcGIS.
5. Leave print/PDF untouched until the saved PDF has been verified.

`API_URL` in `src/config.js` can stay empty; the app uses `SUPABASE_URL + "/functions/v1/api"`.
`FARMS_LAYER` in `src/config.js` is only used for the National-ID lookup; the importer uses the URL
resolved from the farms item.

## What is stored where

| Data | Home |
|---|---|
| Farmer name, phone, National ID | ArcGIS only |
| Farm polygons, land use, planting years, yields, CWS location/capacity | Supabase (sanitized mirror + recorded farms) |
| Deliveries, lots, batches, exporters, importers, links | Supabase |
| Station assignments, audit log | Supabase |
| Model definitions | `models/seed.json` + layer metadata cached by the importer |

Every record keeps `data_source`: **live** (from the synced layers), **recorded** (entered here),
**indicative** (demo, generated locally and never saved). A link model is never faked between two
real parents. Soft delete only; the audit log omits personal fields and geometry.

## Map, Overview and printing

The **Map** page is kept clean: only the filters, a "Browse list" that stays closed until opened, a
small legend and a "Zoom to focus" button. Every filter change zooms to the plots it concerns.
The indicators live on **Overview**.

**Print / PDF** starts with a **map extract** (base tiles, in-focus plots coloured by risk,
stations, scale bar, north arrow, legend, attribution) and a **network extract**, then the tables.
Both use the same scope as the lists and CSV. Printing waits up to 7 s for tiles and needs internet
for the base map; plots and stations still print on a blank background without it.

## How the chain is traced

`src/trace.js` follows records only: farmer/farm → **delivery** → **lot** (lot–delivery link) →
**batch** (batch–lot link) → exporter → importer. A farm's chain contains only deliveries naming it.
If a delivery names no plot, the farmer's plots are **inferred**; with no delivery, same-sector
stations/farms are listed as **possible (inferred)**, never counted as links. A chain with any
indicative record is marked indicative everywhere. Print/CSV act on the current selection and
filters; with nothing selected they ask for confirmation. Nothing is truncated.

Map library: Leaflet from cdnjs; polygons drawn once on a canvas with a spatial grid for clicks.

## Deforestation pre-screen (cut-off 31 Dec 2020)

Non-forest prior use → low. Plot geometry overlap → blocked. For forest prior use, a conversion-date
field (any name with "conver", or `CONVERSION_FIELD`) decides: on/before 31 Dec 2020 → low, after →
blocked. Otherwise first planting year is used one-sidedly: planted ≤ 2020 proves conversion by then
→ low; planted after 2020 → **review**, never blocked. No date and no valid year → review. The
conversion-field name is carried from ArcGIS to Supabase by the importer. All results are declared
until satellite confirmation. Pre-screening only, not a legal determination.

`src/landuse.js` classifies the three survey options plus free-text "Other:" entries (e.g.
*ishyamba* = forest, *ibishyimbo* = crops, *hatuwe* = homestead). Unrecognised entries go to review
unless coffee was first planted on or before 2020.

## Rules built in

- Cherry price is a **minimum** (`MIN_CHERRY_PRICE`, 800 RWF/kg): lower warns, higher never blocks.
- Parchment yield outside 16–22% of cherries warns on a lot.
- Uniqueness (licence no., EORI, record IDs) is checked before saving.
- Editors can change cherry records only for assigned stations; viewers read only; admins do all.

## Tests

`node tests/run.mjs` and the other suites use fakes; `tests/smoke.mjs` additionally needs Playwright.
`tests/supabase.mjs` checks the Supabase adapter, including that personal fields are never sent.
The legacy `src/data/arcgis.js`, `src/data/publish.js` and `scripts/setup_tables.py` are kept for
reference only; the app no longer calls them.

## Layout

`models/seed.json` · `src/engine/schema.js` · `src/data/{http,supabase,live,demo,index}.js` ·
`supabase/{schema.sql,config.toml,functions/api/index.ts}` ·
`scripts/{sync_arcgis,migrate_portal}.mjs` ·
`.github/workflows/{pages,sync,migrate}.yml` · `tests/*.mjs`.
