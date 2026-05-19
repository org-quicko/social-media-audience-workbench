export function normalizeEmail(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, '')
}
