import { CanonicalRow, PlatformFile } from '@/lib/types'
import { normalizeEmail } from '@/lib/normalizers/email'
import { normalizePhone } from '@/lib/normalizers/phone'
import { toCsv } from '@/lib/transformers/utils'

const META_HEADERS = [
  'email', 'phone', 'fn', 'ln', 'ct', 'st', 'country',
  'zip', 'dob', 'doby', 'gen', 'age', 'madid', 'appuid', 'pageuid', 'iguid',
]

function extractYear(dob: string): string {
  const s = dob.trim()
  if (/^\d{8}$/.test(s)) return s.substring(0, 4)
  const leadingYear = s.match(/^((?:19|20)\d{2})\D/)
  if (leadingYear) return leadingYear[1]
  const anyYear = s.match(/(19|20)\d{2}/)
  return anyYear ? anyYear[0] : ''
}

function normalizeGender(value: string): string {
  const v = value.toLowerCase().trim()
  if (v === 'm' || v === 'male') return 'm'
  if (v === 'f' || v === 'female') return 'f'
  return ''
}

export function transformMeta(rows: CanonicalRow[]): PlatformFile {
  const output: Record<string, string>[] = rows.map(row => ({
    email:   row.email ? normalizeEmail(row.email) : '',
    phone:   row.phone ? normalizePhone(row.phone) : '',
    fn:      row.first_name?.trim() ?? '',
    ln:      row.last_name?.trim() ?? '',
    ct:      row.city?.toLowerCase().trim() ?? '',
    st:      row.state?.toLowerCase().trim() ?? '',
    country: row.country?.toLowerCase().trim() ?? '',
    zip:     row.zip?.trim() ?? '',
    dob:     row.dob ?? '',
    doby:    row.dob ? extractYear(row.dob) : '',
    gen:     row.gender ? normalizeGender(row.gender) : '',
    age:     '',
    madid:   row.madid ?? '',
    appuid:  '',
    pageuid: '',
    iguid:   '',
  }))

  return {
    filename: 'meta_audience.csv',
    content: toCsv(output, META_HEADERS),
    rowCount: output.length,
  }
}
