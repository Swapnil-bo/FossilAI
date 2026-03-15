import { useState, useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { AnalysisProvider, useAnalysisContext } from './context/AnalysisContext'
import RepoInput from './components/RepoInput'
import LoadingState from './components/LoadingState'
import DependencyGraph from './components/DependencyGraph'
import NodeDetail from './components/NodeDetail'
import ADRPanel from './components/ADRPanel'
import TechDebtMap from './components/TechDebtMap'
import { useAnalysis } from './hooks/useAnalysis'

// ---------------------------------------------------------------------------
// Header controls
// ---------------------------------------------------------------------------

function DarkModeToggle({ darkMode, setDarkMode }) {
  return (
    <button
      onClick={() => setDarkMode(!darkMode)}
      className="p-2 rounded-lg bg-fossil-200 dark:bg-fossil-700 text-fossil-600 dark:text-fossil-300 hover:bg-fossil-300 dark:hover:bg-fossil-600 transition-colors"
      title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {darkMode ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Sidebar tabs
// ---------------------------------------------------------------------------

const SIDEBAR_TABS = [
  {
    id: 'details',
    label: 'Details',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
      </svg>
    ),
  },
  {
    id: 'decisions',
    label: 'Decisions',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 'techdebt',
    label: 'Tech Debt',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
]

function SidebarTabBar({ activeTab, onTabChange, adrCount, debtCount, hasSelectedNode }) {
  return (
    <div className="flex border-b border-fossil-200 dark:border-fossil-700 flex-shrink-0">
      {SIDEBAR_TABS.map((tab) => {
        const isActive = activeTab === tab.id
        let badge = null
        if (tab.id === 'decisions' && adrCount > 0) badge = adrCount
        if (tab.id === 'techdebt' && debtCount > 0) badge = debtCount
        if (tab.id === 'details' && hasSelectedNode) {
          badge = (
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          )
        }

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-[11px] font-medium transition-colors relative ${
              isActive
                ? 'text-accent'
                : 'text-fossil-500 dark:text-fossil-400 hover:text-fossil-700 dark:hover:text-fossil-300'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {badge !== null && typeof badge === 'number' && (
              <span className="text-[9px] px-1 py-0 rounded-full bg-accent/10 text-accent font-semibold min-w-[16px] text-center">
                {badge}
              </span>
            )}
            {badge !== null && typeof badge !== 'number' && badge}
            {isActive && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-t" />
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar() {
  const { state, dispatch } = useAnalysisContext()
  const [activeTab, setActiveTab] = useState('details')

  const adrCount = state.analysisResult?.adrs?.length || 0
  const debtCount = state.analysisResult?.tech_debt?.length || 0
  const hasSelectedNode = !!state.selectedNode

  // Auto-switch to Details tab when a node is selected
  useEffect(() => {
    if (state.selectedNode) {
      setActiveTab('details')
    }
  }, [state.selectedNode])

  const handleDeselectNode = () => {
    dispatch({ type: 'SELECT_NODE', payload: null })
  }

  return (
    <aside className="w-80 min-w-80 h-full border-r border-fossil-200 dark:border-fossil-700 bg-white dark:bg-fossil-800 flex flex-col overflow-hidden">
      {/* Idle state */}
      {state.status === 'idle' && (
        <>
          <div className="p-4 border-b border-fossil-200 dark:border-fossil-700">
            <h2 className="text-sm font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider">
              Analysis Panels
            </h2>
          </div>
          <div className="flex-1 flex items-center justify-center p-6">
            <p className="text-fossil-400 dark:text-fossil-500 text-center text-sm">
              Enter a GitHub repository URL above to start analyzing.
            </p>
          </div>
        </>
      )}

      {/* Loading state */}
      {state.status === 'loading' && (
        <>
          <div className="p-4 border-b border-fossil-200 dark:border-fossil-700">
            <h2 className="text-sm font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider">
              Analysis Panels
            </h2>
          </div>
          <div className="flex-1 p-4 space-y-3">
            {['Architecture', 'ADRs', 'Tech Debt', 'Refactoring'].map((title) => (
              <div
                key={title}
                className="p-3 rounded-lg bg-fossil-100 dark:bg-fossil-700/50 border border-fossil-200 dark:border-fossil-600"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-fossil-400 dark:text-fossil-500">
                    {title}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-fossil-200 dark:bg-fossil-600 text-fossil-400 dark:text-fossil-500 font-medium">
                    --
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Loaded state — tabbed interface */}
      {state.status === 'loaded' && state.analysisResult && (
        <>
          <SidebarTabBar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            adrCount={adrCount}
            debtCount={debtCount}
            hasSelectedNode={hasSelectedNode}
          />

          {activeTab === 'details' && (
            <NodeDetail onClose={handleDeselectNode} />
          )}

          {activeTab === 'decisions' && <ADRPanel />}

          {activeTab === 'techdebt' && <TechDebtMap />}
        </>
      )}

      {/* Error state */}
      {state.status === 'error' && (
        <>
          <div className="p-4 border-b border-fossil-200 dark:border-fossil-700">
            <h2 className="text-sm font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider">
              Analysis Panels
            </h2>
          </div>
          <div className="flex-1 flex items-center justify-center p-6">
            <p className="text-fossil-400 dark:text-fossil-500 text-center text-sm">
              Analysis failed. Try again with a different repository.
            </p>
          </div>
        </>
      )}
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

function MainContent() {
  const { state } = useAnalysisContext()
  const { reset } = useAnalysis()

  return (
    <main className="flex-1 h-full bg-fossil-100 dark:bg-fossil-900 flex items-center justify-center overflow-auto">
      {state.status === 'idle' && (
        <div className="text-center space-y-4">
          <div className="text-6xl">🦴</div>
          <h2 className="text-2xl font-bold text-fossil-800 dark:text-fossil-200">
            FossilAI
          </h2>
          <p className="text-fossil-500 dark:text-fossil-400 max-w-md">
            Paste a GitHub repo URL above to reverse-engineer its architecture,
            discover tech debt, and simulate refactoring scenarios.
          </p>
        </div>
      )}

      {state.status === 'loading' && <LoadingState />}

      {state.status === 'loaded' && (
        <div className="w-full h-full">
          <DependencyGraph />
        </div>
      )}

      {state.status === 'error' && (
        <div className="text-center space-y-4 max-w-md">
          <div className="text-4xl">&#x26A0;</div>
          <p className="text-severity-critical font-medium">{state.error}</p>
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-fossil-200 dark:bg-fossil-700 text-fossil-600 dark:text-fossil-300 hover:bg-fossil-300 dark:hover:bg-fossil-600 transition-colors text-sm"
          >
            Try Again
          </button>
        </div>
      )}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Layout shells
// ---------------------------------------------------------------------------

function AppLayout() {
  return (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar />
      <MainContent />
    </div>
  )
}

function Header({ darkMode, setDarkMode }) {
  return (
    <header className="h-14 min-h-14 border-b border-fossil-200 dark:border-fossil-700 bg-white dark:bg-fossil-800 flex items-center px-4 gap-4">
      <h1 className="text-lg font-bold text-fossil-800 dark:text-fossil-200 whitespace-nowrap">
        FossilAI
      </h1>
      <RepoInput />
      <DarkModeToggle darkMode={darkMode} setDarkMode={setDarkMode} />
    </header>
  )
}

export default function App() {
  const [darkMode, setDarkMode] = useState(true)

  return (
    <div className={darkMode ? 'dark' : ''}>
      <AnalysisProvider>
        <ReactFlowProvider>
          <div className="h-screen flex flex-col bg-white dark:bg-fossil-800">
            <Header darkMode={darkMode} setDarkMode={setDarkMode} />
            <AppLayout />
          </div>
        </ReactFlowProvider>
      </AnalysisProvider>
    </div>
  )
}
