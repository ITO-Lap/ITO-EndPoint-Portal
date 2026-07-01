import { useState } from 'react'
import { FileText, Download, CheckCircle, Loader2 } from 'lucide-react'
import { intelApi } from '../api/intelligence'

type Format = 'csv' | 'excel' | 'pdf' | 'pptx'
type ReportType = 'compliance' | 'inventory'

const REPORT_TYPES = [
  { id: 'compliance', label: 'Compliance Report', description: 'All devices with compliance state, encryption, last sync, and policy assignment.' },
  { id: 'inventory',  label: 'Device Inventory',  description: 'Full hardware and software inventory snapshot across all Intune-managed devices.' },
] as const

const FORMATS: { id: Format; label: string; icon: string; desc: string }[] = [
  { id: 'csv',   label: 'CSV',        icon: '📄', desc: 'Raw data — ideal for Power BI, Excel pivot tables, or custom processing.' },
  { id: 'excel', label: 'Excel',      icon: '📊', desc: 'Formatted workbook with auto-filter headers and colour-coded columns.' },
  { id: 'pdf',   label: 'PDF',        icon: '📑', desc: 'Print-ready report with branded header — great for email attachments.' },
  { id: 'pptx',  label: 'PowerPoint', icon: '📈', desc: 'Executive slide deck with title, KPI summary, and sample data table.' },
]

export function ReportBuilderPage({ onBack }: { onBack: () => void }) {
  const [reportType, setReportType] = useState<ReportType>('compliance')
  const [format, setFormat]         = useState<Format>('pdf')
  const [exporting, setExporting]   = useState(false)
  const [done, setDone]             = useState(false)
  const [errorMsg, setErrorMsg]     = useState<string | null>(null)

  const handleExport = async () => {
    setExporting(true); setDone(false); setErrorMsg(null)
    try {
      await intelApi.export(format, reportType)
      setDone(true)
      setTimeout(() => setDone(false), 3000)
    } catch {
      setErrorMsg('Export failed — ensure Intune credentials are configured.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1 text-sm text-slate-400">
          <button onClick={onBack} className="hover:text-slate-600 transition">← Back</button>
          <span>/</span>
          <span className="text-slate-700 font-medium flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-red-500" /> Report Builder
          </span>
        </div>
        <p className="text-xs text-slate-500">Build and download executive-ready reports directly from live Intune data.</p>
      </div>

      {/* Step 1: Report type */}
      <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">1. Select Report Type</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {REPORT_TYPES.map(rt => (
            <button
              key={rt.id}
              onClick={() => setReportType(rt.id as ReportType)}
              className={`rounded-xl border p-4 text-left transition ${
                reportType === rt.id
                  ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-300'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="text-sm font-semibold text-slate-900 mb-1">{rt.label}</div>
              <p className="text-xs text-slate-500 leading-relaxed">{rt.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Format */}
      <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">2. Choose Export Format</h2>
        <div className="grid grid-cols-2 gap-3">
          {FORMATS.map(f => (
            <button
              key={f.id}
              onClick={() => setFormat(f.id)}
              className={`rounded-xl border p-4 text-left transition ${
                format === f.id
                  ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-300'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="text-xl mb-1">{f.icon}</div>
              <div className="text-sm font-semibold text-slate-900 mb-0.5">{f.label}</div>
              <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Step 3: Generate */}
      <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">3. Generate Report</h2>

        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 mb-4 space-y-1 text-xs text-slate-600">
          <div><span className="font-medium">Report:</span> {REPORT_TYPES.find(r => r.id === reportType)?.label}</div>
          <div><span className="font-medium">Format:</span> {FORMATS.find(f => f.id === format)?.label}</div>
          <div><span className="font-medium">Source:</span> Live Microsoft Graph API (Intune)</div>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 mb-3">
            {errorMsg}
          </div>
        )}

        <button
          onClick={handleExport}
          disabled={exporting}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition ${
            done
              ? 'bg-emerald-500 text-white'
              : 'bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-60'
          }`}
        >
          {exporting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Generating {FORMATS.find(f => f.id === format)?.label}…</>
          ) : done ? (
            <><CheckCircle className="h-4 w-4" /> Downloaded!</>
          ) : (
            <><Download className="h-4 w-4" /> Download {FORMATS.find(f => f.id === format)?.label}</>
          )}
        </button>

        <p className="text-center text-xs text-slate-400 mt-2">
          Reports are generated in real-time from live Intune data and download immediately.
        </p>
      </div>

      {/* Package install hint */}
      <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-4 text-xs text-slate-500">
        <p className="font-medium text-slate-700 mb-1">First-time setup — install export packages</p>
        <code className="block bg-white border border-slate-200 rounded p-2 text-slate-600 font-mono">
          cd server && npm install exceljs pdfkit pptxgenjs
        </code>
        <p className="mt-1.5">CSV export works out of the box. Excel, PDF, and PPTX require the packages above. The server falls back to CSV if they aren't installed.</p>
      </div>
    </div>
  )
}
