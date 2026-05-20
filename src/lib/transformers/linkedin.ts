import { CanonicalRow, PlatformFile } from '@/lib/types'
import { normalizeEmail } from '@/lib/normalizers/email'
import { toCsv } from '@/lib/transformers/utils'

// Ref: https://www.linkedin.com/help/lms/answer/a421822
// Phone is NOT a supported identifier for LinkedIn contact targeting — do not include it.
// All eight template headers must always be present even when a column is entirely empty.
const LINKEDIN_HEADERS = [
  'email', 'firstname', 'lastname', 'jobtitle', 'employeecompany', 'country', 'googleaid',
]

export function transformLinkedIn(rows: CanonicalRow[]): PlatformFile {
  const output: Record<string, string>[] = rows.map(row => ({
    email:           row.email ? normalizeEmail(row.email) : '',
    firstname:       row.first_name?.trim() ?? '',
    lastname:        row.last_name?.trim() ?? '',
    jobtitle:        row.job_title?.trim() ?? '',
    employeecompany: row.company?.trim() ?? '',
    country:         row.country?.trim() ?? '',
    googleaid:       row.google_aid?.trim() ?? '',
  }))

  return {
    filename: 'linkedin_audience.csv',
    content: toCsv(output, LINKEDIN_HEADERS, false),
    rowCount: output.length,
  }
}
