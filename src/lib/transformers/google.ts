import Papa from 'papaparse'
import { CanonicalRow, PlatformFile } from '@/lib/types'
import { normalizeEmail } from '@/lib/normalizers/email'
import { normalizePhone } from '@/lib/normalizers/phone'

// Google Ads Customer Match headers (exact capitalization required)
const GOOGLE_HEADERS = ['Email', 'First Name', 'Last Name', 'Country', 'Zip', 'Phone']

type GoogleRow = {
  Email: string
  'First Name': string
  'Last Name': string
  Country: string
  Zip: string
  Phone: string
}

export function transformGoogle(rows: CanonicalRow[]): PlatformFile {
  const output: GoogleRow[] = rows.map(row => ({
    Email: row.email ? normalizeEmail(row.email) : '',
    'First Name': row.first_name?.trim() ?? '',
    'Last Name': row.last_name?.trim() ?? '',
    Country: row.country?.trim() ?? '',
    Zip: row.zip?.trim() ?? '',
    Phone: row.phone ? normalizePhone(row.phone) : '',
  }))

  // Only include columns that have at least one non-empty value
  const activeHeaders = GOOGLE_HEADERS.filter(header =>
    output.some(row => row[header as keyof GoogleRow] !== '')
  )

  const filteredOutput = output.map(row => {
    const filtered: Partial<GoogleRow> = {}
    for (const h of activeHeaders) {
      filtered[h as keyof GoogleRow] = row[h as keyof GoogleRow]
    }
    return filtered
  })

  const csv = Papa.unparse({ fields: activeHeaders, data: filteredOutput })

  return {
    filename: 'google_audience.csv',
    content: csv,
    rowCount: output.length,
  }
}
