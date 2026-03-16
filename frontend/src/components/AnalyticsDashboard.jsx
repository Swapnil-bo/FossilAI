import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchAnalytics, fetchAnalyticsSummary } from '../utils/api'
import { useAnalysis } from '../hooks/useAnalysis'

// ---------------------------------------------------------------------------
// Animated counter — counts up from 0 to target over ~800ms
// ---------------------------------------------------------------------------

function AnimatedCount({ value, suffix = '' }) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef(null)

  useEffect(() => {
    const target = typeof value === 'number' ? value : 0
    if (target === 0) {
      setDisplay(0)
      return
    }

    const duration = 800
    const start = performance.now()
    const from = 0

    const tick = (now) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(from + (target - from) * eased))

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value])

  return (
    <span>
      {display.toLocaleString()}
      {suffix}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value, suffix = '', icon }) {
  return (
    <div className="p-4 rounded-xl border border-fossil-200 dark:border-fossil-700 bg-white dark:bg-fossil-800">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <span className="text-[10px] font-medium text-fossil-400 dark:text-fossil-500 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-xl font-bold text-fossil-800 dark:text-fossil-100">
        {typeof value === 'number' ? (
          <AnimatedCount value={value} suffix={suffix} />
        ) : (
          <span>{value || 'N/A'}</span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// History row
// ---------------------------------------------------------------------------

function HistoryRow({ record, onClick }) {
  const date = new Date(record.analyzed_at * 1000)
  const timeAgo = getTimeAgo(date)

  return (
    <button
      onClick={() => onClick(record.repo_url)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-fossil-100 dark:hover:bg-fossil-700/50 transition-colors text-left group"
    >
      {/* Repo icon */}
      <div className="w-8 h-8 rounded-lg bg-fossil-100 dark:bg-fossil-700 flex items-center justify-center flex-shrink-0 group-hover:bg-accent/10 transition-colors">
        <svg className="w-4 h-4 text-fossil-500 dark:text-fossil-400 group-hover:text-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-fossil-800 dark:text-fossil-200 truncate group-hover:text-accent transition-colors">
          {record.repo_name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-fossil-400 dark:text-fossil-500">
            {record.file_count} files
          </span>
          {record.architecture_pattern && record.architecture_pattern !== 'unknown' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent font-medium">
              {record.architecture_pattern}
            </span>
          )}
          {record.tech_debt_count > 0 && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
              record.avg_severity === 'critical' ? 'bg-severity-critical/10 text-severity-critical' :
              record.avg_severity === 'high' ? 'bg-severity-high/10 text-severity-high' :
              record.avg_severity === 'medium' ? 'bg-severity-medium/10 text-severity-medium' :
              'bg-severity-low/10 text-severity-low'
            }`}>
              {record.tech_debt_count} debt
            </span>
          )}
        </div>
      </div>

      {/* Time */}
      <span className="text-[10px] text-fossil-400 dark:text-fossil-500 flex-shrink-0">
        {timeAgo}
      </span>
    </button>
  )
}

function getTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString()
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AnalyticsDashboard({ onClose }) {
  const [summary, setSummary] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const { analyzeRepo } = useAnalysis()

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [summaryData, recordsData] = await Promise.all([
          fetchAnalyticsSummary(),
          fetchAnalytics(),
        ])
        if (!cancelled) {
          setSummary(summaryData)
          setRecords(recordsData)
        }
      } catch {
        // Silently fail — dashboard is non-critical
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  const handleRepoClick = useCallback(
    (repoUrl) => {
      onClose()
      analyzeRepo(repoUrl)
    },
    [analyzeRepo, onClose]
  )

  const isEmpty = !loading && records.length === 0

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-fossil-800 dark:text-fossil-100">Analytics</h2>
            <p className="text-[10px] text-fossil-400 dark:text-fossil-500">Analysis history &amp; stats</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-fossil-400 hover:text-fossil-600 dark:hover:text-fossil-300 hover:bg-fossil-100 dark:hover:bg-fossil-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="px-5 pb-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-4 rounded-xl border border-fossil-200 dark:border-fossil-700">
                <div className="h-3 w-16 rounded animate-shimmer mb-3" />
                <div className="h-6 w-12 rounded animate-shimmer" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="px-5 pb-5 text-center py-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-fossil-100 dark:bg-fossil-700 flex items-center justify-center">
            <svg className="w-6 h-6 text-fossil-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-xs font-medium text-fossil-600 dark:text-fossil-400 mb-1">
            No repos analyzed yet
          </p>
          <p className="text-[11px] text-fossil-400 dark:text-fossil-500">
            Analyze a repository and your stats will appear here.
          </p>
        </div>
      )}

      {/* Stats + History */}
      {!loading && !isEmpty && (
        <div className="px-5 pb-5 space-y-4">
          {/* Stat cards */}
          {summary && (
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Repos Analyzed"
                value={summary.total_repos_analyzed}
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                }
              />
              <StatCard
                label="Files Scanned"
                value={summary.total_files_analyzed}
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
              />
              <StatCard
                label="Top Architecture"
                value={summary.most_common_architecture}
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                }
              />
              <StatCard
                label="Avg Debt Items"
                value={summary.avg_tech_debt_items}
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                }
              />
            </div>
          )}

          {/* History list */}
          <div>
            <p className="text-[10px] font-bold text-fossil-400 dark:text-fossil-500 uppercase tracking-wider mb-2 px-1">
              Recent Analyses
            </p>
            <div className="space-y-0.5 max-h-60 overflow-y-auto fossil-scrollbar">
              {records.map((record) => (
                <HistoryRow
                  key={record.id}
                  record={record}
                  onClick={handleRepoClick}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
