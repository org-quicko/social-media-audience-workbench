// Normalises a phone number to E.164 format.
// Assumes the input already includes a country code (or a leading "00" international prefix).
// Rules:
//   - Strip all non-digit characters except a possible leading "+"
//   - "00" prefix → replace with "+"
//   - If no leading "+" after stripping, prepend "+"
//   - Reject values with fewer than 7 or more than 15 digits (implausible)
export function normalizePhone(value: string): string {
  const trimmed = value.trim()

  // Replace leading "00" international prefix with "+"
  const withPlus = trimmed.startsWith('00')
    ? '+' + trimmed.slice(2)
    : trimmed

  // Strip everything except digits and a leading "+"
  const cleaned = withPlus.replace(/(?!^\+)[^\d]/g, '')

  // Count digits only
  const digits = cleaned.replace(/\D/g, '')

  // Reject implausible lengths
  if (digits.length < 7 || digits.length > 15) return ''

  // Ensure leading "+"
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`
}
