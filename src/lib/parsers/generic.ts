import { CanonicalRow, ColumnMapping } from '@/lib/types'
import { sanitize } from '@/lib/normalizers/sanitize'
import { splitName } from '@/lib/normalizers/name'

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

    // At least 30% of sampled rows must have valid JSON objects
    if (jsonCount > 0 && jsonCount / sampleRows.length >= 0.3) {
      result.set(header, Array.from(keys).sort())
    }
  }

  return result
}

export function buildSourceColumns(
  headers: string[],
  jsonCols: Map<string, string[]>,
): string[] {
  const cols: string[] = [...headers]
  for (const [col, keys] of jsonCols) {
    for (const key of keys) cols.push(`${col}.${key}`)
  }
  return cols
}

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

export function autoDetectMapping(sourceColumns: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}

  // Pass 1: regular (non-dot) columns take priority over JSON sub-columns
  for (const col of sourceColumns) {
    if (col.includes('.')) continue
    const segment = col.replace(/^\$/, '')
    for (const { pattern, field } of PATTERNS) {
      if (pattern.test(segment.trim()) && !mapping[field]) {
        mapping[field] = col
        break
      }
    }
  }

  // Pass 2: JSON-expanded sub-columns (only fills unmapped fields)
  for (const col of sourceColumns) {
    if (!col.includes('.')) continue
    const segment = col.split('.').pop()!.replace(/^\$/, '')
    for (const { pattern, field } of PATTERNS) {
      if (pattern.test(segment.trim()) && !mapping[field]) {
        mapping[field] = col
        break
      }
    }
  }

  return mapping
}

export function parseGenericRow(
  row: Record<string, string>,
  mapping: ColumnMapping,
): CanonicalRow {
  const result: CanonicalRow = {}
  const jsonCache: Record<string, Record<string, unknown>> = {}

  for (const [canonicalKey, sourceColumn] of Object.entries(mapping)) {
    if (!sourceColumn) continue

    let value: string | undefined
    if (sourceColumn.includes('.')) {
      const dotIdx = sourceColumn.indexOf('.')
      const colName = sourceColumn.slice(0, dotIdx)
      const keyPath = sourceColumn.slice(dotIdx + 1)

      if (!jsonCache[colName]) {
        try {
          const parsed = JSON.parse(row[colName])
          jsonCache[colName] = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {}
        } catch {
          jsonCache[colName] = {}
        }
      }

      const val = jsonCache[colName][keyPath]
      value = typeof val === 'string' ? val : val != null ? String(val) : undefined
    } else {
      value = row[sourceColumn]
    }

    const clean = sanitize(value)
    if (clean) (result as Record<string, string | undefined>)[canonicalKey] = clean
  }

  if (result.phone && result.isd_code &&
      !result.phone.startsWith('+') && !result.phone.startsWith('00')) {
    result.phone = result.isd_code + result.phone
  }
  delete result.isd_code

  if (result.first_name?.includes(' ')) {
    const { first_name, last_name } = splitName(result.first_name)
    result.first_name = first_name
    if (last_name && !result.last_name) result.last_name = last_name
  }

  return result
}
