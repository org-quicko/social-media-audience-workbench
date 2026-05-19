export interface CanonicalRow {
  email?: string
  phone?: string
  first_name?: string
  last_name?: string
  city?: string
  state?: string
  country?: string
  zip?: string
  dob?: string
  gender?: string
  job_title?: string
  company?: string
  madid?: string
  google_aid?: string
  isd_code?: string
}

export type PlatformType = 'meta' | 'google' | 'linkedin' | 'twitter'

// Maps a canonical field name to a source CSV column header
export type ColumnMapping = Partial<Record<keyof CanonicalRow, string>>

export interface PlatformFile {
  filename: string
  content: string // CSV string
  rowCount: number
}

