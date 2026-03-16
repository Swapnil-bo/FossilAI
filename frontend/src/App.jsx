import { useState, useEffect, useCallback } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { AnalysisProvider, useAnalysisContext } from './context/AnalysisContext'
import ErrorBoundary from './components/ErrorBoundary'
import RepoInput from './components/RepoInput'
import LoadingState from './components/LoadingState'
import DependencyGraph from './components/DependencyGraph'
import NodeDetail from './components/NodeDetail'
import ADRPanel from './components/ADRPanel'
import TechDebtMap from './components/TechDebtMap'
import RefactorSim from './components/RefactorSim'
import ChatPanel from './components/ChatPanel'
import LandingPage from './components/LandingPage'
import AnalyticsDashboard from './components/AnalyticsDashboard'
import ExportButton from './components/ExportButton'
import { useAnalysis } from './hooks/useAnalysis'

// ---------------------------------------------------------------------------
// useBreakpoint — tracks viewport width
// ---------------------------------------------------------------------------

function useBreakpoint() {
  const [bp, setBp] = useState(() => {
    if (typeof window === 'undefined') return 'desktop'
    if (window.innerWidth < 768) return 'mobile'
    if (window.innerWidth < 1024) return 'tablet'
    return 'desktop'
  })

  useEffect(() => {
    let raf
    const handleResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const w = window.innerWidth
        setBp(w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop')
      })
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(raf)
    }
  }, [])

  return bp
}

// ---------------------------------------------------------------------------
// Dark mode with localStorage persistence
// ---------------------------------------------------------------------------

function useDarkMode() {
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const stored = localStorage.getItem('fossilai-dark-mode')
      if (stored !== null) return stored === 'true'
    } catch {}
    return true // default to dark
  })

  useEffect(() => {
    try { localStorage.setItem('fossilai-dark-mode', String(darkMode)) } catch {}
  }, [darkMode])

  return [darkMode, setDarkMode]
}

// ---------------------------------------------------------------------------
// Toast container
// ---------------------------------------------------------------------------

const TOAST_ICONS = {
  success: (
    <svg className="w-4 h-4 text-severity-low" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4 text-severity-critical" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: (
    <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
}

function ToastContainer() {
  const { state, dispatch } = useAnalysisContext()
  const { toasts } = state

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-toast-in pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white dark:bg-fossil-700 border border-fossil-200 dark:border-fossil-600 shadow-lg text-xs font-medium text-fossil-800 dark:text-fossil-200"
        >
          {TOAST_ICONS[toast.type] || TOAST_ICONS.info}
          <span>{toast.message}</span>
          <button
            onClick={() => dispatch({ type: 'DISMISS_TOAST', payload: toast.id })}
            className="ml-1 text-fossil-400 hover:text-fossil-600 dark:hover:text-fossil-300 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header controls
// ---------------------------------------------------------------------------

function DarkModeToggle({ darkMode, setDarkMode }) {
  return (
    <button
      onClick={() => setDarkMode(!darkMode)}
      className="p-2 rounded-lg bg-fossil-200 dark:bg-fossil-700 text-fossil-600 dark:text-fossil-300 hover:bg-fossil-300 dark:hover:bg-fossil-600 transition-colors focus-visible:ring-2 focus-visible:ring-accent"
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
  {
    id: 'refactor',
    label: 'Refactor',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
  },
  {
    id: 'ask',
    label: 'Ask',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
]

function SidebarTabBar({ activeTab, onTabChange, adrCount, debtCount, hasSelectedNode, hasRefactorResult }) {
  return (
    <div className="flex border-b border-fossil-200 dark:border-fossil-700 flex-shrink-0">
      {SIDEBAR_TABS.map((tab) => {
        const isActive = activeTab === tab.id
        let badge = null
        if (tab.id === 'decisions' && adrCount > 0) badge = adrCount
        if (tab.id === 'techdebt' && debtCount > 0) badge = debtCount
        if (tab.id === 'details' && hasSelectedNode) {
          badge = <span className="w-1.5 h-1.5 rounded-full bg-accent" />
        }
        if (tab.id === 'refactor' && hasRefactorResult) {
          badge = <span className="w-1.5 h-1.5 rounded-full bg-accent" />
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
// Sidebar content (shared between desktop/tablet/mobile)
// ---------------------------------------------------------------------------

function SidebarContent({ activeTab, setActiveTab }) {
  const { state, dispatch } = useAnalysisContext()

  const adrCount = state.analysisResult?.adrs?.length || 0
  const debtCount = state.analysisResult?.tech_debt?.length || 0
  const hasSelectedNode = !!state.selectedNode
  const hasRefactorResult = !!state.refactorResult

  // Auto-switch to Details tab when a node is selected
  useEffect(() => {
    if (state.selectedNode) setActiveTab('details')
  }, [state.selectedNode, setActiveTab])

  const handleDeselectNode = () => dispatch({ type: 'SELECT_NODE', payload: null })

  if (state.status === 'idle') {
    return (
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
    )
  }

  if (state.status === 'loading') {
    return (
      <>
        <div className="p-4 border-b border-fossil-200 dark:border-fossil-700">
          <h2 className="text-sm font-semibold text-fossil-500 dark:text-fossil-400 uppercase tracking-wider">
            Analysis Panels
          </h2>
        </div>
        <div className="flex-1 p-4 space-y-3">
          {['Architecture', 'ADRs', 'Tech Debt', 'Refactoring'].map((title) => (
            <div key={title} className="p-3 rounded-lg border border-fossil-200 dark:border-fossil-600">
              <div className="flex items-center justify-between">
                <div className="h-4 w-24 rounded animate-shimmer" />
                <div className="h-4 w-8 rounded animate-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </>
    )
  }

  if (state.status === 'error') {
    return (
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
    )
  }

  // Loaded
  return (
    <>
      <SidebarTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        adrCount={adrCount}
        debtCount={debtCount}
        hasSelectedNode={hasSelectedNode}
        hasRefactorResult={hasRefactorResult}
      />

      <ErrorBoundary name="details panel">
        {activeTab === 'details' && (
          <NodeDetail
            onClose={handleDeselectNode}
            onSimulateRefactor={() => setActiveTab('refactor')}
          />
        )}
      </ErrorBoundary>

      <ErrorBoundary name="decisions panel">
        {activeTab === 'decisions' && <ADRPanel />}
      </ErrorBoundary>

      <ErrorBoundary name="tech debt panel">
        {activeTab === 'techdebt' && <TechDebtMap />}
      </ErrorBoundary>

      <ErrorBoundary name="refactor panel">
        {activeTab === 'refactor' && <RefactorSim />}
      </ErrorBoundary>

      <ErrorBoundary name="chat panel">
        {activeTab === 'ask' && <ChatPanel />}
      </ErrorBoundary>
    </>
  )
}

// ---------------------------------------------------------------------------
// Desktop Sidebar
// ---------------------------------------------------------------------------

function DesktopSidebar() {
  const [activeTab, setActiveTab] = useState('details')
  return (
    <aside className="w-80 min-w-80 h-full border-r border-fossil-200 dark:border-fossil-700 bg-white dark:bg-fossil-800 flex flex-col overflow-hidden">
      <SidebarContent activeTab={activeTab} setActiveTab={setActiveTab} />
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Tablet Sidebar (collapsible overlay)
// ---------------------------------------------------------------------------

function TabletSidebar({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('details')

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 sidebar-backdrop"
          onClick={onClose}
        />
      )}
      {/* Drawer */}
      <aside
        className={`fixed top-14 left-0 bottom-0 z-40 w-80 bg-white dark:bg-fossil-800 border-r border-fossil-200 dark:border-fossil-700 flex flex-col overflow-hidden transition-transform duration-250 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Close button */}
        <div className="absolute top-2 right-2 z-10">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-fossil-200 dark:bg-fossil-700 text-fossil-500 dark:text-fossil-400 hover:bg-fossil-300 dark:hover:bg-fossil-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <SidebarContent activeTab={activeTab} setActiveTab={setActiveTab} />
      </aside>
    </>
  )
}

// ---------------------------------------------------------------------------
// Mobile accordion panels
// ---------------------------------------------------------------------------

function MobileAccordionPanel({ tab, isOpen, onToggle, children }) {
  return (
    <div className="border-b border-fossil-200 dark:border-fossil-700">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-medium text-fossil-700 dark:text-fossil-300 hover:bg-fossil-100 dark:hover:bg-fossil-700/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          {tab.icon}
          {tab.label}
        </span>
        <svg
          className={`w-4 h-4 text-fossil-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="max-h-[50vh] overflow-y-auto fossil-scrollbar animate-fade-in">
          {children}
        </div>
      )}
    </div>
  )
}

function MobilePanels() {
  const { state, dispatch } = useAnalysisContext()
  const [openPanel, setOpenPanel] = useState(null)

  if (state.status !== 'loaded' || !state.analysisResult) return null

  const handleDeselectNode = () => dispatch({ type: 'SELECT_NODE', payload: null })

  const toggle = (id) => setOpenPanel((prev) => (prev === id ? null : id))

  return (
    <div className="bg-white dark:bg-fossil-800 border-t border-fossil-200 dark:border-fossil-700 overflow-y-auto fossil-scrollbar">
      <MobileAccordionPanel tab={SIDEBAR_TABS[0]} isOpen={openPanel === 'details'} onToggle={() => toggle('details')}>
        <ErrorBoundary name="details">
          <NodeDetail onClose={handleDeselectNode} onSimulateRefactor={() => setOpenPanel('refactor')} />
        </ErrorBoundary>
      </MobileAccordionPanel>

      <MobileAccordionPanel tab={SIDEBAR_TABS[1]} isOpen={openPanel === 'decisions'} onToggle={() => toggle('decisions')}>
        <ErrorBoundary name="decisions">
          <ADRPanel />
        </ErrorBoundary>
      </MobileAccordionPanel>

      <MobileAccordionPanel tab={SIDEBAR_TABS[2]} isOpen={openPanel === 'techdebt'} onToggle={() => toggle('techdebt')}>
        <ErrorBoundary name="tech debt">
          <TechDebtMap />
        </ErrorBoundary>
      </MobileAccordionPanel>

      <MobileAccordionPanel tab={SIDEBAR_TABS[3]} isOpen={openPanel === 'refactor'} onToggle={() => toggle('refactor')}>
        <ErrorBoundary name="refactor">
          <RefactorSim />
        </ErrorBoundary>
      </MobileAccordionPanel>

      <MobileAccordionPanel tab={SIDEBAR_TABS[4]} isOpen={openPanel === 'ask'} onToggle={() => toggle('ask')}>
        <ErrorBoundary name="chat">
          <div className="h-[50vh]">
            <ChatPanel />
          </div>
        </ErrorBoundary>
      </MobileAccordionPanel>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

function MainContent() {
  const { state } = useAnalysisContext()
  const { reset } = useAnalysis()

  return (
    <main className={`flex-1 h-full bg-fossil-100 dark:bg-fossil-900 overflow-auto ${state.status !== 'idle' ? 'flex items-center justify-center' : ''}`}>
      {state.status === 'idle' && (
        <ErrorBoundary name="landing page">
          <LandingPage />
        </ErrorBoundary>
      )}

      {state.status === 'loading' && (
        <div className="animate-fade-in w-full h-full flex items-center justify-center">
          <ErrorBoundary name="loading indicator">
            <LoadingState />
          </ErrorBoundary>
        </div>
      )}

      {state.status === 'loaded' && (
        <div className="w-full h-full animate-fade-in">
          <ErrorBoundary name="dependency graph">
            <DependencyGraph />
          </ErrorBoundary>
        </div>
      )}

      {state.status === 'error' && (
        <div className="animate-fade-in text-center space-y-4 max-w-md px-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-severity-critical/10 flex items-center justify-center">
            <svg className="w-7 h-7 text-severity-critical" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-severity-critical font-medium text-sm">{state.error}</p>
          <button
            onClick={reset}
            className="px-5 py-2 rounded-lg bg-fossil-200 dark:bg-fossil-700 text-fossil-600 dark:text-fossil-300 hover:bg-fossil-300 dark:hover:bg-fossil-600 transition-colors text-sm font-medium"
          >
            Try Again
          </button>
        </div>
      )}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Sidebar toggle button (tablet)
// ---------------------------------------------------------------------------

function SidebarToggle({ onClick }) {
  const { state } = useAnalysisContext()
  if (state.status !== 'loaded') return null

  return (
    <button
      onClick={onClick}
      className="p-2 rounded-lg bg-fossil-200 dark:bg-fossil-700 text-fossil-600 dark:text-fossil-300 hover:bg-fossil-300 dark:hover:bg-fossil-600 transition-colors"
      title="Toggle sidebar panels"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Analytics toggle + dropdown
// ---------------------------------------------------------------------------

function AnalyticsButton() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`p-2 rounded-lg transition-colors ${
          open
            ? 'bg-accent/10 text-accent'
            : 'bg-fossil-200 dark:bg-fossil-700 text-fossil-600 dark:text-fossil-300 hover:bg-fossil-300 dark:hover:bg-fossil-600'
        }`}
        title="Analytics dashboard"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          {/* Panel */}
          <div className="absolute right-0 top-full mt-2 z-50 w-[360px] max-h-[80vh] overflow-y-auto fossil-scrollbar rounded-2xl border border-fossil-200 dark:border-fossil-700 bg-white dark:bg-fossil-800 shadow-xl">
            <ErrorBoundary name="analytics dashboard">
              <AnalyticsDashboard onClose={() => setOpen(false)} />
            </ErrorBoundary>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({ darkMode, setDarkMode, breakpoint, onToggleSidebar }) {
  return (
    <header className="h-14 min-h-14 border-b border-fossil-200 dark:border-fossil-700 bg-white dark:bg-fossil-800 flex items-center px-3 sm:px-4 gap-2 sm:gap-4 z-20 relative">
      {/* Sidebar toggle for tablet */}
      {breakpoint === 'tablet' && <SidebarToggle onClick={onToggleSidebar} />}

      <h1 className="text-lg font-bold text-fossil-800 dark:text-fossil-200 whitespace-nowrap hidden sm:block">
        FossilAI
      </h1>
      <h1 className="text-lg font-bold text-fossil-800 dark:text-fossil-200 whitespace-nowrap sm:hidden">
        &#x1F9B4;
      </h1>

      <RepoInput />
      <ExportButton />
      <AnalyticsButton />
      <DarkModeToggle darkMode={darkMode} setDarkMode={setDarkMode} />
    </header>
  )
}

// ---------------------------------------------------------------------------
// Layout: assembles sidebar + main content per breakpoint
// ---------------------------------------------------------------------------

function AppLayout({ breakpoint }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (breakpoint === 'mobile') {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Graph area */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <MainContent />
        </div>
        {/* Accordion panels below */}
        <MobilePanels />
      </div>
    )
  }

  if (breakpoint === 'tablet') {
    return (
      <div className="flex flex-1 overflow-hidden relative">
        <TabletSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <MainContent />
      </div>
    )
  }

  // Desktop
  return (
    <div className="flex flex-1 overflow-hidden">
      <DesktopSidebar />
      <MainContent />
    </div>
  )
}

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------

export default function App() {
  const [darkMode, setDarkMode] = useDarkMode()
  const breakpoint = useBreakpoint()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleToggleSidebar = useCallback(() => setSidebarOpen((v) => !v), [])

  return (
    <div className={darkMode ? 'dark' : ''}>
      <AnalysisProvider>
        <ReactFlowProvider>
          <div className="h-screen flex flex-col bg-white dark:bg-fossil-800">
            <Header
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              breakpoint={breakpoint}
              onToggleSidebar={handleToggleSidebar}
            />
            <ErrorBoundary name="application">
              {breakpoint === 'tablet' ? (
                <div className="flex flex-1 overflow-hidden relative">
                  <TabletSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
                  <MainContent />
                </div>
              ) : breakpoint === 'mobile' ? (
                <div className="flex flex-col flex-1 overflow-hidden">
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <MainContent />
                  </div>
                  <MobilePanels />
                </div>
              ) : (
                <div className="flex flex-1 overflow-hidden">
                  <DesktopSidebar />
                  <MainContent />
                </div>
              )}
            </ErrorBoundary>
            <ToastContainer />
          </div>
        </ReactFlowProvider>
      </AnalysisProvider>
    </div>
  )
}
