import { CanonicalRow, PlatformFile } from '@/lib/types'
import { normalizeEmail } from '@/lib/normalizers/email'
import { normalizePhone } from '@/lib/normalizers/phone'
import { toCsv } from '@/lib/transformers/utils'

// Headers are case-sensitive and must match Google's template exactly.
// Column order matches Google's documented example (Email → Phone → names → Zip → Country).
// Ref: https://support.google.com/google-ads/answer/7659867
const GOOGLE_HEADERS = ['Email', 'Phone', 'First name', 'Last name', 'Zip', 'Country']

export function transformGoogle(rows: CanonicalRow[]): PlatformFile {
  const output: Record<string, string>[] = rows.map(row => ({
    'Email':      row.email ? normalizeEmail(row.email) : '',
    'Phone':      row.phone ? normalizePhone(row.phone) : '',
    'First name': row.first_name?.trim() ?? '',
    'Last name':  row.last_name?.trim() ?? '',
    'Zip':        row.zip?.trim() ?? '',
    // Country must be ISO 3166-1 alpha-2 (2-letter uppercase code: IN, US, GB …).
    // Full country names are not accepted and cause those rows to be silently skipped.
    // Country must be ISO 3166-1 alpha-2 uppercase code (US, IN, GB …).
    // Google docs explicitly show uppercase: "US or USA for United States".
    'Country':    row.country?.trim().toUpperCase() ?? '',
  }))

  return {
    filename: 'google_audience.csv',
    content: toCsv(output, GOOGLE_HEADERS),
    rowCount: output.length,
  }
}
