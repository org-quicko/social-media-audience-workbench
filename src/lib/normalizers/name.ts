// Split a full name into first and last. First word = first name, rest = last name.
export function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { first_name: parts[0], last_name: '' }
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
}

