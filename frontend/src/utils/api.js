import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 300000, // 5 minutes — Gemini analysis can take a while
})

export async function analyzeRepo(repoUrl) {
  const response = await api.post('/analyze', { repo_url: repoUrl })
  return response.data
}

export async function getAnalysisStatus(repoUrl) {
  const response = await api.get('/analyze/status', {
    params: { repo_url: repoUrl },
  })
  return response.data
}

export async function simulateRefactor(repoUrl, scenario, targetFiles = []) {
  const response = await api.post('/refactor', {
    repo_url: repoUrl,
    scenario,
    target_files: targetFiles,
  })
  return response.data
}

export async function chatMessage(repoUrl, message, history = []) {
  const response = await api.post('/chat', {
    repo_url: repoUrl,
    message,
    history,
  })
  return response.data
}

export async function fetchDemoRepos() {
  const response = await api.get('/demo/repos')
  return response.data.repos
}

export async function fetchDemoAnalysis(repoName) {
  const response = await api.get(`/demo/analysis/${repoName}`)
  return response.data
}

export async function fetchAnalytics() {
  const response = await api.get('/analytics')
  return response.data.records
}

export async function fetchAnalyticsSummary() {
  const response = await api.get('/analytics/summary')
  return response.data
}

export default api
