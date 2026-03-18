import { useCallback, useEffect, useRef } from 'react'
import { useAnalysisContext } from '../context/AnalysisContext'
import { analyzeRepo as apiAnalyze, getAnalysisStatus, fetchDemoAnalysis } from '../utils/api'

const POLL_INTERVAL_MS = 2000

/**
 * Custom hook that orchestrates the full analysis lifecycle:
 *  1. Dispatches START_ANALYSIS
 *  2. Fires POST /analyze (long-running)
 *  3. Polls GET /analyze/status every 2s to update the pipeline stage
 *  4. On success: dispatches SET_RESULT
 *  5. On failure: dispatches SET_ERROR
 *  6. Cleans up polling on unmount or completion
 */
export function useAnalysis() {
  const { state, dispatch } = useAnalysisContext()
  const pollRef = useRef(null)
  const abortRef = useRef(null)

  // Stop any active polling
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopPolling()
      if (abortRef.current) abortRef.current.abort()
    }
  }, [stopPolling])

  // Start polling the status endpoint
  const startPolling = useCallback(
    (repoUrl) => {
      stopPolling()

      pollRef.current = setInterval(async () => {
        try {
          const data = await getAnalysisStatus(repoUrl)
          const stage = data.status
          if (stage && stage !== 'idle' && stage !== 'error') {
            dispatch({ type: 'SET_STATUS', payload: stage })
          }
          // Stop polling once complete — the main request will handle the result
          if (stage === 'complete' || stage === 'error') {
            stopPolling()
          }
        } catch {
          // Polling failures are non-critical — the main request handles errors
        }
      }, POLL_INTERVAL_MS)
    },
    [dispatch, stopPolling],
  )

  const analyzeRepo = useCallback(
    async (repoUrl) => {
      // Abort any in-flight request
      if (abortRef.current) abortRef.current.abort()
      abortRef.current = new AbortController()

      dispatch({ type: 'START_ANALYSIS', payload: repoUrl })
      startPolling(repoUrl)

      try {
        const result = await apiAnalyze(repoUrl)
        stopPolling()
        dispatch({ type: 'SET_RESULT', payload: result })
      } catch (err) {
        stopPolling()
        // Don't set error for aborted requests
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return
        const message =
          err.response?.data?.detail || err.message || 'Analysis failed'
        dispatch({ type: 'SET_ERROR', payload: message })
      }
    },
    [dispatch, startPolling, stopPolling],
  )

  const loadDemoRepo = useCallback(
    async (repoName, repoUrl) => {
      // Abort any in-flight request
      if (abortRef.current) abortRef.current.abort()
      stopPolling()

      dispatch({ type: 'START_ANALYSIS', payload: repoUrl })

      try {
        const result = await fetchDemoAnalysis(repoName)
        dispatch({ type: 'SET_RESULT', payload: result })
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return
        const message =
          err.response?.data?.detail || err.message || 'Failed to load demo'
        dispatch({ type: 'SET_ERROR', payload: message })
      }
    },
    [dispatch, stopPolling],
  )

  const reset = useCallback(() => {
    stopPolling()
    if (abortRef.current) abortRef.current.abort()
    dispatch({ type: 'RESET' })
  }, [dispatch, stopPolling])

  return {
    analyzeRepo,
    loadDemoRepo,
    reset,
    status: state.status,
    pipelineStage: state.pipelineStage,
    analysisResult: state.analysisResult,
    error: state.error,
    repoUrl: state.repoUrl,
  }
}
