import Papa from 'papaparse'
import { CanonicalRow, PlatformFile } from '@/lib/types'
import { normalizeEmail } from '@/lib/normalizers/email'
import { normalizePhone } from '@/lib/normalizers/phone'

/**
 * X (Twitter) Ads — single multi-column CSV.
 *
 * During upload Twitter shows a column-mapping step where you assign each
 * column to an identifier type (Email Address, Phone Number, Mobile Advertising
 * ID, X Username, or User ID) or mark it "Do not upload data".
 *
 * We output only the identifier columns we have data for, with descriptive
 * names the user will see in that mapping UI.
 */

const TWITTER_HEADERS = ['email', 'phone', 'madid'] as const
type TwitterHeader = typeof TWITTER_HEADERS[number]

type TwitterRow = Record<TwitterHeader, string>

function normalizeMadid(value: string): string {
  // IDFA / GAID: 8-4-4-4-12 hex format, lowercase
  return value.toLowerCase().trim()
}

export function transformTwitter(rows: CanonicalRow[]): PlatformFile {
  const output: TwitterRow[] = rows.map(row => ({
    email:  row.email ? normalizeEmail(row.email) : '',
    phone:  row.phone ? normalizePhone(row.phone).replace(/\s+/g, '') : '',
    madid:  row.madid ? normalizeMadid(row.madid) : '',
  }))

  // Only include columns that have at least one non-empty value
  const activeHeaders = TWITTER_HEADERS.filter(h =>
    output.some(row => row[h] !== '')
  )

  const filteredOutput = output.map(row => {
    const filtered: Partial<TwitterRow> = {}
    for (const h of activeHeaders) filtered[h] = row[h]
    return filtered
  })

  const csv = Papa.unparse({ fields: [...activeHeaders], data: filteredOutput })

  return {
    filename: 'twitter_audience.csv',
    content: csv,
    rowCount: output.length,
  }
}
