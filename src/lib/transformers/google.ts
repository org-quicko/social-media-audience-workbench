import { CanonicalRow, PlatformFile } from '@/lib/types'
import { normalizeEmail } from '@/lib/normalizers/email'
import { normalizePhone } from '@/lib/normalizers/phone'
import { toCsv } from '@/lib/transformers/utils'

const GOOGLE_HEADERS = ['Email', 'First Name', 'Last Name', 'Country', 'Zip', 'Phone']

export function transformGoogle(rows: CanonicalRow[]): PlatformFile {
  const output: Record<string, string>[] = rows.map(row => ({
    'Email':      row.email ? normalizeEmail(row.email) : '',
    'First Name': row.first_name?.trim() ?? '',
    'Last Name':  row.last_name?.trim() ?? '',
    'Country':    row.country?.trim() ?? '',
    'Zip':        row.zip?.trim() ?? '',
    'Phone':      row.phone ? normalizePhone(row.phone) : '',
  }))

  return {
    filename: 'google_audience.csv',
    content: toCsv(output, GOOGLE_HEADERS),
    rowCount: output.length,
  }
}
