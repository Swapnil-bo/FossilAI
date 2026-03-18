import { useMemo } from 'react'
import { useAnalysisContext } from '../context/AnalysisContext'
import { getLanguageColor } from '../utils/graphHelpers'

// ---------------------------------------------------------------------------
// Severity styling
// ---------------------------------------------------------------------------

const SEVERITY_STYLES = {
  critical: {
    bg: 'bg-severity-critical/10',
    border: 'border-severity-critical/30',
    text: 'text-severity-critical',
    label: 'Critical',
  },
  high: {
    bg: 'bg-severity-high/10',
    border: 'border-severity-high/30',
    text: 'text-severity-high',
    label: 'High',
  },
  medium: {
    bg: 'bg-severity-medium/10',
    border: 'border-severity-medium/30',
    text: 'text-severity-medium',
    label: 'Medium',
  },
  low: {
    bg: 'bg-severity-low/10',
    border: 'border-severity-low/30',
    text: 'text-severity-low',
    label: 'Low',
  },
}

// ---------------------------------------------------------------------------
// Helper: get file extension label
// ---------------------------------------------------------------------------

function getExtLabel(filePath) {
  if (!filePath) return ''
  const ext = filePath.split('.').pop()?.toLowerCase()
  const LABELS = {
    py: 'Python', js: 'JavaScript', jsx: 'React JSX', ts: 'TypeScript', tsx: 'React TSX',
    java: 'Java', go: 'Go', rs: 'Rust', rb: 'Ruby', php: 'PHP', css: 'CSS', html: 'HTML',
    json: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML', md: 'Markdown',
  }
  return LABELS[ext] || ext?.toUpperCase() || ''
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ children }) {
  return (
    <h3 className="text-xs font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider mb-2">
      {children}
    </h3>
  )
}

function FileLink({ filePath }) {
  return (
    <span
      className="text-xs text-accent hover:text-accent-light cursor-pointer truncate block"
      title={filePath}
    >
      {filePath?.split('/').pop() || filePath}
    </span>
  )
}

function TechDebtCard({ item }) {
  const style = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.medium

  return (
    <div className={`rounded-lg border p-3 space-y-1.5 ${style.bg} ${style.border}`}>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${style.text} ${style.bg}`}>
          {style.label}
        </span>
        <span className="text-[10px] text-fossil-500 dark:text-fossil-400 capitalize">
          {item.type?.replace(/_/g, ' ')}
        </span>
      </div>
      <p className="text-xs text-fossil-700 dark:text-fossil-300">{item.description}</p>
      {item.suggested_fix && (
        <div className="pt-1 border-t border-fossil-200 dark:border-fossil-600">
          <p className="text-[10px] text-fossil-500 dark:text-fossil-400">
            <span className="font-semibold">Fix:</span> {item.suggested_fix}
          </p>
        </div>
      )}
    </div>
  )
}

function MiniADRCard({ adr }) {
  const statusColors = {
    accepted: 'bg-severity-low/10 text-severity-low',
    deprecated: 'bg-severity-high/10 text-severity-high',
    superseded: 'bg-severity-medium/10 text-severity-medium',
  }
  const statusClass = statusColors[adr.status] || statusColors.accepted

  return (
    <div className="rounded-lg border border-fossil-200 dark:border-fossil-600 p-3 space-y-1.5 bg-white/50 dark:bg-fossil-700/30">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-fossil-800 dark:text-fossil-200 leading-snug">
          {adr.title}
        </p>
        <span className={`flex-shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${statusClass}`}>
          {adr.status}
        </span>
      </div>
      {adr.decision && (
        <p className="text-[11px] text-fossil-600 dark:text-fossil-400 leading-relaxed line-clamp-2">
          {adr.decision}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main NodeDetail component — renders inline within the sidebar
// ---------------------------------------------------------------------------

export default function NodeDetail({ onClose, onSimulateRefactor }) {
  const { state } = useAnalysisContext()
  const { selectedNode, analysisResult } = state

  const nodeData = selectedNode?.data
  const filePath = nodeData?.filePath || selectedNode?.id || ''
  const langColor = nodeData?.languageColor || getLanguageColor(filePath)
  const langLabel = getExtLabel(filePath)

  // Derive imports (outgoing) and dependents (incoming) from the dependency graph edges
  const { imports, dependents } = useMemo(() => {
    if (!selectedNode || !analysisResult?.dependency_graph?.edges) {
      return { imports: [], dependents: [] }
    }
    const edges = analysisResult.dependency_graph.edges
    const nodeId = selectedNode.id
    return {
      imports: edges.filter((e) => e.source === nodeId).map((e) => ({ id: e.target, type: e.type })),
      dependents: edges.filter((e) => e.target === nodeId).map((e) => ({ id: e.source, type: e.type })),
    }
  }, [selectedNode, analysisResult])

  // Find tech debt items related to this file
  const relatedDebt = useMemo(() => {
    if (!selectedNode || !analysisResult?.tech_debt) return []
    return analysisResult.tech_debt.filter((item) => {
      if (!item.file) return false
      return (
        item.file === filePath || filePath.endsWith(item.file) ||
        item.file.endsWith(filePath) || filePath.includes(item.file) ||
        item.file.includes(filePath)
      )
    })
  }, [selectedNode, analysisResult, filePath])

  // Find ADRs that reference this file
  const relatedADRs = useMemo(() => {
    if (!selectedNode || !analysisResult?.adrs) return []
    const fileName = filePath.split('/').pop() || ''
    const fileNoExt = fileName.replace(/\.[^.]+$/, '')
    return analysisResult.adrs.filter((adr) => {
      const haystack = `${adr.title} ${adr.context} ${adr.decision} ${adr.consequences}`.toLowerCase()
      return (
        haystack.includes(filePath.toLowerCase()) ||
        haystack.includes(fileName.toLowerCase()) ||
        (fileNoExt.length > 3 && haystack.includes(fileNoExt.toLowerCase()))
      )
    })
  }, [selectedNode, analysisResult, filePath])

  if (!selectedNode || !nodeData) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <svg
            className="w-10 h-10 mx-auto text-fossil-400 dark:text-fossil-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
          <p className="text-xs text-fossil-400 dark:text-fossil-500">
            Click a node in the graph to see its details
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-4 pt-3 pb-3 border-b border-fossil-200 dark:border-fossil-700 flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="flex-shrink-0 w-3 h-3 rounded-full"
                style={{ backgroundColor: langColor }}
                title={langLabel}
              />
              <span className="text-[10px] font-medium text-fossil-500 dark:text-fossil-400 uppercase">
                {langLabel}
              </span>
              {nodeData.nodeType && nodeData.nodeType !== 'file' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-semibold uppercase">
                  {nodeData.nodeType}
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-fossil-800 dark:text-fossil-100 break-all leading-snug" title={filePath}>
              {nodeData.label}
            </p>
            <p className="text-[11px] text-fossil-400 dark:text-fossil-500 mt-0.5 break-all">
              {filePath}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1 rounded hover:bg-fossil-200 dark:hover:bg-fossil-600 text-fossil-400 dark:text-fossil-500 hover:text-fossil-600 dark:hover:text-fossil-300 transition-colors"
            title="Deselect node"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Description */}
        {nodeData.description && (
          <div>
            <SectionHeader>Purpose</SectionHeader>
            <p className="text-xs text-fossil-700 dark:text-fossil-300 leading-relaxed">
              {nodeData.description}
            </p>
          </div>
        )}

        {/* Imports */}
        {imports.length > 0 && (
          <div>
            <SectionHeader>Imports ({imports.length})</SectionHeader>
            <div className="space-y-1">
              {imports.map((imp, i) => (
                <div key={`${imp.id}-${i}`} className="flex items-center gap-2">
                  <span
                    className="flex-shrink-0 w-2 h-2 rounded-full"
                    style={{ backgroundColor: getLanguageColor(imp.id) }}
                  />
                  <FileLink filePath={imp.id} />
                  <span className="text-[10px] text-fossil-400 dark:text-fossil-500 capitalize flex-shrink-0">
                    {imp.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dependents */}
        {dependents.length > 0 && (
          <div>
            <SectionHeader>Used by ({dependents.length})</SectionHeader>
            <div className="space-y-1">
              {dependents.map((dep, i) => (
                <div key={`${dep.id}-${i}`} className="flex items-center gap-2">
                  <span
                    className="flex-shrink-0 w-2 h-2 rounded-full"
                    style={{ backgroundColor: getLanguageColor(dep.id) }}
                  />
                  <FileLink filePath={dep.id} />
                  <span className="text-[10px] text-fossil-400 dark:text-fossil-500 capitalize flex-shrink-0">
                    {dep.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {imports.length === 0 && dependents.length === 0 && (
          <div>
            <SectionHeader>Dependencies</SectionHeader>
            <p className="text-xs text-fossil-400 dark:text-fossil-500 italic">
              No dependency relationships found for this node.
            </p>
          </div>
        )}

        {/* Tech Debt */}
        {relatedDebt.length > 0 && (
          <div>
            <SectionHeader>Tech Debt ({relatedDebt.length})</SectionHeader>
            <div className="space-y-2">
              {relatedDebt.map((item, i) => (
                <TechDebtCard key={i} item={item} />
              ))}
            </div>
          </div>
        )}

        {/* Related ADRs */}
        {relatedADRs.length > 0 && (
          <div>
            <SectionHeader>Related Decisions ({relatedADRs.length})</SectionHeader>
            <div className="space-y-2">
              {relatedADRs.map((adr, i) => (
                <MiniADRCard key={i} adr={adr} />
              ))}
            </div>
          </div>
        )}

        {/* Simulate Refactor button */}
        <div className="pt-2">
          <button
            onClick={onSimulateRefactor}
            className="w-full px-4 py-2.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent font-medium text-xs transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Simulate Refactor
          </button>
        </div>
      </div>
    </div>
  )
}
