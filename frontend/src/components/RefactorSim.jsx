import { useState, useMemo } from 'react'
import { useAnalysisContext } from '../context/AnalysisContext'
import { simulateRefactor } from '../utils/api'

// ---------------------------------------------------------------------------
// Preset scenarios
// ---------------------------------------------------------------------------

const PRESET_SCENARIOS = [
  {
    label: 'Extract into microservice',
    value: 'Extract the selected module(s) into an independent microservice with its own API boundary, separating concerns and allowing independent deployment.',
  },
  {
    label: 'Replace dependency X with Y',
    value: 'Replace the primary framework/library dependency with a modern alternative. Identify all integration points and migration steps.',
  },
  {
    label: 'Remove this module',
    value: 'Completely remove the selected module(s) and redistribute or eliminate their responsibilities across the remaining codebase.',
  },
  {
    label: 'Split this file',
    value: 'Split the selected large file(s) into smaller, single-responsibility modules with clear interfaces between them.',
  },
  {
    label: 'Merge these modules',
    value: 'Merge the selected modules into a single cohesive module, consolidating shared logic and reducing cross-module dependencies.',
  },
]

// ---------------------------------------------------------------------------
// Risk meter styles
// ---------------------------------------------------------------------------

const RISK_CONFIG = {
  low: {
    color: 'text-severity-low',
    bg: 'bg-severity-low',
    bgLight: 'bg-severity-low/10',
    border: 'border-severity-low/30',
    label: 'Low Risk',
    width: 'w-1/4',
  },
  medium: {
    color: 'text-severity-medium',
    bg: 'bg-severity-medium',
    bgLight: 'bg-severity-medium/10',
    border: 'border-severity-medium/30',
    label: 'Medium Risk',
    width: 'w-2/4',
  },
  high: {
    color: 'text-severity-high',
    bg: 'bg-severity-high',
    bgLight: 'bg-severity-high/10',
    border: 'border-severity-high/30',
    label: 'High Risk',
    width: 'w-3/4',
  },
  critical: {
    color: 'text-severity-critical',
    bg: 'bg-severity-critical',
    bgLight: 'bg-severity-critical/10',
    border: 'border-severity-critical/30',
    label: 'Critical Risk',
    width: 'w-full',
  },
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RiskMeter({ level }) {
  const config = RISK_CONFIG[level] || RISK_CONFIG.medium

  return (
    <div className={`rounded-lg border p-3 ${config.bgLight} ${config.border}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider">
          Risk Level
        </span>
        <span className={`text-xs font-bold ${config.color}`}>{config.label}</span>
      </div>
      <div className="w-full h-2 bg-fossil-200 dark:bg-fossil-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${config.bg} ${config.width}`}
        />
      </div>
    </div>
  )
}

function AffectedFilesList({ files }) {
  if (!files || files.length === 0) return null

  return (
    <div>
      <h4 className="text-xs font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider mb-2">
        Affected Files ({files.length})
      </h4>
      <div className="space-y-1 max-h-36 overflow-y-auto">
        {files.map((file, i) => (
          <div
            key={`${file}-${i}`}
            className="flex items-center gap-2 text-xs text-fossil-700 dark:text-fossil-300 px-2 py-1 rounded bg-fossil-100 dark:bg-fossil-700/50"
          >
            <svg className="w-3 h-3 flex-shrink-0 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="truncate" title={file}>{file}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StepsList({ steps }) {
  if (!steps || steps.length === 0) return null

  return (
    <div>
      <h4 className="text-xs font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider mb-2">
        Refactoring Steps
      </h4>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2 text-xs text-fossil-700 dark:text-fossil-300">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent/10 text-accent font-bold flex items-center justify-center text-[10px]">
              {i + 1}
            </span>
            <span className="leading-relaxed pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function IssuesList({ issues }) {
  if (!issues || issues.length === 0) return null

  return (
    <div>
      <h4 className="text-xs font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider mb-2">
        Potential Issues
      </h4>
      <div className="space-y-1.5">
        {issues.map((issue, i) => (
          <div key={i} className="flex gap-2 text-xs text-fossil-700 dark:text-fossil-300">
            <svg className="w-3.5 h-3.5 flex-shrink-0 text-severity-high mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="leading-relaxed">{issue}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EdgeChangesList({ newEdges, removedEdges }) {
  const hasNew = newEdges && newEdges.length > 0
  const hasRemoved = removedEdges && removedEdges.length > 0

  if (!hasNew && !hasRemoved) return null

  return (
    <div>
      <h4 className="text-xs font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider mb-2">
        Dependency Changes
      </h4>
      <div className="space-y-1.5">
        {hasNew && newEdges.map((edge, i) => (
          <div key={`new-${i}`} className="flex items-center gap-1.5 text-[11px] text-severity-low px-2 py-1 rounded bg-severity-low/5">
            <span className="font-bold">+</span>
            <span className="truncate">{edge.source}</span>
            <span className="text-fossil-400">&rarr;</span>
            <span className="truncate">{edge.target}</span>
            <span className="text-[9px] text-fossil-400">({edge.type})</span>
          </div>
        ))}
        {hasRemoved && removedEdges.map((edge, i) => (
          <div key={`rm-${i}`} className="flex items-center gap-1.5 text-[11px] text-severity-critical px-2 py-1 rounded bg-severity-critical/5">
            <span className="font-bold">-</span>
            <span className="truncate">{edge.source}</span>
            <span className="text-fossil-400">&rarr;</span>
            <span className="truncate">{edge.target}</span>
            <span className="text-[9px] text-fossil-400">({edge.type})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main RefactorSim component
// ---------------------------------------------------------------------------

export default function RefactorSim() {
  const { state, dispatch } = useAnalysisContext()
  const { analysisResult, repoUrl, refactorResult, refactorLoading, refactorError, selectedNode } = state

  const [selectedPreset, setSelectedPreset] = useState('')
  const [customScenario, setCustomScenario] = useState('')
  const [targetFilesInput, setTargetFilesInput] = useState('')

  // Pre-fill target file from selected node
  const effectiveTargetFiles = useMemo(() => {
    const manual = targetFilesInput
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean)

    if (manual.length > 0) return manual

    // Auto-fill from selected node
    if (selectedNode?.id) return [selectedNode.id]

    return []
  }, [targetFilesInput, selectedNode])

  // Build the final scenario text
  const scenarioText = selectedPreset || customScenario

  const canSimulate = !refactorLoading && scenarioText.trim().length > 0 && analysisResult

  const handleSimulate = async () => {
    if (!canSimulate) return

    dispatch({ type: 'REFACTOR_START' })

    try {
      const result = await simulateRefactor(repoUrl, scenarioText, effectiveTargetFiles)
      dispatch({ type: 'REFACTOR_RESULT', payload: result })
    } catch (err) {
      const message = err.response?.data?.detail || err.message || 'Simulation failed'
      dispatch({ type: 'REFACTOR_ERROR', payload: message })
    }
  }

  const handleClear = () => {
    dispatch({ type: 'CLEAR_REFACTOR' })
    setSelectedPreset('')
    setCustomScenario('')
    setTargetFilesInput('')
  }

  if (!analysisResult) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-xs text-fossil-400 dark:text-fossil-500 text-center">
          Analyze a repository first to simulate refactoring scenarios.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Input form */}
      <div className="px-4 pt-3 pb-3 border-b border-fossil-200 dark:border-fossil-700 flex-shrink-0 space-y-3">
        {/* Preset dropdown */}
        <div>
          <label className="block text-[10px] font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider mb-1">
            Scenario
          </label>
          <select
            value={selectedPreset}
            onChange={(e) => {
              setSelectedPreset(e.target.value)
              if (e.target.value) setCustomScenario('')
            }}
            className="w-full text-xs rounded-lg border border-fossil-200 dark:border-fossil-600 bg-white dark:bg-fossil-700 text-fossil-800 dark:text-fossil-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Select a preset...</option>
            {PRESET_SCENARIOS.map((preset) => (
              <option key={preset.label} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        {/* Custom scenario */}
        <div>
          <label className="block text-[10px] font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider mb-1">
            Or describe your own
          </label>
          <textarea
            value={customScenario}
            onChange={(e) => {
              setCustomScenario(e.target.value)
              if (e.target.value) setSelectedPreset('')
            }}
            placeholder="What if we extracted the auth module into a separate service?"
            rows={2}
            className="w-full text-xs rounded-lg border border-fossil-200 dark:border-fossil-600 bg-white dark:bg-fossil-700 text-fossil-800 dark:text-fossil-200 px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-fossil-400 dark:placeholder:text-fossil-500"
          />
        </div>

        {/* Target files */}
        <div>
          <label className="block text-[10px] font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider mb-1">
            Target Files
            <span className="font-normal normal-case ml-1">(comma-separated, optional)</span>
          </label>
          <input
            type="text"
            value={targetFilesInput}
            onChange={(e) => setTargetFilesInput(e.target.value)}
            placeholder={selectedNode?.id || 'e.g. src/auth.py, src/routes/login.py'}
            className="w-full text-xs rounded-lg border border-fossil-200 dark:border-fossil-600 bg-white dark:bg-fossil-700 text-fossil-800 dark:text-fossil-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-fossil-400 dark:placeholder:text-fossil-500"
          />
          {effectiveTargetFiles.length > 0 && !targetFilesInput && selectedNode?.id && (
            <p className="text-[10px] text-accent mt-1">
              Auto-targeting: {selectedNode.id}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleSimulate}
            disabled={!canSimulate}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 ${
              canSimulate
                ? 'bg-accent hover:bg-accent-dark text-white'
                : 'bg-fossil-200 dark:bg-fossil-700 text-fossil-400 dark:text-fossil-500 cursor-not-allowed'
            }`}
          >
            {refactorLoading ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Simulating...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Simulate
              </>
            )}
          </button>
          {(refactorResult || refactorError) && (
            <button
              onClick={handleClear}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-fossil-200 dark:bg-fossil-700 text-fossil-600 dark:text-fossil-300 hover:bg-fossil-300 dark:hover:bg-fossil-600 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Loading */}
        {refactorLoading && (
          <div className="space-y-3">
            <div className="h-16 rounded-lg bg-fossil-200 dark:bg-fossil-700 animate-pulse" />
            <div className="h-10 rounded-lg bg-fossil-200 dark:bg-fossil-700 animate-pulse" />
            <div className="h-24 rounded-lg bg-fossil-200 dark:bg-fossil-700 animate-pulse" />
            <p className="text-[10px] text-fossil-400 dark:text-fossil-500 text-center">
              Running simulation through Gemini + Groq pipeline...
            </p>
          </div>
        )}

        {/* Error */}
        {refactorError && (
          <div className="rounded-lg border border-severity-critical/30 bg-severity-critical/10 p-3">
            <p className="text-xs text-severity-critical font-medium">Simulation failed</p>
            <p className="text-[11px] text-fossil-600 dark:text-fossil-400 mt-1">{refactorError}</p>
          </div>
        )}

        {/* Results display */}
        {refactorResult && !refactorLoading && (
          <>
            <RiskMeter level={refactorResult.risk_level} />

            {refactorResult.summary && (
              <div>
                <h4 className="text-xs font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider mb-2">
                  Impact Summary
                </h4>
                <p className="text-xs text-fossil-700 dark:text-fossil-300 leading-relaxed">
                  {refactorResult.summary}
                </p>
              </div>
            )}

            <AffectedFilesList files={refactorResult.affected_files} />
            <StepsList steps={refactorResult.steps} />
            <EdgeChangesList
              newEdges={refactorResult.new_edges}
              removedEdges={refactorResult.removed_edges}
            />
            <IssuesList issues={refactorResult.potential_issues} />
          </>
        )}

        {/* Empty state — no result yet */}
        {!refactorResult && !refactorLoading && !refactorError && (
          <div className="flex flex-col items-center justify-center py-8 space-y-2">
            <svg className="w-10 h-10 text-fossil-400 dark:text-fossil-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <p className="text-xs text-fossil-400 dark:text-fossil-500 text-center max-w-[200px]">
              Select a scenario above and click Simulate to see what would happen.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
