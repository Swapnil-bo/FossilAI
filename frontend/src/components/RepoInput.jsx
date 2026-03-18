import { useState } from 'react'
import { useAnalysis } from '../hooks/useAnalysis'

const GITHUB_URL_RE =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/

function validateGitHubUrl(url) {
  const trimmed = url.trim()
  if (!trimmed) return 'Please enter a GitHub repository URL'
  if (!GITHUB_URL_RE.test(trimmed))
    return 'Invalid URL. Expected format: https://github.com/owner/repo'
  return null
}

// Quick-link repos in the header bar. demoName non-null = loads instantly from demo endpoint.
const QUICK_REPOS = [
  { url: 'https://github.com/expressjs/express', demoName: 'express' },
  { url: 'https://github.com/pallets/flask', demoName: null },
  { url: 'https://github.com/tiangolo/fastapi', demoName: null },
]

export default function RepoInput() {
  const [url, setUrl] = useState('')
  const [validationError, setValidationError] = useState(null)
  const { analyzeRepo, loadDemoRepo, status } = useAnalysis()
  const isLoading = status === 'loading'

  const handleChange = (e) => {
    setUrl(e.target.value)
    if (validationError) setValidationError(null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const error = validateGitHubUrl(url)
    if (error) {
      setValidationError(error)
      return
    }
    setValidationError(null)
    analyzeRepo(url.trim())
  }

  const handleExampleClick = (repo) => {
    setUrl(repo.url)
    setValidationError(null)
    if (repo.demoName) {
      loadDemoRepo(repo.demoName, repo.url)
    } else {
      analyzeRepo(repo.url)
    }
  }

  return (
    <div className="flex flex-col gap-1 flex-1 max-w-2xl">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={url}
            onChange={handleChange}
            placeholder="https://github.com/owner/repo"
            disabled={isLoading}
            className={`w-full px-4 py-2 rounded-lg border bg-white dark:bg-fossil-700 text-fossil-800 dark:text-fossil-200 placeholder-fossil-400 dark:placeholder-fossil-500 focus:outline-none focus:ring-2 focus:border-transparent disabled:opacity-50 text-sm transition-colors ${
              validationError
                ? 'border-severity-critical focus:ring-severity-critical'
                : 'border-fossil-300 dark:border-fossil-600 focus:ring-accent'
            }`}
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="px-5 py-2 rounded-lg bg-accent hover:bg-accent-dark text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Analyzing...
            </span>
          ) : (
            'Analyze'
          )}
        </button>
      </form>

      {validationError && (
        <p className="text-severity-critical text-xs px-1">{validationError}</p>
      )}

      {status === 'idle' && !url && (
        <div className="flex items-center gap-1.5 px-1">
          <span className="text-fossil-400 dark:text-fossil-500 text-xs">
            Try:
          </span>
          {QUICK_REPOS.map((repo) => {
            const name = repo.url.split('/').slice(-2).join('/')
            return (
              <button
                key={repo.url}
                onClick={() => handleExampleClick(repo)}
                className="text-xs text-accent hover:text-accent-light transition-colors underline underline-offset-2 flex items-center gap-1"
              >
                {name}
                {repo.demoName && (
                  <span className="no-underline text-[8px] px-1 py-px rounded bg-accent/15 text-accent font-bold uppercase leading-none">
                    demo
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
