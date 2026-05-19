import { CanonicalRow, ColumnMapping } from '@/lib/types'
import { sanitize } from '@/lib/normalizers/sanitize'
import { splitName } from '@/lib/normalizers/name'

// ─── JSON column expansion ─────────────────────────────────────────────────────

/**
 * Sample up to `sampleRows` rows to discover which columns contain JSON objects.
 * Returns a map of: column header → sorted list of JSON keys found in that column.
 *
 * Used so that a column like `attributes` (containing {"first_name":"…","phone":"…"})
 * becomes individually mappable as `attributes.first_name`, `attributes.phone`, etc.
 */
export function detectJsonColumns(
  headers: string[],
  sampleRows: Record<string, string>[],
): Map<string, string[]> {
  const result = new Map<string, string[]>()

  for (const header of headers) {
    const keys = new Set<string>()
    let jsonCount = 0

    for (const row of sampleRows) {
      const val = row[header]
      if (!val || val.trim() === '' || val.trim() === '{}') continue
      try {
        const parsed = JSON.parse(val)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.keys(parsed).forEach(k => keys.add(k))
          jsonCount++
        }
      } catch { /* not JSON */ }
    }

    // Only mark as a JSON column if at least 30% of sampled rows had valid JSON objects
    if (jsonCount > 0 && jsonCount / sampleRows.length >= 0.3) {
      result.set(header, Array.from(keys).sort())
    }
  }

  return result
}

/**
 * Build a flat list of all mappable source columns:
 * regular headers first, then JSON-expanded sub-columns (e.g. "attributes.phone").
 *
 * Regular columns that are JSON containers are kept in the list so the user can
 * still map the raw JSON string if they want, but the expanded sub-keys are appended.
 */
export function buildSourceColumns(
  headers: string[],
  jsonCols: Map<string, string[]>,
): string[] {
  const cols: string[] = [...headers]
  for (const [col, keys] of jsonCols) {
    for (const key of keys) {
      cols.push(`${col}.${key}`)
    }
  }
  return cols
}

// ─── Auto-mapping ──────────────────────────────────────────────────────────────

const PATTERNS: Array<{ pattern: RegExp; field: keyof CanonicalRow }> = [
  { pattern: /^e[\s_-]?mail([\s_-]?address)?$/i,                                  field: 'email' },
  { pattern: /^(phone|mobile|cell|telephone|tel|phone[\s_-]?number|mobile[\s_-]?number)$/i, field: 'phone' },
  { pattern: /^(first[\s_-]?name|fname|given[\s_-]?name)$/i,                     field: 'first_name' },
  { pattern: /^(last[\s_-]?name|lname|surname|family[\s_-]?name)$/i,             field: 'last_name' },
  { pattern: /^(city|town|mailing[\s_-]?city|geoip[\s_-]?city[\s_-]?name)$/i,   field: 'city' },
  { pattern: /^(state|province|region|mailing[\s_-]?state|geoip[\s_-]?subdivision[\s_-]?1[\s_-]?name)$/i, field: 'state' },
  { pattern: /^(country|mailing[\s_-]?country|geoip[\s_-]?country[\s_-]?code)$/i, field: 'country' },
  { pattern: /^(zip|zip[\s_-]?code|postal[\s_-]?code|post[\s_-]?code|postcode|mailing[\s_-]?zip)$/i, field: 'zip' },
  { pattern: /^(dob|date[\s_-]?of[\s_-]?birth|birth[\s_-]?date)$/i,             field: 'dob' },
  { pattern: /^(gender|sex)$/i,                                                   field: 'gender' },
  { pattern: /^(job[\s_-]?title|title|position|designation)$/i,                  field: 'job_title' },
  { pattern: /^(company|employer|organi[sz]ation|account[\s_-]?name|company[\s_-]?name)$/i, field: 'company' },
  { pattern: /^(madid|idfa|gaid|device[\s_-]?id|advertising[\s_-]?id)$/i,        field: 'madid' },
  { pattern: /^google[\s_-]?(advertising|ad)[\s_-]?id$/i,                        field: 'google_aid' },
  { pattern: /^(isd[\s_-]?code|country[\s_-]?code|dial[\s_-]?code|calling[\s_-]?code|phone[\s_-]?code)$/i, field: 'isd_code' },
  { pattern: /^(full[\s_-]?)?name$/i,                                             field: 'first_name' },
]

/**
 * Attempt to auto-match source columns (including JSON-expanded dot-notation columns)
 * to canonical fields by pattern-matching the column's last segment.
 *
 * Two-pass strategy: regular columns are matched first so they take priority over
 * JSON sub-columns with the same field name (e.g. a top-level `email` column
 * beats `attributes.email`).
 *
 * Leading `$` is stripped before matching so PostHog columns like `$email`,
 * `$first_name`, `$phone` are recognised without needing special-case rules.
 * Similarly, `geoip_*` prefix columns from PostHog's `$geoip_country_code` etc.
 * are handled by the expanded patterns above.
 */
export function autoDetectMapping(sourceColumns: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}

  function tryMatch(col: string) {
    // For dot-notation columns, match against the last segment only
    const rawSegment = col.includes('.') ? col.split('.').pop()! : col
    // Strip leading $ (PostHog property convention: $email, $first_name, etc.)
    const segment = rawSegment.replace(/^\$/, '')
    for (const { pattern, field } of PATTERNS) {
      if (pattern.test(segment.trim()) && !mapping[field]) {
        mapping[field] = col
        break
      }
    }
  }

  // Pass 1: regular (non-dot) columns
  for (const col of sourceColumns) {
    if (!col.includes('.')) tryMatch(col)
  }

  // Pass 2: JSON-expanded sub-columns (only fills unmapped fields)
  for (const col of sourceColumns) {
    if (col.includes('.')) tryMatch(col)
  }

  return mapping
}

// ─── Row parser ────────────────────────────────────────────────────────────────

/**
 * Parse a single raw CSV row into a CanonicalRow using the provided mapping.
 *
 * Mapping values may use dot-notation to reach into JSON columns:
 *   mapping['phone'] = 'attributes.phone'
 *   → JSON.parse(row['attributes'])['phone']
 *
 * Parsed JSON objects are cached per row to avoid re-parsing the same column
 * multiple times.
 */
export function parseGenericRow(
  row: Record<string, string>,
  mapping: ColumnMapping,
): CanonicalRow {
  const result: CanonicalRow = {}
  const jsonCache: Record<string, Record<string, unknown>> = {}

  function readValue(sourceColumn: string): string | undefined {
    if (sourceColumn.includes('.')) {
      const dotIdx = sourceColumn.indexOf('.')
      const colName = sourceColumn.slice(0, dotIdx)
      const keyPath = sourceColumn.slice(dotIdx + 1)

      if (!jsonCache[colName]) {
        try {
          const parsed = JSON.parse(row[colName] ?? '')
          jsonCache[colName] = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            ? (parsed as Record<string, unknown>)
            : {}
        } catch {
          jsonCache[colName] = {}
        }
      }

      const val = jsonCache[colName][keyPath]
      return typeof val === 'string' ? val : val != null ? String(val) : undefined
    }
    return row[sourceColumn]
  }

  for (const [canonicalKey, sourceColumn] of Object.entries(mapping)) {
    if (!sourceColumn) continue
    const value = readValue(sourceColumn)
    const clean = sanitize(value)
    if (clean) {
      (result as Record<string, string | undefined>)[canonicalKey] = clean
    }
  }

  // Combine ISD/country code with a bare mobile number that has no country code prefix
  if (result.phone && result.isd_code &&
      !result.phone.startsWith('+') && !result.phone.startsWith('00')) {
    result.phone = result.isd_code + result.phone
  }
  delete result.isd_code

  // If first_name contains a space, split it — always, even if last_name is already set
  // (e.g. Listmonk's `name` column may map to first_name before attribs sub-fields are read)
  if (result.first_name && result.first_name.includes(' ')) {
    const { first_name, last_name } = splitName(result.first_name)
    result.first_name = first_name
    // Only overwrite last_name if it wasn't set by an explicit last_name column
    if (last_name && !result.last_name) result.last_name = last_name
  }

  return result
}
