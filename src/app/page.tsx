'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Papa from 'papaparse'
import JSZip from 'jszip'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select'
import { Upload, UsersRound, Download, Loader2, X, Search, TriangleAlert } from 'lucide-react'
import { CanonicalRow, ColumnMapping, PlatformFile, PlatformType } from '@/lib/types'
import {
  detectJsonColumns, buildSourceColumns, autoDetectMapping, parseGenericRow,
} from '@/lib/parsers/generic'
import { transformMeta } from '@/lib/transformers/meta'
import { transformGoogle } from '@/lib/transformers/google'
import { transformLinkedIn } from '@/lib/transformers/linkedin'
import { transformTwitter } from '@/lib/transformers/twitter'

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'workbench_csv_v2'
const PREVIEW_LIMIT = 5_000
const DISPLAY_PAGE = 500
const MAX_DISPLAY_ROWS = 20_000
const JSON_DETECT_SAMPLE = 500

/**
 * Maximum rows per downloaded file for each platform.
 * When canonicalRows exceeds the limit the export is automatically split
 * into numbered files and bundled into a ZIP.
 *
 * Sources:
 *   LinkedIn – 300 000 rows/file — documented hard limit in Ads Manager
 *   Meta     – no documented per-file row limit; set to Infinity (no split)
 *   Google   – no documented per-file row limit; set to Infinity (no split)
 *   Twitter  – no documented per-file row limit; set to Infinity (no split)
 */
const PLATFORM_ROW_LIMIT: Record<PlatformType, number> = {
  linkedin: 300_000,
  meta: Infinity,
  google: Infinity,
  twitter: Infinity,
}

/**
 * Minimum rows required for an audience file to be usable on each platform.
 * Files below this threshold will be accepted for upload but will not serve.
 *
 * Sources (verified May 2026):
 *   Meta     – 100 members  https://www.facebook.com/business/help/341425252616329
 *   Google   – 100 members  https://support.google.com/google-ads/answer/6379332
 *   LinkedIn – 300 rows     https://www.linkedin.com/help/lms/answer/a1489764
 *   Twitter  – 100 users    https://business.x.com/en/help/campaign-setup/campaign-targeting/tailored-audiences/ta-from-lists.html
 */
const PLATFORM_MIN_ROWS: Record<PlatformType, number> = {
  meta: 100,
  google: 100,
  linkedin: 300,
  twitter: 100,
}

const PLATFORMS: Array<{ value: PlatformType; label: string; logo: string }> = [
  {
    value: 'meta',
    label: 'Meta Ads',
    logo: 'https://cdn.brandfetch.io/idWvz5T3V7/w/400/h/400/theme/dark/icon.png?c=1bxid64Mup7aczewSAYMX&t=1691142640809',
  },
  {
    value: 'google',
    label: 'Google Ads',
    logo: 'https://cdn.brandfetch.io/id6O2oGzv-/w/800/h/998/theme/dark/idhg2vnQYV.png?c=1bxid64Mup7aczewSAYMX&t=1755572763029',
  },
  {
    value: 'twitter',
    label: 'X (Twitter) Ads',
    logo: 'https://cdn.brandfetch.io/idS5WhqBbM/w/400/h/400/theme/dark/icon.jpeg?c=1bxid64Mup7aczewSAYMX&t=1768324401335',
  },
  {
    value: 'linkedin',
    label: 'LinkedIn Ads',
    logo: 'https://cdn.brandfetch.io/idJFz6sAsl/w/400/h/400/theme/dark/icon.png?c=1bxid64Mup7aczewSAYMX&t=1748592533197',
  },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface CsvData {
  mapping: ColumnMapping
  headers: string[]
  previewRawRows: Record<string, string>[]
  canonicalRows: CanonicalRow[]
  rowCount: number
  fileName: string
  sizeBytes: number
}

interface TableDisplay {
  headers: string[]
  rows: Record<string, string>[]
  loadedUpto: number
  hasMore: boolean
}

type UploadState =
  | { status: 'idle' }
  | { status: 'reading'; label: string }
  | { status: 'loaded'; data: CsvData }
  | { status: 'error'; message: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assert(condition: unknown, msg?: string): asserts condition {
  if (!condition) throw new Error(msg ?? 'Assertion failed')
}

function transformFor(platform: PlatformType, rows: CanonicalRow[]): PlatformFile {
  if (platform === 'meta') return transformMeta(rows)
  if (platform === 'google') return transformGoogle(rows)
  if (platform === 'linkedin') return transformLinkedIn(rows)
  if (platform === 'twitter') return transformTwitter(rows)
  throw new Error(`Unknown platform: ${platform}`)
}

function platformCsvToRows(
  csvContent: string,
  headers: string[],
): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true, skipEmptyLines: true,
  })
  return parsed.data.map(row => {
    const mapped: Record<string, string> = {}
    for (const h of headers) mapped[h] = row[h] ?? ''
    return mapped
  })
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function downloadZipFiles(
  files: Array<{ filename: string; content: string }>,
  zipName: string,
) {
  const zip = new JSZip()
  for (const f of files) zip.file(f.filename, f.content)
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = zipName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function computeInitialDisplay(data: CsvData, platform: PlatformType | null): TableDisplay {
  const totalSource = platform !== null ? data.canonicalRows.length : data.previewRawRows.length
  const to = Math.min(DISPLAY_PAGE, totalSource, MAX_DISPLAY_ROWS)

  if (platform === null) {
    return {
      headers: data.headers,
      rows: data.previewRawRows.slice(0, to),
      loadedUpto: to,
      hasMore: to < Math.min(totalSource, MAX_DISPLAY_ROWS),
    }
  }

  const file = transformFor(platform, data.canonicalRows.slice(0, to))
  const parsed = Papa.parse<Record<string, string>>(file.content, {
    header: true, skipEmptyLines: true,
  })
  return {
    headers: parsed.meta.fields!,
    rows: parsed.data as Record<string, string>[],
    loadedUpto: to,
    hasMore: to < Math.min(totalSource, MAX_DISPLAY_ROWS),
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [upload, setUpload] = useState<UploadState>({ status: 'idle' })
  const [platform, setPlatform] = useState<PlatformType | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [tableDisplay, setTableDisplay] = useState<TableDisplay>({
    headers: [], rows: [], loadedUpto: 0, hasMore: false,
  })
  const [isDisplayLoading, setIsDisplayLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [colWidths, setColWidths] = useState<Record<string, number>>({})
  const colRefs = useRef<Array<HTMLTableColElement | null>>([])
  const resizeDrag = useRef<{ header: string; colIndex: number; startX: number; startWidth: number; currentWidth: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Stable reference: null while not loaded, same object reference while loaded
  const uploadData = upload.status === 'loaded' ? upload.data : null

  // ── Restore from localStorage on mount ────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return
    let saved: { rawText: string; fileName: string; sizeBytes: number; mapping: ColumnMapping }
    try {
      saved = JSON.parse(stored)
    } catch {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    const result = Papa.parse<Record<string, string>>(saved.rawText, {
      header: true, skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
    })
    if (!result.data.length || !result.meta.fields) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    const headers = result.meta.fields
    const canonicalRows = result.data.map(row => parseGenericRow(row, saved.mapping))
    setUpload({
      status: 'loaded',
      data: {
        mapping: saved.mapping, headers,
        previewRawRows: result.data.slice(0, PREVIEW_LIMIT),
        canonicalRows,
        rowCount: result.data.length,
        fileName: saved.fileName,
        sizeBytes: saved.sizeBytes,
      },
    })
  }, [])

  // ── Reset search when data or platform changes ─────────────────────────────
  useEffect(() => { setSearchInput(''); setSearchQuery('') }, [uploadData, platform])

  // ── Debounce search (250 ms) ───────────────────────────────────────────────
  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(searchInput), 250)
    return () => clearTimeout(id)
  }, [searchInput])

  // ── Reset column widths when displayed headers change ─────────────────────
  useEffect(() => { setColWidths({}) }, [tableDisplay.headers])

  // ── Column resize — bypass React during drag for zero-lag response ─────────
  // onMove writes directly to the <col> DOM node; onUp commits once to state.
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const drag = resizeDrag.current
      if (!drag) return
      const newWidth = Math.max(60, drag.startWidth + (e.clientX - drag.startX))
      drag.currentWidth = newWidth
      const col = colRefs.current[drag.colIndex]
      if (col) col.style.width = `${newWidth}px`
    }
    function onUp() {
      const drag = resizeDrag.current
      if (!drag) return
      setColWidths(prev => ({ ...prev, [drag.header]: drag.currentWidth }))
      resizeDrag.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  // ── Recompute display when data or platform changes ────────────────────────
  // Depends on uploadData (stable ref) not upload, so label updates don't re-fire.
  useEffect(() => {
    if (!uploadData) {
      setTableDisplay({ headers: [], rows: [], loadedUpto: 0, hasMore: false })
      setIsDisplayLoading(false)
      return
    }
    setIsDisplayLoading(true)
    // One frame so the spinner paints before the compute blocks the thread
    const id = setTimeout(() => {
      try {
        setTableDisplay(computeInitialDisplay(uploadData, platform))
      } finally {
        setIsDisplayLoading(false)
      }
    }, 16)
    return () => { clearTimeout(id) }
  }, [uploadData, platform])

  // ── When search activates, eagerly fill to MAX_DISPLAY_ROWS ───────────────
  useEffect(() => {
    if (!searchQuery || !uploadData || !tableDisplay.hasMore) return
    setTableDisplay(prev => {
      if (!prev.hasMore) return prev
      const totalSource = platform !== null ? uploadData.canonicalRows.length : uploadData.previewRawRows.length
      const displayMax = Math.min(totalSource, MAX_DISPLAY_ROWS)
      const from = prev.loadedUpto
      if (platform === null) {
        return { ...prev, rows: [...prev.rows, ...uploadData.previewRawRows.slice(from, displayMax)], loadedUpto: displayMax, hasMore: false }
      }
      const file = transformFor(platform, uploadData.canonicalRows.slice(from, displayMax))
      return { ...prev, rows: [...prev.rows, ...platformCsvToRows(file.content, prev.headers)], loadedUpto: displayMax, hasMore: false }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  // ── Filtered rows (derived — no extra state) ───────────────────────────────
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return tableDisplay.rows
    const q = searchQuery.toLowerCase()
    return tableDisplay.rows.filter(row =>
      tableDisplay.headers.some(h => row[h]?.toLowerCase().includes(q))
    )
  }, [searchQuery, tableDisplay.rows, tableDisplay.headers])

  function handleScroll(e: React.UIEvent<HTMLElement>) {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) loadMoreRows()
  }

  function loadMoreRows() {
    if (!uploadData) return
    setTableDisplay(prev => {
      if (!prev.hasMore) return prev
      const totalSource = platform !== null ? uploadData.canonicalRows.length : uploadData.previewRawRows.length
      const displayMax = Math.min(totalSource, MAX_DISPLAY_ROWS)
      const from = prev.loadedUpto
      if (from >= displayMax) return { ...prev, hasMore: false }
      const to = Math.min(from + DISPLAY_PAGE, displayMax)
      if (platform === null) {
        return { ...prev, rows: [...prev.rows, ...uploadData.previewRawRows.slice(from, to)], loadedUpto: to, hasMore: to < displayMax }
      }
      const file = transformFor(platform, uploadData.canonicalRows.slice(from, to))
      return { ...prev, rows: [...prev.rows, ...platformCsvToRows(file.content, prev.headers)], loadedUpto: to, hasMore: to < displayMax }
    })
  }

  // ── File loading (streaming) ───────────────────────────────────────────────
  function loadFile(file: File) {
    setUpload({ status: 'reading', label: 'Reading file…' })
    setPlatform(null)

    let headers: string[] = []
    let fieldMap: Map<string, string> | null = null
    let mapping: ColumnMapping = {}
    let setupDone = false
    const sampleBuffer: Record<string, string>[] = []
    const canonicalRows: CanonicalRow[] = []
    const previewRawRows: Record<string, string>[] = []
    let progressTick = 0

    function applySetup(rows: Record<string, string>[]) {
      const jsonCols = detectJsonColumns(headers, rows)
      mapping = autoDetectMapping(buildSourceColumns(headers, jsonCols))
      setupDone = true
    }

    function processRow(row: Record<string, string>) {
      if (previewRawRows.length < PREVIEW_LIMIT) previewRawRows.push(row)
      canonicalRows.push(parseGenericRow(row, mapping))
    }

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      step: (result) => {
        if (headers.length === 0) {
          const rawFields = result.meta.fields!
          headers = rawFields.map(h => h.trim())
          const needsRemap = rawFields.some((raw, i) => raw !== headers[i])
          if (needsRemap) fieldMap = new Map(rawFields.map((raw, i) => [raw, headers[i]]))
        }

        const rawRow = result.data as unknown as Record<string, string>
        const row = fieldMap
          ? Object.fromEntries(Object.entries(rawRow).map(([k, v]) => [fieldMap!.get(k) ?? k, v]))
          : rawRow

        if (!setupDone) {
          sampleBuffer.push(row)
          if (sampleBuffer.length >= JSON_DETECT_SAMPLE) {
            applySetup(sampleBuffer)
            for (const r of sampleBuffer) processRow(r)
            sampleBuffer.length = 0
          }
          return
        }

        processRow(row)

        progressTick++
        if (progressTick % 100_000 === 0) {
          setUpload({ status: 'reading', label: `Reading file… ${progressTick.toLocaleString()} rows` })
        }
      },
      complete: () => {
        if (!setupDone && sampleBuffer.length > 0) {
          applySetup(sampleBuffer)
          for (const r of sampleBuffer) processRow(r)
        }

        if (canonicalRows.length === 0) {
          setUpload({ status: 'error', message: 'The file could not be parsed. Check that it is a valid CSV with headers.' })
          return
        }

        const data: CsvData = {
          mapping, headers,
          previewRawRows, canonicalRows,
          rowCount: canonicalRows.length,
          fileName: file.name,
          sizeBytes: file.size,
        }
        setUpload({ status: 'loaded', data })

        if (file.size < 10 * 1024 * 1024) {
          const reader = new FileReader()
          reader.onload = e => {
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify({
                rawText: (e.target as FileReader).result as string,
                fileName: file.name,
                sizeBytes: file.size,
                mapping,
              }))
            } catch { /* quota exceeded */ }
          }
          reader.readAsText(file)
        }
      },
      error: (err) => {
        setUpload({ status: 'error', message: `Failed to read the file: ${err.message}` })
      },
    })
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) loadFile(f)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) loadFile(f)
  }

  // ── Export with automatic file splitting ───────────────────────────────────
  async function handleExport() {
    assert(uploadData !== null && platform !== null)
    setIsExporting(true)
    await new Promise(r => setTimeout(r, 0))
    try {
      const chunks = chunk(uploadData.canonicalRows, PLATFORM_ROW_LIMIT[platform])
      if (chunks.length === 1) {
        const file = transformFor(platform, chunks[0])
        downloadFile(file.content, file.filename)
      } else {
        const file0 = transformFor(platform, chunks[0])
        const base = file0.filename.replace('.csv', '')
        const files = [
          { filename: `${base}_1.csv`, content: file0.content },
          ...chunks.slice(1).map((c, i) => {
            const f = transformFor(platform, c)
            return { filename: `${base}_${i + 2}.csv`, content: f.content }
          }),
        ]
        await downloadZipFiles(files, `${base}.zip`)
      }
    } finally {
      setIsExporting(false)
    }
  }

  function clearData() {
    setUpload({ status: 'idle' })
    setPlatform(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  // ─── Derived render values ─────────────────────────────────────────────────

  const selectedPlatform = platform !== null ? PLATFORMS.find(p => p.value === platform)! : null
  const totalSource = uploadData
    ? (platform !== null ? uploadData.canonicalRows.length : uploadData.rowCount)
    : 0
  const atDisplayCap = tableDisplay.loadedUpto >= MAX_DISPLAY_ROWS && MAX_DISPLAY_ROWS < totalSource
  const rawViewCapped = !!uploadData && platform === null && !tableDisplay.hasMore && uploadData.rowCount > PREVIEW_LIMIT
  const minRows = platform !== null ? PLATFORM_MIN_ROWS[platform] : 0
  const belowMinimum = !!uploadData && platform !== null && uploadData.canonicalRows.length < minRows
  const missingIdentifiers = useMemo(() => {
    if (!uploadData) return false
    const sample = uploadData.canonicalRows.slice(0, 1000)
    return !sample.some(row => row.email || row.phone || row.first_name || row.last_name)
  }, [uploadData])

  let exportLabel = 'Export CSV'
  if (isExporting) {
    exportLabel = 'Exporting…'
  } else if (uploadData && platform !== null) {
    const chunks = Math.ceil(uploadData.canonicalRows.length / PLATFORM_ROW_LIMIT[platform])
    if (chunks > 1) exportLabel = `Export ${chunks} files`
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-[#f5f5f5]">
      {/* Always-mounted file input — opacity hiding so .click() works in Electron */}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="fixed opacity-0 w-0 h-0 overflow-hidden pointer-events-none"
        onChange={handleInputChange}
      />

      {/* ── Loading ── */}
      {upload.status === 'reading' && (
        <>
          <header className="bg-white border-b border-border px-6 h-14 flex items-center">
            <span className="text-sm font-semibold text-[#111827]">Social Media Audience Workbench</span>
          </header>
          <main className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-7 h-7 text-[#9ca3af] animate-spin" />
            <p className="text-[13px] text-[#6b7280]">{upload.label}</p>
          </main>
        </>
      )}

      {/* ── Idle / error ── */}
      {(upload.status === 'idle' || upload.status === 'error') && (
        <>
          <header className="bg-white border-b border-border px-6 h-14 flex items-center">
            <span className="text-sm font-semibold text-[#111827]">Social Media Audience Workbench</span>
          </header>
          <main
            className="flex-1 flex flex-col items-center justify-center gap-5"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
          >
            {upload.status === 'error' ? (
              <div className="flex flex-col items-center gap-4 text-center max-w-sm">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                  <X className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="font-semibold text-[15px] text-[#111827]">Could not read file</p>
                  <p className="text-[13px] text-[#6b7280] mt-1">{upload.message}</p>
                </div>
                <Button
                  onClick={() => { setUpload({ status: 'idle' }); inputRef.current?.click() }}
                  className="gap-2 mt-1 bg-[#111827] hover:bg-[#1f2937] text-white text-[13px] h-9 px-4 rounded-lg"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Try another file
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 text-center">
                <UsersRound className="w-12 h-12 text-[#9ca3af]" strokeWidth={1.25} />
                <div>
                  <p className="font-semibold text-[15px] text-[#111827]">Upload a CSV to get started</p>
                  <p className="text-[13px] text-[#6b7280] mt-1">
                    Supports any customer data CSV — drag and drop or browse
                  </p>
                </div>
                <Button
                  onClick={() => inputRef.current?.click()}
                  className="gap-2 mt-1 bg-[#111827] hover:bg-[#1f2937] text-white text-[13px] h-9 px-4 rounded-lg"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload CSV
                </Button>
              </div>
            )}
          </main>
        </>
      )}

      {/* ── Data loaded ── */}
      {uploadData && (
        <>
        {/* Header */}
        <header className="bg-white border-b border-border px-6 h-14 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              onClick={clearData}
              className="text-sm font-semibold text-[#111827] hover:text-[#374151] transition-colors"
            >
              Social Media Audience Workbench
            </button>
            <span className="text-[#d1d5db]">/</span>
            <span className="text-sm text-[#6b7280]">{uploadData.fileName}</span>
            <span className="text-[12px] text-[#9ca3af] tabular-nums">
              {uploadData.rowCount.toLocaleString()} rows · {uploadData.headers.length} columns
            </span>
            <button
              onClick={() => inputRef.current?.click()}
              className="text-[12px] text-[#9ca3af] hover:text-[#374151] underline underline-offset-2 transition-colors ml-1"
            >
              Upload new
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center">
              <Select value={platform ?? ''} onValueChange={v => setPlatform(v as PlatformType)}>
                <SelectTrigger className="w-48 h-9 text-[13px] border-[#e5e7eb] text-[#374151] rounded-r-none border-r-0">
                  {platform !== null && selectedPlatform ? (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={selectedPlatform.logo} alt={selectedPlatform.label} width={14} height={14} className="shrink-0" />
                      <span>{selectedPlatform.label}</span>
                    </div>
                  ) : (
                    <span className="text-[#9ca3af]">Choose platform</span>
                  )}
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => (
                    <SelectItem key={p.value} value={p.value} className="text-[13px]">
                      <div className="flex items-center gap-2.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.logo} alt={p.label} width={14} height={14} className="shrink-0" />
                        <span>{p.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                onClick={() => setPlatform(null)}
                className={[
                  'h-9 w-9 flex items-center justify-center border border-[#e5e7eb] rounded-r-md transition-colors shrink-0',
                  platform !== null
                    ? 'text-[#6b7280] hover:text-[#111827] hover:bg-[#f9fafb] bg-white'
                    : 'text-[#d1d5db] bg-[#f9fafb] cursor-default pointer-events-none',
                ].join(' ')}
                title="Clear platform selection"
                disabled={platform === null}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <Button
              size="sm"
              className="gap-1.5 h-9 text-[13px] bg-[#111827] hover:bg-[#1f2937] text-white px-3.5 rounded-lg"
              onClick={handleExport}
              disabled={platform === null || isExporting}
            >
              {isExporting ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" />Exporting…</>
              ) : (
                <><Download className="w-3.5 h-3.5" />{exportLabel}</>
              )}
            </Button>
          </div>
        </header>

        {/* Search toolbar */}
        <div className="bg-white border-b border-[#e5e7eb] px-4 py-2 shrink-0 flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9ca3af] pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search rows…"
              className="w-full h-8 pl-8 pr-8 text-[13px] border border-[#e5e7eb] rounded-md bg-[#f9fafb] text-[#374151] placeholder:text-[#9ca3af] focus:outline-none focus:ring-1 focus:ring-[#111827] focus:border-[#111827]"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151]"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {searchQuery && (
            <span className="text-[12px] text-[#6b7280] tabular-nums shrink-0">
              {filteredRows.length.toLocaleString()} {filteredRows.length === 1 ? 'match' : 'matches'}
              {tableDisplay.hasMore && ' (loading…)'}
            </span>
          )}
        </div>

        {/* Table */}
        <main className="flex-1 overflow-auto relative" onScroll={handleScroll}>
          {isDisplayLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[#f5f5f5]">
              <Loader2 className="w-6 h-6 text-[#9ca3af] animate-spin" />
            </div>
          ) : (
            <>
              {missingIdentifiers && (
                <div className="sticky top-0 z-20 bg-[#fffbeb] border-b border-[#fcd34d] px-4 py-2 text-[12px] text-[#92400e] flex items-center gap-2">
                  <TriangleAlert className="w-3.5 h-3.5 shrink-0" />
                  No email, phone, or name columns were detected. Ad platforms need at least one identifier to match users — check that your CSV has clearly labelled column headers.
                </div>
              )}
              {belowMinimum && (
                <div className="sticky top-0 z-20 bg-[#fffbeb] border-b border-[#fcd34d] px-4 py-2 text-[12px] text-[#92400e]">
                  {selectedPlatform!.label} requires a minimum of {minRows.toLocaleString()} rows per audience file — this file has only {uploadData.canonicalRows.length.toLocaleString()} {uploadData.canonicalRows.length === 1 ? 'row' : 'rows'} and the audience will not serve.
                </div>
              )}
              {platform === 'twitter' && (
                <div className="sticky top-0 z-20 bg-[#f0f9ff] border-b border-[#bae6fd] px-4 py-2 text-[12px] text-[#0369a1]">
                  X (Twitter) Ads accepts all identifier types in one file. During upload you&rsquo;ll map each column to its type (Email Address, Phone Number, Mobile Ad ID) — select <em>Do not upload data</em> for any column you want to skip.
                </div>
              )}
              <table className="border-collapse" style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
                <colgroup>
                  <col style={{ width: 40 }} />
                  {tableDisplay.headers.map((h, i) => (
                    <col
                      key={h}
                      ref={el => { colRefs.current[i] = el }}
                      style={{ width: colWidths[h] ?? 180 }}
                    />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#f0f0f0] border-b border-[#e5e7eb]">
                    <th className="text-left px-4 py-2.5 text-[11px] font-medium text-[#9ca3af] border-r border-[#e5e7eb]/60 select-none">#</th>
                    {tableDisplay.headers.map((h, i) => {
                      const w = colWidths[h] ?? 180
                      return (
                        <th
                          key={h}
                          className="text-left px-4 py-2.5 text-[11px] font-medium text-[#6b7280] whitespace-nowrap border-r border-[#e5e7eb]/60 last:border-r-0 relative select-none overflow-hidden"
                        >
                          <span className="block truncate">{h}</span>
                          <div
                            className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-[#111827]/15 active:bg-[#111827]/25"
                            onPointerDown={e => {
                              e.preventDefault()
                              resizeDrag.current = { header: h, colIndex: i, startX: e.clientX, startWidth: w, currentWidth: w }
                              ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
                            }}
                          />
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => (
                    <tr key={i} className="border-b border-[#f3f4f6] hover:bg-white transition-colors">
                      <td className="px-4 py-2 text-[11px] text-[#9ca3af] tabular-nums border-r border-[#e5e7eb]/60 select-none overflow-hidden">{i + 1}</td>
                      {tableDisplay.headers.map(h => (
                        <td
                          key={h}
                          className="px-4 py-2 text-[13px] text-[#374151] whitespace-nowrap border-r border-[#e5e7eb]/60 last:border-r-0 overflow-hidden"
                          title={row[h]}
                        >
                          <span className="block truncate">{row[h] || <span className="text-[#d1d5db]">—</span>}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!searchQuery && (tableDisplay.hasMore || atDisplayCap || rawViewCapped) && (
                    <tr>
                      <td
                        colSpan={(tableDisplay.headers.length || 1) + 1}
                        className="px-4 py-3 text-center text-[12px] text-[#9ca3af]"
                      >
                        {tableDisplay.hasMore
                          ? 'Scroll to load more…'
                          : rawViewCapped
                          ? `Raw view shows first ${PREVIEW_LIMIT.toLocaleString()} of ${uploadData.rowCount.toLocaleString()} rows — select a platform above to preview and export all rows`
                          : `Showing ${MAX_DISPLAY_ROWS.toLocaleString()} of ${uploadData.rowCount.toLocaleString()} rows — export includes all`}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </main>
        </>
      )}
    </div>
  )
}
