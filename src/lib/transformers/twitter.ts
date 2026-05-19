import { CanonicalRow, PlatformFile } from '@/lib/types'
import { normalizeEmail } from '@/lib/normalizers/email'
import { normalizePhone } from '@/lib/normalizers/phone'
import { toCsv } from '@/lib/transformers/utils'

const TWITTER_HEADERS = ['email', 'phone', 'madid']

export function transformTwitter(rows: CanonicalRow[]): PlatformFile {
  const output: Record<string, string>[] = rows.map(row => ({
    email: row.email ? normalizeEmail(row.email) : '',
    phone: row.phone ? normalizePhone(row.phone).replace(/\s+/g, '') : '',
    madid: row.madid ? row.madid.toLowerCase().trim() : '',
  }))

  return {
    filename: 'twitter_audience.csv',
    content: toCsv(output, TWITTER_HEADERS),
    rowCount: output.length,
  }
}
