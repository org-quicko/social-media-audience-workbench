const EMPTY_VALUES = new Set([
  'unknown', 'null', 'n/a', 'none', 'na', '-', '--', 'undefined', 'nil', 'not available',
])

export function sanitize(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  if (EMPTY_VALUES.has(trimmed.toLowerCase())) return undefined
  return trimmed
}
