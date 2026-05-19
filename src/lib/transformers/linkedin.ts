import { CanonicalRow, PlatformFile } from '@/lib/types'
import { normalizeEmail } from '@/lib/normalizers/email'
import { normalizePhone } from '@/lib/normalizers/phone'
import { toCsv } from '@/lib/transformers/utils'

// Ref: https://www.linkedin.com/help/lms/answer/a421822
const LINKEDIN_HEADERS = [
  'email', 'phone', 'firstname', 'lastname', 'jobtitle', 'employeecompany', 'country',
]

export function transformLinkedIn(rows: CanonicalRow[]): PlatformFile {
  const output: Record<string, string>[] = rows.map(row => ({
    email:          row.email ? normalizeEmail(row.email) : '',
    phone:          row.phone ? normalizePhone(row.phone) : '',
    firstname:      row.first_name?.trim() ?? '',
    lastname:       row.last_name?.trim() ?? '',
    jobtitle:       row.job_title?.trim() ?? '',
    employeecompany: row.company?.trim() ?? '',
    country:        row.country?.trim() ?? '',
  }))

  return {
    filename: 'linkedin_audience.csv',
    content: toCsv(output, LINKEDIN_HEADERS),
    rowCount: output.length,
  }
}
