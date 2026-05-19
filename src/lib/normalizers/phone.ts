// 7–15 digit constraint is the E.164 spec limit
export function normalizePhone(value: string): string {
  const trimmed = value.trim()
  const withPlus = trimmed.startsWith('00') ? '+' + trimmed.slice(2) : trimmed
  const cleaned = withPlus.replace(/(?!^\+)[^\d]/g, '')
  const digits = cleaned.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return ''
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`
}
