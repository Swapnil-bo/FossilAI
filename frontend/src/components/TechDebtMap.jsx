import { useState, useMemo } from 'react'
import { useAnalysisContext } from '../context/AnalysisContext'
import { getLanguageColor } from '../utils/graphHelpers'

// ---------------------------------------------------------------------------
// Severity config
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG = {
  critical: { rank: 4, color: '#ef4444', bg: 'bg-severity-critical', label: 'Critical' },
  high:     { rank: 3, color: '#f97316', bg: 'bg-severity-high',     label: 'High' },
  medium:   { rank: 2, color: '#eab308', bg: 'bg-severity-medium',   label: 'Medium' },
  low:      { rank: 1, color: '#22c55e', bg: 'bg-severity-low',      label: 'Low' },
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low']

function getSeverityConfig(severity) {
  return SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.medium
}

// Cell background with opacity based on severity
function getCellStyle(severity) {
  const cfg = getSeverityConfig(severity)
  return {
    backgroundColor: cfg.color,
    opacity: 0.15 + cfg.rank * 0.2, // low=0.35, med=0.55, high=0.75, crit=0.95
  }
}

// Solid border color
function getCellBorderColor(severity) {
  return getSeverityConfig(severity).color
}

// ---------------------------------------------------------------------------
// Sort options
// ---------------------------------------------------------------------------

const SORT_OPTIONS = [
  { value: 'severity', label: 'Severity' },
  { value: 'file', label: 'File path' },
]

// ---------------------------------------------------------------------------
// Summary stats bar
// ---------------------------------------------------------------------------

function SummaryStats({ techDebt }) {
  const counts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const item of techDebt) {
      if (c[item.severity] !== undefined) c[item.severity]++
    }
    return c
  }, [techDebt])

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {SEVERITY_ORDER.map((sev) => {
        const cfg = SEVERITY_CONFIG[sev]
        const count = counts[sev]
        if (count === 0) return null
        return (
          <span
            key={sev}
            className="flex items-center gap-1 text-[10px] font-medium"
          >
            <span
              className="w-2 h-2 rounded-sm flex-shrink-0"
              style={{ backgroundColor: cfg.color }}
            />
            <span className="text-fossil-600 dark:text-fossil-300">
              {count} {cfg.label.toLowerCase()}
            </span>
          </span>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

function Tooltip({ item, position }) {
  if (!item) return null

  const cfg = getSeverityConfig(item.severity)

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left: position.x, top: position.y }}
    >
      <div className="bg-fossil-800 dark:bg-fossil-700 text-white rounded-lg shadow-xl px-3 py-2.5 max-w-[260px] -translate-x-1/2 -translate-y-full -mt-2">
        {/* Arrow */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-fossil-800 dark:border-t-fossil-700" />

        <p className="text-[10px] text-fossil-400 truncate mb-1">{item.file}</p>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
            style={{ backgroundColor: cfg.color + '22', color: cfg.color }}
          >
            {cfg.label}
          </span>
          <span className="text-[10px] text-fossil-300 capitalize">
            {item.type?.replace(/_/g, ' ')}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-fossil-200">
          {item.description}
        </p>
        {item.suggested_fix && (
          <p className="text-[10px] text-fossil-400 mt-1.5 pt-1.5 border-t border-fossil-600">
            <span className="font-semibold text-fossil-300">Fix:</span> {item.suggested_fix}
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Heatmap cell
// ---------------------------------------------------------------------------

function HeatmapCell({ item, graphNodes, onHover, onLeave }) {
  const { dispatch } = useAnalysisContext()
  const fileName = item.file?.split('/').pop() || item.file
  const langColor = getLanguageColor(item.file)

  const handleClick = () => {
    // Find matching graph node to dispatch SELECT_NODE
    const matchedNode = graphNodes?.find(
      (n) =>
        n.id === item.file ||
        n.id.endsWith(item.file) ||
        item.file.endsWith(n.id) ||
        n.id.includes(item.file) ||
        item.file.includes(n.id),
    )

    if (matchedNode) {
      dispatch({
        type: 'SELECT_NODE',
        payload: {
          id: matchedNode.id,
          data: {
            label: matchedNode.label || matchedNode.id.split('/').pop(),
            filePath: matchedNode.id,
            nodeType: matchedNode.type || 'file',
            description: matchedNode.description || '',
            languageColor: getLanguageColor(matchedNode.id),
          },
        },
      })
    }
  }

  const handleMouseEnter = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onHover(item, { x: rect.left + rect.width / 2, y: rect.top })
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onLeave}
      className="relative rounded-md border-2 p-2 text-left transition-all hover:scale-105 hover:shadow-md cursor-pointer group overflow-hidden"
      style={{ borderColor: getCellBorderColor(item.severity) }}
      title={item.file}
    >
      {/* Severity background fill */}
      <div
        className="absolute inset-0 rounded-[4px]"
        style={getCellStyle(item.severity)}
      />

      {/* Content */}
      <div className="relative z-10">
        <div className="flex items-center gap-1 mb-0.5">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: langColor }}
          />
          <p className="text-[10px] font-semibold text-fossil-800 dark:text-fossil-100 truncate">
            {fileName}
          </p>
        </div>
        <p className="text-[9px] text-fossil-600 dark:text-fossil-400 capitalize truncate">
          {item.type?.replace(/_/g, ' ')}
        </p>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center space-y-2">
        <svg
          className="w-10 h-10 mx-auto text-severity-low"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-xs font-medium text-severity-low">
          No tech debt detected
        </p>
        <p className="text-[10px] text-fossil-400 dark:text-fossil-500">
          This codebase is pristine!
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main TechDebtMap component
// ---------------------------------------------------------------------------

export default function TechDebtMap() {
  const { state } = useAnalysisContext()
  const [sortBy, setSortBy] = useState('severity')
  const [tooltip, setTooltip] = useState({ item: null, position: { x: 0, y: 0 } })

  const techDebt = state.analysisResult?.tech_debt || []
  const graphNodes = state.analysisResult?.dependency_graph?.nodes || []

  // Sort
  const sorted = useMemo(() => {
    const copy = [...techDebt]
    if (sortBy === 'severity') {
      copy.sort((a, b) => {
        const ra = getSeverityConfig(a.severity).rank
        const rb = getSeverityConfig(b.severity).rank
        return rb - ra // worst first
      })
    } else {
      copy.sort((a, b) => (a.file || '').localeCompare(b.file || ''))
    }
    return copy
  }, [techDebt, sortBy])

  const handleHover = (item, position) => setTooltip({ item, position })
  const handleLeave = () => setTooltip({ item: null, position: { x: 0, y: 0 } })

  if (techDebt.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider">
            Tech Debt
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-semibold">
            {techDebt.length} issue{techDebt.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Summary breakdown */}
        <SummaryStats techDebt={techDebt} />

        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-fossil-400 dark:text-fossil-500">Sort:</span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                sortBy === opt.value
                  ? 'bg-accent/10 text-accent font-semibold'
                  : 'text-fossil-500 dark:text-fossil-400 hover:text-fossil-700 dark:hover:text-fossil-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Heatmap grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid grid-cols-2 gap-2">
          {sorted.map((item, i) => (
            <HeatmapCell
              key={`${item.file}-${item.type}-${i}`}
              item={item}
              graphNodes={graphNodes}
              onHover={handleHover}
              onLeave={handleLeave}
            />
          ))}
        </div>
      </div>

      {/* Tooltip */}
      <Tooltip item={tooltip.item} position={tooltip.position} />
    </div>
  )
}
