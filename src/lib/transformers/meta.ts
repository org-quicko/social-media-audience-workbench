import Papa from 'papaparse'
import { CanonicalRow, PlatformFile } from '@/lib/types'
import { normalizeEmail } from '@/lib/normalizers/email'
import { normalizePhone } from '@/lib/normalizers/phone'

// Meta column headers in exact required order
const META_HEADERS = [
  'email', 'phone', 'fn', 'ln', 'ct', 'st', 'country',
  'zip', 'dob', 'doby', 'gen', 'age', 'madid', 'appuid', 'pageuid', 'iguid',
]

function extractYear(dob: string): string {
  const s = dob.trim()
  // YYYYMMDD: 8 consecutive digits — first 4 are the year
  if (/^\d{8}$/.test(s)) return s.substring(0, 4)
  // YYYY at start (YYYY-MM-DD, YYYY/MM/DD, etc.)
  const leadingYear = s.match(/^((?:19|20)\d{2})\D/)
  if (leadingYear) return leadingYear[1]
  // Any isolated 4-digit year (e.g. DD-MM-YYYY, MM/DD/YYYY)
  const anyYear = s.match(/(19|20)\d{2}/)
  return anyYear ? anyYear[0] : ''
}

function normalizeGender(value: string | undefined): string {
  if (!value) return ''
  const v = value.toLowerCase().trim()
  if (v === 'm' || v === 'male') return 'm'
  if (v === 'f' || v === 'female') return 'f'
  return ''
}

export function transformMeta(rows: CanonicalRow[]): PlatformFile {
  const output = rows.map(row => ({
    email: row.email ? normalizeEmail(row.email) : '',
    phone: row.phone ? normalizePhone(row.phone) : '',
    fn: row.first_name ? row.first_name.toLowerCase().trim() : '',
    ln: row.last_name ? row.last_name.toLowerCase().trim() : '',
    ct: row.city ? row.city.toLowerCase().trim() : '',
    st: row.state ? row.state.toLowerCase().trim() : '',
    country: row.country ? row.country.toLowerCase().trim() : '',
    zip: row.zip ? row.zip.trim() : '',
    dob: row.dob ?? '',
    doby: row.dob ? extractYear(row.dob) : '',
    gen: normalizeGender(row.gender),
    age: '',
    madid: row.madid ?? '',
    appuid: '',
    pageuid: '',
    iguid: '',
  }))

  // Only include columns that have at least one non-empty value
  type MetaRow = typeof output[number]
  const activeHeaders = META_HEADERS.filter(h =>
    output.some(row => row[h as keyof MetaRow] !== '')
  )

  const filteredOutput = output.map(row => {
    const filtered: Partial<MetaRow> = {}
    for (const h of activeHeaders) {
      filtered[h as keyof MetaRow] = row[h as keyof MetaRow]
    }
    return filtered
  })

  const csv = Papa.unparse({ fields: activeHeaders, data: filteredOutput })

  return {
    filename: 'meta_audience.csv',
    content: csv,
    rowCount: output.length,
  }
}
