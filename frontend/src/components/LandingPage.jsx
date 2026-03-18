import { useEffect, useRef, useCallback } from 'react'
import { useAnalysis } from '../hooks/useAnalysis'

// ---------------------------------------------------------------------------
// IntersectionObserver hook for scroll-reveal animations
// ---------------------------------------------------------------------------

function useReveal() {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('landing-visible')
          observer.unobserve(el)
        }
      },
      { threshold: 0.15 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return ref
}

function RevealSection({ children, className = '', delay = 0 }) {
  const ref = useReveal()
  return (
    <div
      ref={ref}
      className={`landing-reveal ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feature cards
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
    title: 'Dependency Graph',
    desc: 'Interactive React Flow visualization of how every file and module connects. Zoom, pan, and click through your codebase.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: 'Architectural Decisions',
    desc: 'AI-generated ADRs that explain why things were built a certain way. The decisions no one documented but everyone needs.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    title: 'Tech Debt Heatmap',
    desc: 'Color-coded map of your codebase health. Green is clean, red is where bugs are hiding. Severity ratings included.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
    title: 'Refactor Simulator',
    desc: '"What if I extracted auth into a microservice?" Get impact assessments, affected files, and risk levels instantly.',
  },
]

// ---------------------------------------------------------------------------
// How it works steps
// ---------------------------------------------------------------------------

const STEPS = [
  {
    num: '1',
    title: 'Paste a GitHub URL',
    desc: 'Any public repository. We download it in a single API call.',
  },
  {
    num: '2',
    title: 'AI reads the entire codebase',
    desc: 'Gemini reasons deeply. Groq extracts structured data. Two-pass architecture.',
  },
  {
    num: '3',
    title: 'Explore the interactive analysis',
    desc: 'Dependency graph, ADRs, tech debt, and refactor simulations — all in one place.',
  },
]

// ---------------------------------------------------------------------------
// Tech stack badges
// ---------------------------------------------------------------------------

const TECH_STACK = [
  { name: 'React', color: '#61DAFB' },
  { name: 'FastAPI', color: '#009688' },
  { name: 'Gemini', color: '#4285F4' },
  { name: 'Groq', color: '#F55036' },
  { name: 'React Flow', color: '#FF0072' },
  { name: 'Tailwind', color: '#06B6D4' },
]

// ---------------------------------------------------------------------------
// Demo repos (matches App.jsx EXAMPLE_REPOS)
// ---------------------------------------------------------------------------

const DEMO_REPOS = [
  {
    url: 'https://github.com/expressjs/express',
    name: 'expressjs/express',
    desc: 'Fast, unopinionated web framework for Node.js',
    lang: 'JavaScript',
    langColor: '#f1e05a',
    demoName: 'express',
  },
  {
    url: 'https://github.com/pallets/flask',
    name: 'pallets/flask',
    desc: 'Lightweight WSGI web application framework',
    lang: 'Python',
    langColor: '#3572A5',
    demoName: null,
  },
  {
    url: 'https://github.com/tiangolo/fastapi',
    name: 'tiangolo/fastapi',
    desc: 'Modern, fast web framework for APIs',
    lang: 'Python',
    langColor: '#3572A5',
    demoName: null,
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LandingPage() {
  const { analyzeRepo, loadDemoRepo } = useAnalysis()

  const handleAnalyzeClick = useCallback(() => {
    // Focus the URL input in the header
    const input = document.querySelector('header input[type="text"]')
    if (input) {
      input.focus()
      input.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

  const handleDemoClick = useCallback(() => {
    loadDemoRepo('express', 'https://github.com/expressjs/express')
  }, [loadDemoRepo])

  const handleRepoClick = useCallback(
    (repo) => {
      if (repo.demoName) {
        loadDemoRepo(repo.demoName, repo.url)
      } else {
        analyzeRepo(repo.url)
      }
    },
    [analyzeRepo, loadDemoRepo]
  )

  return (
    <div className="w-full h-full overflow-y-auto fossil-scrollbar">
      <div className="min-h-full flex flex-col">

        {/* ── Hero ────────────────────────────────────────────────── */}
        <section className="flex-shrink-0 flex flex-col items-center justify-center text-center px-4 sm:px-6 pt-12 sm:pt-20 pb-16 sm:pb-24">
          <RevealSection className="space-y-6 max-w-2xl mx-auto">
            {/* Icon */}
            <div className="relative inline-block">
              <span className="text-6xl sm:text-7xl block landing-float">&#x1F9B4;</span>
              <span className="absolute -top-1 -right-3 text-2xl opacity-60 landing-float-delayed">&#x2728;</span>
            </div>

            {/* Title */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-fossil-800 dark:text-fossil-100">
              Fossil<span className="text-accent">AI</span>
            </h1>

            {/* Tagline */}
            <p className="text-lg sm:text-xl font-medium text-fossil-600 dark:text-fossil-300 max-w-lg mx-auto leading-relaxed">
              Reverse-engineer the intent behind any codebase
            </p>

            {/* Subtitle */}
            <p className="text-sm sm:text-base text-fossil-400 dark:text-fossil-500 max-w-md mx-auto leading-relaxed">
              AI-powered dependency graphs, architectural decisions, tech debt detection, and refactor simulations
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={handleAnalyzeClick}
                className="px-6 py-3 rounded-xl bg-accent hover:bg-accent-dark text-white font-semibold text-sm transition-all hover:shadow-lg hover:shadow-accent/25 active:scale-[0.98]"
              >
                Analyze a Repo
              </button>
              <button
                onClick={handleDemoClick}
                className="px-6 py-3 rounded-xl border-2 border-fossil-200 dark:border-fossil-600 bg-white dark:bg-fossil-800 text-fossil-700 dark:text-fossil-300 font-semibold text-sm transition-all hover:border-accent hover:text-accent dark:hover:text-accent active:scale-[0.98]"
              >
                Try a Demo — Instant
              </button>
            </div>
          </RevealSection>
        </section>

        {/* ── Features ────────────────────────────────────────────── */}
        <section className="flex-shrink-0 px-4 sm:px-6 pb-16 sm:pb-24">
          <div className="max-w-4xl mx-auto">
            <RevealSection className="text-center mb-10">
              <p className="text-xs font-bold text-accent uppercase tracking-widest mb-2">Features</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-fossil-800 dark:text-fossil-100">
                Everything you need to understand a codebase
              </h2>
            </RevealSection>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FEATURES.map((feat, i) => (
                <RevealSection key={feat.title} delay={i * 80}>
                  <div className="group p-5 rounded-2xl border border-fossil-200 dark:border-fossil-700 bg-white dark:bg-fossil-800 hover:border-accent/40 dark:hover:border-accent/40 transition-all hover:shadow-md">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-3 group-hover:bg-accent/20 transition-colors">
                      {feat.icon}
                    </div>
                    <h3 className="text-sm font-bold text-fossil-800 dark:text-fossil-200 mb-1">
                      {feat.title}
                    </h3>
                    <p className="text-xs text-fossil-500 dark:text-fossil-400 leading-relaxed">
                      {feat.desc}
                    </p>
                  </div>
                </RevealSection>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ───────────────────────────────────────── */}
        <section className="flex-shrink-0 px-4 sm:px-6 pb-16 sm:pb-24">
          <div className="max-w-3xl mx-auto">
            <RevealSection className="text-center mb-10">
              <p className="text-xs font-bold text-accent uppercase tracking-widest mb-2">How It Works</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-fossil-800 dark:text-fossil-100">
                Three steps, zero manual effort
              </h2>
            </RevealSection>

            <div className="flex flex-col sm:flex-row gap-6 sm:gap-4">
              {STEPS.map((step, i) => (
                <RevealSection key={step.num} delay={i * 120} className="flex-1">
                  <div className="relative text-center sm:text-left">
                    {/* Connector line (desktop only) */}
                    {i < STEPS.length - 1 && (
                      <div className="hidden sm:block absolute top-5 left-[calc(50%+24px)] w-[calc(100%-48px)] h-px bg-fossil-200 dark:bg-fossil-700" />
                    )}
                    {/* Number circle */}
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-accent text-white font-bold text-sm mb-3 relative z-10">
                      {step.num}
                    </div>
                    <h3 className="text-sm font-bold text-fossil-800 dark:text-fossil-200 mb-1">
                      {step.title}
                    </h3>
                    <p className="text-xs text-fossil-500 dark:text-fossil-400 leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </RevealSection>
              ))}
            </div>
          </div>
        </section>

        {/* ── Try it out ─────────────────────────────────────────── */}
        <section className="flex-shrink-0 px-4 sm:px-6 pb-16 sm:pb-24">
          <div className="max-w-3xl mx-auto">
            <RevealSection className="text-center mb-8">
              <p className="text-xs font-bold text-accent uppercase tracking-widest mb-2">Try It Out</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-fossil-800 dark:text-fossil-100">
                Analyze a popular open-source project
              </h2>
            </RevealSection>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {DEMO_REPOS.map((repo, i) => (
                <RevealSection key={repo.url} delay={i * 80}>
                  <button
                    onClick={() => handleRepoClick(repo)}
                    className="w-full text-left p-4 rounded-xl border border-fossil-200 dark:border-fossil-700 bg-white dark:bg-fossil-800 hover:border-accent dark:hover:border-accent hover:shadow-md transition-all group relative"
                  >
                    {repo.demoName && (
                      <span className="absolute top-2.5 right-2.5 text-[9px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-bold uppercase tracking-wide">
                        Instant
                      </span>
                    )}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: repo.langColor }} />
                      <span className="text-sm font-semibold text-fossil-800 dark:text-fossil-200 group-hover:text-accent transition-colors">
                        {repo.name}
                      </span>
                    </div>
                    <p className="text-xs text-fossil-500 dark:text-fossil-400 leading-relaxed">
                      {repo.desc}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-fossil-100 dark:bg-fossil-700 text-fossil-500 dark:text-fossil-400">
                        {repo.lang}
                      </span>
                    </div>
                  </button>
                </RevealSection>
              ))}
            </div>
          </div>
        </section>

        {/* ── Tech stack strip ────────────────────────────────────── */}
        <section className="flex-shrink-0 px-4 sm:px-6 pb-12 sm:pb-16">
          <RevealSection className="max-w-2xl mx-auto text-center">
            <p className="text-[10px] font-bold text-fossil-400 dark:text-fossil-500 uppercase tracking-widest mb-4">
              Built with
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {TECH_STACK.map((tech) => (
                <span
                  key={tech.name}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-fossil-800 border border-fossil-200 dark:border-fossil-700 text-[11px] font-medium text-fossil-600 dark:text-fossil-400"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tech.color }}
                  />
                  {tech.name}
                </span>
              ))}
            </div>
          </RevealSection>
        </section>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <footer className="flex-shrink-0 border-t border-fossil-200 dark:border-fossil-700 py-6 px-4 text-center">
          <p className="text-[11px] text-fossil-400 dark:text-fossil-500">
            FossilAI — AI-powered code archaeology. Open source.
          </p>
        </footer>

      </div>
    </div>
  )
}
