import { useState, useRef, useEffect } from 'react'
import { useAnalysisContext } from '../context/AnalysisContext'

// ---------------------------------------------------------------------------
// Status badge styling
// ---------------------------------------------------------------------------

const STATUS_STYLES = {
  accepted: {
    bg: 'bg-severity-low/10',
    text: 'text-severity-low',
    ring: 'ring-severity-low/20',
  },
  deprecated: {
    bg: 'bg-severity-high/10',
    text: 'text-severity-high',
    ring: 'ring-severity-high/20',
  },
  superseded: {
    bg: 'bg-severity-medium/10',
    text: 'text-severity-medium',
    ring: 'ring-severity-medium/20',
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract file-like references from text (e.g. "src/main.py", "config.js") */
function extractFileRefs(text) {
  if (!text) return []
  const re = /(?:^|[\s,;("`'])([a-zA-Z0-9_./\\-]+\.[a-z]{1,5})(?=[\s,;)"`']|$)/g
  const refs = new Set()
  let m
  while ((m = re.exec(text)) !== null) {
    const candidate = m[1]
    // Filter out things that don't look like file paths
    if (
      candidate.includes('/') ||
      /\.(py|js|jsx|ts|tsx|java|go|rs|rb|php|css|html|json|yaml|yml|toml|md)$/.test(candidate)
    ) {
      refs.add(candidate)
    }
  }
  return [...refs]
}

// ---------------------------------------------------------------------------
// ADRCard
// ---------------------------------------------------------------------------

export default function ADRCard({ adr, index, graphNodes }) {
  const [expanded, setExpanded] = useState(false)
  const contentRef = useRef(null)
  const [contentHeight, setContentHeight] = useState(0)
  const { dispatch } = useAnalysisContext()

  // Measure content height for smooth animation
  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight)
    }
  }, [expanded, adr])

  const status = adr.status || 'accepted'
  const style = STATUS_STYLES[status] || STATUS_STYLES.accepted

  // Collect file references from all text fields
  const allText = `${adr.context || ''} ${adr.decision || ''} ${adr.consequences || ''}`
  const fileRefs = extractFileRefs(allText)

  // Find matching graph nodes for file references
  const matchedNodes = fileRefs
    .map((ref) => {
      if (!graphNodes) return null
      return graphNodes.find(
        (n) => n.id === ref || n.id.endsWith(ref) || ref.endsWith(n.id) || n.id.includes(ref),
      )
    })
    .filter(Boolean)

  const handleNodeClick = (node) => {
    dispatch({ type: 'SELECT_NODE', payload: node })
  }

  return (
    <div
      className={`rounded-lg border transition-colors ${
        expanded
          ? 'border-accent/40 bg-white dark:bg-fossil-700/40'
          : 'border-fossil-200 dark:border-fossil-600 bg-white/50 dark:bg-fossil-700/20'
      }`}
    >
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3 flex items-start gap-2 group"
      >
        {/* Expand chevron */}
        <svg
          className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-fossil-400 dark:text-fossil-500 transition-transform duration-200 ${
            expanded ? 'rotate-90' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-fossil-800 dark:text-fossil-200 leading-snug group-hover:text-accent transition-colors">
              <span className="text-fossil-400 dark:text-fossil-500 font-normal mr-1.5">
                #{index + 1}
              </span>
              {adr.title}
            </p>
            <span
              className={`flex-shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ring-1 ${style.bg} ${style.text} ${style.ring}`}
            >
              {status}
            </span>
          </div>
        </div>
      </button>

      {/* Expandable content */}
      <div
        className="overflow-hidden transition-[max-height] duration-250 ease-in-out"
        style={{ maxHeight: expanded ? contentHeight + 'px' : '0px' }}
      >
        <div ref={contentRef} className="px-3 pb-3 space-y-3">
          <div className="border-t border-fossil-200 dark:border-fossil-600 pt-3" />

          {/* Context */}
          {adr.context && (
            <div>
              <p className="text-[10px] font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider mb-1">
                Context
              </p>
              <p className="text-[11px] text-fossil-600 dark:text-fossil-400 leading-relaxed">
                {adr.context}
              </p>
            </div>
          )}

          {/* Decision */}
          {adr.decision && (
            <div>
              <p className="text-[10px] font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider mb-1">
                Decision
              </p>
              <p className="text-[11px] text-fossil-700 dark:text-fossil-300 leading-relaxed">
                {adr.decision}
              </p>
            </div>
          )}

          {/* Consequences */}
          {adr.consequences && (
            <div>
              <p className="text-[10px] font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider mb-1">
                Consequences
              </p>
              <p className="text-[11px] text-fossil-600 dark:text-fossil-400 leading-relaxed">
                {adr.consequences}
              </p>
            </div>
          )}

          {/* Related files — clickable links to graph nodes */}
          {matchedNodes.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider mb-1">
                Related Files
              </p>
              <div className="flex flex-wrap gap-1.5">
                {matchedNodes.map((node) => (
                  <button
                    key={node.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleNodeClick(node)
                    }}
                    className="text-[10px] px-2 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors truncate max-w-[180px]"
                    title={node.id}
                  >
                    {node.data?.label || node.id.split('/').pop()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
