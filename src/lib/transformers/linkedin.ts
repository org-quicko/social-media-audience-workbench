import Papa from 'papaparse'
import { CanonicalRow, PlatformFile } from '@/lib/types'
import { normalizeEmail } from '@/lib/normalizers/email'
import { normalizePhone } from '@/lib/normalizers/phone'

// LinkedIn Contact Targeting supported columns
// Ref: https://www.linkedin.com/help/lms/answer/a421822
const LINKEDIN_HEADERS = [
  'email', 'phone', 'firstname', 'lastname', 'jobtitle', 'employeecompany', 'country',
]

type LinkedInRow = {
  email: string
  phone: string
  firstname: string
  lastname: string
  jobtitle: string
  employeecompany: string
  country: string
}

export function transformLinkedIn(rows: CanonicalRow[]): PlatformFile {
  const output: LinkedInRow[] = rows.map(row => ({
    email: row.email ? normalizeEmail(row.email) : '',
    phone: row.phone ? normalizePhone(row.phone) : '',
    firstname: row.first_name?.trim() ?? '',
    lastname: row.last_name?.trim() ?? '',
    jobtitle: row.job_title?.trim() ?? '',
    employeecompany: row.company?.trim() ?? '',
    country: row.country?.trim() ?? '',
  }))

  // Only include columns that have at least one non-empty value
  type LinkedInRowKey = keyof LinkedInRow
  const activeHeaders = LINKEDIN_HEADERS.filter(h =>
    output.some(row => row[h as LinkedInRowKey] !== '')
  )

  const filteredOutput = output.map(row => {
    const filtered: Partial<LinkedInRow> = {}
    for (const h of activeHeaders) {
      filtered[h as LinkedInRowKey] = row[h as LinkedInRowKey]
    }
    return filtered
  })

  const csv = Papa.unparse({ fields: activeHeaders, data: filteredOutput })

  return {
    filename: 'linkedin_audience.csv',
    content: csv,
    rowCount: output.length,
  }
}
