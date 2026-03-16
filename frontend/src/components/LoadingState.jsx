import { useAnalysisContext } from '../context/AnalysisContext'

const PIPELINE_STAGES = [
  {
    key: 'fetching',
    label: 'Fetching repository',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ),
  },
  {
    key: 'parsing',
    label: 'Parsing imports',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
  {
    key: 'analyzing',
    label: 'Deep analysis (Gemini)',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  {
    key: 'extracting',
    label: 'Extracting structures (Groq)',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
]

const FUN_MESSAGES = [
  'Reading the git blame so you don\'t have to...',
  'Decoding spaghetti architecture...',
  'Asking the code why it was written this way...',
  'Excavating ancient commit artifacts...',
  'Translating developer intentions from code fossils...',
  'Mapping the dependency labyrinth...',
  'Untangling circular imports...',
  'Carbon-dating the tech debt...',
  'Interviewing the codebase for architectural secrets...',
  'Performing a digital archaeological dig...',
]

function useFunMessage() {
  // Pick a stable random message based on current minute so it doesn't flicker on re-render
  const index = Math.floor(Date.now() / 15000) % FUN_MESSAGES.length
  return FUN_MESSAGES[index]
}

function StageIndicator({ stage, currentStage }) {
  const stageIndex = PIPELINE_STAGES.findIndex((s) => s.key === stage.key)
  const currentIndex = PIPELINE_STAGES.findIndex((s) => s.key === currentStage)

  let state = 'pending'
  if (stageIndex < currentIndex) state = 'completed'
  else if (stageIndex === currentIndex) state = 'active'

  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 ${
          state === 'completed'
            ? 'bg-severity-low/20 text-severity-low'
            : state === 'active'
              ? 'bg-accent/20 text-accent animate-pulse'
              : 'bg-fossil-200 dark:bg-fossil-700 text-fossil-400 dark:text-fossil-500'
        }`}
      >
        {state === 'completed' ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          stage.icon
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium transition-colors ${
            state === 'completed'
              ? 'text-severity-low'
              : state === 'active'
                ? 'text-fossil-800 dark:text-fossil-200'
                : 'text-fossil-400 dark:text-fossil-500'
          }`}
        >
          {stage.label}
        </p>
        {state === 'active' && (
          <div className="mt-1.5 h-1.5 w-full bg-fossil-200 dark:bg-fossil-700 rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full animate-loading-bar" />
          </div>
        )}
      </div>
    </div>
  )
}

function SkeletonBlock({ className = '' }) {
  return (
    <div
      className={`rounded animate-shimmer ${className}`}
    />
  )
}

function GraphSkeleton() {
  return (
    <div className="w-full max-w-lg space-y-4">
      <SkeletonBlock className="h-4 w-48" />
      <div className="relative h-48 border border-fossil-200 dark:border-fossil-700 rounded-lg overflow-hidden">
        {/* Fake nodes */}
        <SkeletonBlock className="absolute top-4 left-8 h-8 w-24" />
        <SkeletonBlock className="absolute top-4 right-12 h-8 w-20" />
        <SkeletonBlock className="absolute top-20 left-20 h-8 w-28" />
        <SkeletonBlock className="absolute top-20 right-8 h-8 w-16" />
        <SkeletonBlock className="absolute bottom-4 left-12 h-8 w-20" />
        <SkeletonBlock className="absolute bottom-4 right-16 h-8 w-24" />
        {/* Fake edges */}
        <div className="absolute top-12 left-20 w-px h-8 bg-fossil-300 dark:bg-fossil-600 opacity-50" />
        <div className="absolute top-12 right-20 w-px h-8 bg-fossil-300 dark:bg-fossil-600 opacity-50" />
        <div className="absolute top-28 left-32 w-px h-8 bg-fossil-300 dark:bg-fossil-600 opacity-50" />
      </div>
    </div>
  )
}

function PanelSkeleton() {
  return (
    <div className="w-full max-w-lg space-y-3 mt-6">
      <SkeletonBlock className="h-4 w-36" />
      <div className="space-y-2">
        <SkeletonBlock className="h-16 w-full" />
        <SkeletonBlock className="h-16 w-full" />
        <SkeletonBlock className="h-16 w-5/6" />
      </div>
    </div>
  )
}

export default function LoadingState() {
  const { state } = useAnalysisContext()
  const funMessage = useFunMessage()
  const currentStage = state.pipelineStage || 'fetching'

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-8">
      {/* Pipeline progress */}
      <div className="w-full max-w-sm space-y-4">
        <h2 className="text-lg font-semibold text-fossil-800 dark:text-fossil-200 text-center">
          Analyzing Repository
        </h2>

        <div className="space-y-3">
          {PIPELINE_STAGES.map((stage) => (
            <StageIndicator
              key={stage.key}
              stage={stage}
              currentStage={currentStage}
            />
          ))}
        </div>
      </div>

      {/* Fun message */}
      <p className="text-sm text-fossil-400 dark:text-fossil-500 italic text-center max-w-md">
        {funMessage}
      </p>

      {/* Skeleton preview */}
      <div className="w-full max-w-lg opacity-40">
        <GraphSkeleton />
        <PanelSkeleton />
      </div>
    </div>
  )
}
