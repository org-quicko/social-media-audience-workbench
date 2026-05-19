@AGENTS.md

# Social Media Audience Workbench

Electron desktop app that transforms customer CSVs into ad-platform-ready audience files for Meta, Google, LinkedIn, and X (Twitter) Ads. All processing is local — no data ever leaves the machine.

**Why it exists:** Quicko uploads customer lists to ad platforms for retargeting. Platforms silently reject non-compliant files and take 24–48h to process, so a failed upload wastes days. This tool validates and reformats before upload.

---

## Running the app

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server at localhost:3000 (browser only) |
| `npm run electron:dev` | Starts Next.js + Electron together |
| `npm run electron:dist:mac` | Builds macOS DMGs (x64 + arm64) into `dist-electron/` |
| `npm run electron:dist:win` | Builds Windows NSIS installer — must run on Windows or a Windows CI runner |
| `npm run build` | Next.js static export to `out/` only, no Electron packaging |

`next start` does not work — the app uses `output: 'export'` (static). Use `electron:dev` or open the packaged app.

---

## Architecture

The entire UI and orchestration lives in one file: `src/app/page.tsx`. There are no multi-page routes.

```
src/
  app/
    page.tsx          ← upload → parse → preview → export (all in one)
    layout.tsx        ← root layout, Inter font, metadata
    globals.css       ← Tailwind base styles
  lib/
    types.ts          ← CanonicalRow, PlatformType, PlatformFile, ColumnMapping
    parsers/
      generic.ts      ← auto-detect column mapping + parse any CSV
      listmonk.ts     ← Listmonk export parser
      zoho-crm.ts     ← Zoho CRM contacts export parser
      posthog.ts      ← PostHog persons export parser
    transformers/
      meta.ts         ← CanonicalRow[] → Meta Ads CSV
      google.ts       ← CanonicalRow[] → Google Ads Customer Match CSV
      linkedin.ts     ← CanonicalRow[] → LinkedIn Contact Targeting CSV
      twitter.ts      ← CanonicalRow[] → X (Twitter) Tailored Audiences CSV
    normalizers/
      email.ts        ← lowercase + trim + collapse whitespace
      phone.ts        ← E.164 format, India-aware
      name.ts         ← splitName() splits "First Last" into parts
      sanitize.ts     ← strips "null", "n/a", "unknown", "-", etc.
  components/
    ui/               ← shadcn/ui primitives (button, select, etc.) — do not edit directly
electron/
  main.js             ← Electron main process
```

---

## Data flow

1. User drops a CSV → PapaParse streams it with `worker: true` (handles large files without freezing the UI)
2. Headers are inspected → source auto-detected → appropriate parser called per row → `CanonicalRow[]`
3. `CanonicalRow` is the internal format: a flat object with all optional fields — `email`, `phone`, `first_name`, `last_name`, `city`, `state`, `country`, `zip`, `dob`, `gender`, `job_title`, `company`, `madid`, `google_aid`
4. Platform selected → transformer converts `CanonicalRow[]` to a platform-specific CSV string on demand
5. Export → single file download, or ZIP if row count exceeds the platform's per-file limit

---

## Source auto-detection

Checked in this order against the CSV headers:

| Source | Detection rule |
|---|---|
| Listmonk | Has `email` + `name` + (`attribs` or `attributes`) |
| Zoho CRM | Has `first name` + `last name` + any header containing `mailing` |
| PostHog | Has `distinct_id` or any header starting with `$` |
| Generic | Everything else — columns auto-mapped by name pattern |

---

## Platform output rules

**Meta** — headers: `email phone fn ln ct st country zip dob doby gen age madid appuid pageuid iguid`. Only columns with at least one non-empty value are written. Gender normalised to `m`/`f`. `doby` (birth year) extracted from whatever DOB format is present.

**Google** — headers: `Email First Name Last Name Country Zip Phone`. Only non-empty columns written.

**LinkedIn** — headers: `email phone firstname lastname jobtitle employeecompany country googleaid`. Hard row limit: **300,000 rows/file** (documented LinkedIn Ads constraint). Files over this are auto-split and bundled into a ZIP.

**X (Twitter)** — headers: `email phone madid` (only identifier types present in the data). During the Twitter upload UI users map each column to its identifier type — descriptive column names matter here.

---

## Key decisions

- **No hashing.** All platforms accept plain-text identifiers. Hashing was deliberately omitted to keep the tool simple.
- **DOB passed through as-is.** Meta accepts 18 date formats natively — forced conversion would break some inputs.
- **Phone normalisation is India-aware.** 10-digit numbers starting with 6–9 get `+91` prepended. 11-digit numbers with a leading `0` have it replaced with `+91`. All others get `+` prepended.
- **Sanitize is universal.** Values like `"null"`, `"n/a"`, `"unknown"`, `"-"`, `"none"`, `"undefined"` are treated as empty across all sources and fields.
- **Columns with all-empty values are dropped** from the output — some platforms reject files with entirely blank columns.

---

## Electron setup

- `output: 'export'` + `trailingSlash: true` in `next.config.ts` — required so Next.js writes `out/` as a static site that electron-serve can load.
- In production the `out/` directory is served on a custom `app://` protocol via `electron-serve` (avoids `file://` path quirks).
- Renderer runs with `nodeIntegration: false` + `contextIsolation: true` — no Node.js APIs in the UI code.
- Windows builds must be run on Windows (or a Windows CI runner) — electron-builder cannot cross-compile from macOS.

---
