import { createContext, useContext, useReducer, useCallback } from 'react'

const AnalysisContext = createContext(null)

let _toastId = 0

const initialState = {
  repoUrl: '',
  status: 'idle', // idle | loading | loaded | error
  pipelineStage: '', // fetching | parsing | analyzing | extracting | complete
  analysisResult: null,
  selectedNode: null, // React Flow node object when a graph node is clicked
  error: null,
  refactorResult: null,
  refactorLoading: false,
  refactorError: null,
  highlightedNodes: [], // file IDs to pulse in the dependency graph
  toasts: [], // { id, message, type: 'success'|'error'|'info' }
}

function analysisReducer(state, action) {
  switch (action.type) {
    case 'START_ANALYSIS':
      return {
        ...initialState,
        toasts: state.toasts,
        repoUrl: action.payload,
        status: 'loading',
        pipelineStage: 'fetching',
      }
    case 'SET_STATUS':
      return {
        ...state,
        pipelineStage: action.payload,
      }
    case 'SET_RESULT':
      return {
        ...state,
        status: 'loaded',
        pipelineStage: 'complete',
        analysisResult: action.payload,
        error: null,
      }
    case 'SET_ERROR':
      return {
        ...state,
        status: 'error',
        pipelineStage: '',
        error: action.payload,
      }
    case 'SELECT_NODE':
      return {
        ...state,
        selectedNode: action.payload,
      }
    case 'REFACTOR_START':
      return {
        ...state,
        refactorLoading: true,
        refactorResult: null,
        refactorError: null,
        highlightedNodes: [],
      }
    case 'REFACTOR_RESULT':
      return {
        ...state,
        refactorLoading: false,
        refactorResult: action.payload,
        highlightedNodes: action.payload?.affected_files || [],
      }
    case 'REFACTOR_ERROR':
      return {
        ...state,
        refactorLoading: false,
        refactorError: action.payload,
      }
    case 'CLEAR_REFACTOR':
      return {
        ...state,
        refactorResult: null,
        refactorError: null,
        highlightedNodes: [],
      }
    case 'SHOW_TOAST':
      return {
        ...state,
        toasts: [...state.toasts, action.payload],
      }
    case 'DISMISS_TOAST':
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.payload),
      }
    case 'RESET':
      return { ...initialState, toasts: state.toasts }
    default:
      return state
  }
}

export function AnalysisProvider({ children }) {
  const [state, dispatch] = useReducer(analysisReducer, initialState)

  const showToast = useCallback((message, type = 'success') => {
    const id = ++_toastId
    dispatch({ type: 'SHOW_TOAST', payload: { id, message, type } })
    setTimeout(() => dispatch({ type: 'DISMISS_TOAST', payload: id }), 3000)
  }, [])

  return (
    <AnalysisContext.Provider value={{ state, dispatch, showToast }}>
      {children}
    </AnalysisContext.Provider>
  )
}

export function useAnalysisContext() {
  const context = useContext(AnalysisContext)
  if (!context) {
    throw new Error('useAnalysisContext must be used within an AnalysisProvider')
  }
  return context
}
