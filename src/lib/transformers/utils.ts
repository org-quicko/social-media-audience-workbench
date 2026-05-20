import Papa from 'papaparse'

export function toCsv(rows: Record<string, string>[], headers: string[], dropEmpty = true): string {
  const active = dropEmpty ? headers.filter(h => rows.some(r => r[h] !== '')) : headers
  const data = rows.map(r => Object.fromEntries(active.map(h => [h, r[h] ?? ''])))
  return Papa.unparse({ fields: active, data })
}
