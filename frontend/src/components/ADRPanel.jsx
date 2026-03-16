import { useState, useMemo } from 'react'
import { useAnalysisContext } from '../context/AnalysisContext'
import ADRCard from './ADRCard'

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'status', label: 'Status' },
]

const STATUS_ORDER = { deprecated: 0, superseded: 1, accepted: 2 }

export default function ADRPanel() {
  const { state } = useAnalysisContext()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('relevance')

  const adrs = state.analysisResult?.adrs || []
  const graphNodes = state.analysisResult?.dependency_graph?.nodes || []

  // Build React Flow-shaped node objects so ADRCard can dispatch SELECT_NODE
  const rfNodes = useMemo(
    () =>
      graphNodes.map((n) => ({
        id: n.id,
        data: {
          label: n.label || n.id.split('/').pop(),
          filePath: n.id,
          nodeType: n.type || 'file',
          description: n.description || '',
        },
      })),
    [graphNodes],
  )

  // Filter
  const filtered = useMemo(() => {
    if (!search.trim()) return adrs
    const q = search.toLowerCase()
    return adrs.filter((adr) => {
      const haystack =
        `${adr.title} ${adr.context} ${adr.decision} ${adr.consequences} ${adr.status}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [adrs, search])

  // Sort
  const sorted = useMemo(() => {
    const copy = [...filtered]
    if (sortBy === 'status') {
      copy.sort(
        (a, b) =>
          (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99),
      )
    }
    // 'relevance' = original order from Gemini/Groq
    return copy
  }, [filtered, sortBy])

  if (adrs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <svg
            className="w-10 h-10 mx-auto text-fossil-400 dark:text-fossil-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-xs text-fossil-400 dark:text-fossil-500">
            No architectural decisions found
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header with count */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider">
            Decisions
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-semibold">
            {filtered.length}{filtered.length !== adrs.length ? ` / ${adrs.length}` : ''}
          </span>
        </div>

        {/* Search bar */}
        <div className="relative mb-2">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fossil-400 dark:text-fossil-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter decisions..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-fossil-200 dark:border-fossil-600 bg-white dark:bg-fossil-700 text-fossil-800 dark:text-fossil-200 placeholder-fossil-400 dark:placeholder-fossil-500 focus:outline-none focus:ring-1 focus:ring-accent focus:border-transparent"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-fossil-400 dark:text-fossil-500 hover:text-fossil-600 dark:hover:text-fossil-300"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

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

      {/* Scrollable ADR list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {sorted.length === 0 ? (
          <p className="text-xs text-fossil-400 dark:text-fossil-500 italic text-center py-4">
            No decisions match "{search}"
          </p>
        ) : (
          sorted.map((adr, i) => (
            <ADRCard
              key={`${adr.title}-${i}`}
              adr={adr}
              index={adrs.indexOf(adr)}
              graphNodes={rfNodes}
            />
          ))
        )}
      </div>
    </div>
  )
}
