# CLAUDE.md — FossilAI: AI Code Archaeologist

## Project Vision
FossilAI reverse-engineers the intent behind any GitHub repository. It builds an interactive dependency graph, generates Architectural Decision Records (ADRs) explaining *why* things were built a certain way, identifies tech debt hotspots, and simulates "what if you refactored X?" scenarios — all powered by LLMs. Think of it as giving every codebase a senior engineer's code review.

**Target:** High-impact AI/ML portfolio project for internship applications by June 2025.

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | React 18 + Vite + React Flow | Interactive dependency graph, fast HMR, Vercel-ready |
| **Styling** | Tailwind CSS | Rapid UI iteration, consistent design system |
| **Backend** | Python FastAPI | Async-first, lightweight, excellent for orchestrating API calls |
| **Deep Analysis LLM** | Gemini 2.5 Flash API | Large context window — chunked at 200K tokens per request to respect free-tier TPM |
| **Structured Extraction LLM** | Groq API (Llama 3.1 8B) | Sub-second JSON extraction, free tier = 30 req/min |
| **Code Parsing** | Regex-based import extractor | Zero-dependency, deploys anywhere, no C bindings — 80% of tree-sitter accuracy |
| **Repo Fetching** | GitHub API `/zipball` endpoint | Single API call downloads entire repo as zip, extracted in-memory |
| **State Management** | React Context + useReducer | No Redux — overkill for this app's state shape |
| **Caching** | SQLite (via aiosqlite) | Zero-config persistent cache for analysis results |
| **Deployment** | Vercel (frontend) + Render (backend) | Free tier, proven combo from past projects |

---

## Hardware Constraints (MacBook Air M1 — 8GB RAM)

- **NO local model inference.** All LLM work goes to Gemini and Groq cloud APIs.
- Backend must stay lightweight — FastAPI + uvicorn, no heavy ML libraries.
- Regex-based import extraction — no C bindings, no compilation, deploys to any platform.
- SQLite for caching — no Postgres/Redis overhead.
- GitHub `/zipball` endpoint — downloads entire repo in one API call, extracted in-memory via Python's `zipfile`, then discarded. No disk bloat.

---

## API Rate Limit Strategy

### Gemini 2.5 Flash (Free Tier) — CONSERVATIVE ESTIMATES
- **Limits (assume worst case):** 15 RPM, ~250K TPM, 1500 RPD
- **Hard rule:** Cap every request at **200,000 tokens max** (prompt + file contents combined).
- **Strategy for small repos (<200K tokens):** Single API call. One request = full analysis.
- **Strategy for medium repos (200K–600K tokens):** Chunk by top-level directory into 2-3 batches. Enforce a **60-second sleep** between requests to fully reset the TPM counter.
- **Strategy for large repos (>600K tokens):** Analyze only the most important files (entry points, routers, models, configs). Skip tests, docs, and generated files. Display a warning: "Large repo — analyzing core modules only."
- **Fallback:** On any `RESOURCE_EXHAUSTED` or 429 error, wait 60s and retry. Max 2 retries per chunk.
- **IMPORTANT:** Always verify current free-tier limits at https://ai.google.dev/pricing before launch. Limits change frequently.

### Groq API (Free Tier)
- **Limits:** 30 RPM, ~6,000 token context window for Llama 3.1 8B
- **Hard rule:** Each Groq call receives **ONLY the relevant section** of Gemini's analysis — NOT the full output, NOT the file tree. Max ~4K tokens input per call.
- **Strategy:** Gemini's analysis prompt is structured into labeled sections (ARCHITECTURE, DECISIONS, TECH_DEBT, etc.). Each Groq call receives ONLY its corresponding section. Example: `extract_adrs()` receives only the DECISIONS section, never the full analysis.
- **Fallback:** Exponential backoff with 3 retries. Queue requests with a 2s minimum gap. If JSON parsing fails, one self-healing retry with "Fix this JSON:" prefix.

### GitHub API
- **Limits:** 60 req/hr (unauthenticated), 5000 req/hr (with token)
- **Strategy:** Use the `/zipball/{branch}` endpoint — downloads entire repo as a .zip in **ONE API call**. Extract in-memory with Python's `zipfile` module, filter for code files, discard the zip immediately. Cache the extracted file contents in SQLite so re-analysis never hits GitHub again.
- **File filtering:** Skip binaries, images, lock files, node_modules, files >100KB, and non-code extensions.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   REACT FRONTEND                     │
│                                                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Repo URL │  │ React Flow   │  │ Analysis      │  │
│  │ Input    │→ │ Dependency   │  │ Panels (ADRs, │  │
│  │          │  │ Graph        │  │ Tech Debt,    │  │
│  │          │  │              │  │ Refactor Sim) │  │
│  └──────────┘  └──────────────┘  └───────────────┘  │
└──────────────────┬──────────────────────────────────┘
                   │ REST API
┌──────────────────▼──────────────────────────────────┐
│                 FASTAPI BACKEND                      │
│                                                      │
│  ┌─────────┐  ┌──────────┐  ┌─────────────────────┐ │
│  │ GitHub  │  │ Regex    │  │ LLM Orchestrator    │ │
│  │ Zipball │→ │ Import   │→ │                     │ │
│  │ Fetcher │  │ Extractor│  │ Gemini: Deep reason  │ │
│  │         │  │          │  │ Groq: JSON extract   │ │
│  └─────────┘  └──────────┘  └─────────────────────┘ │
│                                                      │
│  ┌──────────────────────────────────────────────────┐│
│  │ SQLite Cache (repo data + analysis results)      ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

---

## Two-Pass LLM Analysis Strategy

### Pass 1: Gemini 2.5 Flash — Deep Architectural Analysis
- **Input:** Repo file tree + file contents (chunked at 200K tokens max per request) + regex-extracted import map
- **Prompt structured into labeled sections** (critical for Pass 2 slicing):
  - `[ARCHITECTURE]` — High-level pattern identification (MVC, microservices, monolith, etc.)
  - `[MODULES]` — Module-by-module purpose descriptions
  - `[DECISIONS]` — Inferred architectural decisions and their likely reasoning
  - `[TECH_DEBT]` — Tech debt identification with severity ratings
  - `[DEPENDENCIES]` — Dependency graph with import/call/inherit relationships
  - `[REFACTORING]` — Refactoring opportunity suggestions
- **Output:** Long-form markdown analysis with clearly labeled sections (Gemini reasons better in prose)
- **Multi-chunk merging:** If repo requires 2-3 chunks, each chunk's analysis is merged by section label.

### Pass 2: Groq (Llama 3.1 8B) — Structured JSON Extraction
- **CRITICAL:** Each Groq call receives ONLY the relevant section from Gemini's output — never the full analysis.
- **Slicing strategy:**
  1. `extract_dependency_graph()` ← receives ONLY `[DEPENDENCIES]` section (~1-2K tokens)
  2. `extract_adrs()` ← receives ONLY `[DECISIONS]` section (~1-2K tokens)
  3. `extract_tech_debt()` ← receives ONLY `[TECH_DEBT]` section (~1-2K tokens)
  4. `extract_refactor_seeds()` ← receives ONLY `[REFACTORING]` section (~1-2K tokens)
- **Each call stays under 4K tokens input** — well within Groq's ~6-8K context window.
- **Output:** Clean, typed JSON ready for the React frontend.

### Why Two Passes?
- Gemini excels at deep reasoning over large context but is slower and less reliable for structured output.
- Groq is insanely fast at structured extraction but has a small context window (~6-8K tokens for free tier models).
- Gemini's labeled sections act as a natural "splitter" — each section becomes a focused Groq input.
- Splitting the work plays to each model's strength and stays within free-tier limits.

---

## Directory Structure

```
FossilAI/
├── CLAUDE.md
├── README.md
│
├── backend/
│   ├── requirements.txt
│   ├── main.py                    # FastAPI app entry point
│   ├── config.py                  # API keys, rate limit constants
│   │
│   ├── routers/
│   │   ├── analyze.py             # POST /analyze — main analysis endpoint
│   │   ├── refactor.py            # POST /refactor — "what if" simulation
│   │   └── health.py              # GET /health
│   │
│   ├── services/
│   │   ├── github_fetcher.py      # Download repo via /zipball, extract in-memory
│   │   ├── import_extractor.py    # Regex-based import/require extraction (no C bindings)
│   │   ├── gemini_analyzer.py     # Pass 1: Deep analysis via Gemini 2.5 Flash
│   │   ├── groq_extractor.py      # Pass 2: Structured JSON extraction via Groq
│   │   ├── section_slicer.py      # Slice Gemini's labeled output into per-section chunks
│   │   ├── chunker.py             # Smart file chunking (200K token cap per request)
│   │   └── cache.py               # SQLite caching layer
│   │
│   ├── models/
│   │   ├── schemas.py             # Pydantic models for all request/response types
│   │   └── prompts.py             # All LLM prompt templates (versioned, tunable)
│   │
│   ├── utils/
│   │   ├── rate_limiter.py        # Async rate limiter with exponential backoff
│   │   └── token_counter.py       # Estimate token counts before API calls
│   │
│   └── db/
│       └── fossil.db              # SQLite database (auto-created)
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── index.html
│   │
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx                # Top-level layout + routing
│   │   │
│   │   ├── context/
│   │   │   └── AnalysisContext.jsx # Global state: repo data, analysis results, loading
│   │   │
│   │   ├── components/
│   │   │   ├── RepoInput.jsx      # URL input + "Analyze" button
│   │   │   ├── LoadingState.jsx   # Skeleton + progress indicators during analysis
│   │   │   ├── DependencyGraph.jsx # React Flow interactive graph
│   │   │   ├── NodeDetail.jsx     # Click a node → see file details + analysis
│   │   │   ├── ADRPanel.jsx       # List of Architectural Decision Records
│   │   │   ├── ADRCard.jsx        # Single ADR display card
│   │   │   ├── TechDebtMap.jsx    # Heatmap-style tech debt visualization
│   │   │   ├── RefactorSim.jsx    # "What if?" refactor scenario UI
│   │   │   └── ExportButton.jsx   # Export analysis as PDF/Markdown
│   │   │
│   │   ├── hooks/
│   │   │   ├── useAnalysis.js     # Custom hook: trigger analysis + poll status
│   │   │   └── useGraphLayout.js  # Custom hook: auto-layout React Flow graph
│   │   │
│   │   ├── utils/
│   │   │   ├── api.js             # Axios instance + API call functions
│   │   │   └── graphHelpers.js    # Transform JSON → React Flow nodes/edges
│   │   │
│   │   └── styles/
│   │       └── globals.css        # Tailwind base + custom component styles
│   │
│   └── public/
│       └── favicon.svg
│
└── .gitignore
```

---

## Build Phases (One Commit Per Step)

### PHASE 1: Project Skeleton + Backend Foundation
**Goal:** Runnable FastAPI backend that can fetch and cache a GitHub repo.

**Step 1:** Initialize project structure
- Create all directories as shown above
- Initialize `backend/requirements.txt` with: `fastapi, uvicorn, httpx, aiosqlite, python-dotenv`
- Initialize `frontend/` with Vite + React template
- Create `.gitignore` (Python + Node + .env + db files)
- **Commit:** `feat: initialize project skeleton with backend and frontend structure`

**Step 2:** Set up FastAPI app with config
- `main.py` — FastAPI app with CORS middleware (allow Vercel origin + localhost)
- `config.py` — Load env vars: `GITHUB_TOKEN`, `GEMINI_API_KEY`, `GROQ_API_KEY`
- `routers/health.py` — GET /health returns `{"status": "ok"}`
- **Commit:** `feat: set up FastAPI app with CORS and health endpoint`

**Step 3:** Build GitHub repo fetcher (zipball approach)
- `services/github_fetcher.py`:
  - `fetch_repo_zipball(owner, repo, branch="main")` — GET `/repos/{owner}/{repo}/zipball/{branch}`
  - Downloads entire repo as a .zip in **ONE API call**
  - Extract in-memory using Python's `zipfile.ZipFile` + `io.BytesIO` — never touches disk
  - `filter_code_files(zip_contents)` — returns only code files:
    - Skip: images, binaries, lock files, node_modules, .git, __pycache__, files >100KB
    - Keep: .py, .js, .ts, .jsx, .tsx, .java, .go, .rs, .rb, .php, .css, .html, .json, .yaml, .toml, .md
  - Returns: `dict[filepath, content_string]` + `file_tree_string`
  - Immediately discard the zip after extraction to free memory
- **Commit:** `feat: add GitHub zipball fetcher with in-memory extraction`

**Step 4:** Add SQLite caching layer
- `services/cache.py`:
  - Table `repos`: `repo_url TEXT PRIMARY KEY, tree_data TEXT, fetched_at TIMESTAMP`
  - Table `analyses`: `repo_url TEXT PRIMARY KEY, analysis_json TEXT, created_at TIMESTAMP`
  - `get_cached_repo(url)`, `cache_repo(url, data)`, `get_cached_analysis(url)`, `cache_analysis(url, data)`
  - Cache TTL: 24 hours for repos, 1 hour for analyses
- **Commit:** `feat: add SQLite caching layer for repos and analysis results`

**Step 5:** Build analyze router (repo fetch only, no LLM yet)
- `routers/analyze.py`:
  - POST `/analyze` accepts `{"repo_url": "https://github.com/owner/repo"}`
  - Parse owner/repo from URL
  - Check cache → if miss, fetch via GitHub API → cache result
  - Return: `{"status": "fetched", "file_count": N, "total_tokens_estimate": M}`
- `utils/token_counter.py` — rough token estimator (chars / 4)
- **Commit:** `feat: add /analyze endpoint with GitHub fetching and caching`

---

### PHASE 2: Import Extraction + LLM Analysis Pipeline
**Goal:** Regex import parsing + Gemini deep analysis + Groq structured extraction.

**Step 6:** Add regex-based import extraction
- `services/import_extractor.py` (pure Python — no C bindings, deploys anywhere):
  - Language-specific regex patterns for extracting imports:
    - Python: `import X`, `from X import Y`
    - JavaScript/TypeScript: `import ... from '...'`, `require('...')`
    - Java: `import com.example.Class`
    - Go: `import "package"`
    - Rust: `use crate::module`
  - `extract_imports(filename, content)` → list of import targets
  - `build_import_map(files)` → adjacency list: `{file: [imports...]}`
  - Resolve relative imports to actual file paths where possible
  - This gives us a **structural skeleton** before Gemini even runs — the LLM then enriches it with semantic understanding (call relationships, inheritance, architectural intent)
- **Why regex over tree-sitter:** tree-sitter requires compiling C bindings per language, which creates deployment headaches on Render's Linux containers (especially for an M1 dev → Linux prod mismatch). Regex covers the 80% case (imports) without any compilation step. Gemini handles the remaining 20% (call graphs, inheritance) during its analysis pass.
- **Commit:** `feat: add regex-based import extraction for dependency mapping`

**Step 7:** Build smart file chunker (200K token cap)
- `services/chunker.py`:
  - `chunk_repo_for_gemini(files, max_tokens=200000)`:
    - If total tokens < 200K → return single chunk (one API call — ideal case)
    - If 200K–600K → group files by top-level directory, create 2-3 chunks under 200K each
    - If >600K → prioritize entry points, routers, models, configs. Skip tests/docs/generated files. Warn user.
    - Each chunk always includes: full file tree (for structural context) + file contents for that chunk's subset
  - `prepare_gemini_prompt(chunk, repo_metadata, import_map)` — format the analysis prompt with labeled sections
- `services/section_slicer.py`:
  - `slice_gemini_output(raw_analysis)` → `dict[section_name, section_text]`
  - Splits Gemini's response by `[ARCHITECTURE]`, `[DECISIONS]`, `[TECH_DEBT]`, etc. labels
  - Each section becomes an independent Groq input (stays under 4K tokens)
- **Commit:** `feat: add smart file chunker with 200K token cap and section slicer`

**Step 8:** Build Gemini deep analysis service
- `services/gemini_analyzer.py`:
  - `analyze_repo(repo_files, repo_tree, import_map)`:
    - Chunk the repo via `chunker.py`
    - For each chunk, call Gemini 2.5 Flash with the deep analysis prompt
    - **If multiple chunks: enforce 60-second sleep between API calls** to reset TPM counter
    - Merge multi-chunk results by section label into unified analysis
  - Prompt template in `models/prompts.py` — GEMINI_ANALYSIS_PROMPT:
    ```
    You are a senior software architect performing a comprehensive code review.
    Analyze this codebase and respond with clearly labeled sections using the exact headers below.

    [ARCHITECTURE]
    What architectural pattern is used? (MVC, microservices, monolith, etc.)
    Explain the overall structure and how components connect.

    [MODULES]
    For each major module/directory, explain its purpose and responsibilities.

    [DECISIONS]
    List 5-10 key architectural decisions you can infer. For each:
    - What was decided
    - Why it was likely decided that way (infer from code patterns, comments, dependencies)
    - What alternatives existed

    [TECH_DEBT]
    Identify the top 5-10 tech debt hotspots. For each:
    - File(s) affected
    - Type of debt (complexity, duplication, outdated patterns, missing tests, tight coupling)
    - Severity (critical / high / medium / low)
    - Suggested fix

    [DEPENDENCIES]
    Here is a pre-extracted import map: {import_map}
    Enrich this with call relationships, inheritance, and any dependencies the regex missed.
    List all dependency relationships between files/modules.

    [REFACTORING]
    Suggest 3-5 concrete refactoring opportunities with expected impact.

    Repository file tree:
    {file_tree}

    File contents:
    {file_contents}
    ```
  - Use `httpx.AsyncClient` for async Gemini API calls
  - Implement retry with exponential backoff (max 2 retries, 60s wait on RESOURCE_EXHAUSTED)
- **Commit:** `feat: add Gemini 2.5 Flash deep analysis with labeled sections`

**Step 9:** Build Groq structured extraction service
- `services/groq_extractor.py`:
  - **Each function receives ONLY its relevant section** (sliced by `section_slicer.py`):
  - `extract_dependency_graph(dependencies_section)` → JSON nodes + edges
  - `extract_adrs(decisions_section)` → JSON array of ADRs
  - `extract_tech_debt(tech_debt_section)` → JSON array with severity scores
  - Each function: focused Groq prompt (<4K tokens) → parse JSON response → validate with Pydantic
  - Prompt template example (GROQ_DEPENDENCY_PROMPT):
    ```
    Extract the dependency graph from this analysis as a JSON object.
    Return ONLY valid JSON, no markdown, no explanation.
    {
      "nodes": [{"id": "filepath", "label": "filename", "type": "file|module|package", "description": "..."}],
      "edges": [{"source": "filepath", "target": "filepath", "type": "import|call|inherit"}]
    }

    Analysis (dependencies section only):
    {dependencies_section}
    ```
  - **NOTE:** No file tree is passed to Groq — only the pre-sliced section. This keeps every call well under the ~6-8K context limit.
- `models/schemas.py` — Pydantic models:
  - `GraphNode`, `GraphEdge`, `DependencyGraph`
  - `ADR` (title, context, decision, consequences, status)
  - `TechDebtItem` (file, type, severity, description, suggested_fix)
  - `AnalysisResult` (architecture, dependency_graph, adrs, tech_debt)
- **Commit:** `feat: add Groq structured JSON extraction with section slicing`

**Step 10:** Wire up the full analysis pipeline
- `utils/rate_limiter.py`:
  - Async rate limiter class with configurable RPM
  - Exponential backoff: 1s → 2s → 4s on 429 errors
- Update `routers/analyze.py`:
  - POST `/analyze` now runs full pipeline:
    1. Fetch repo via zipball (cached)
    2. Extract imports via regex
    3. Chunk files (200K token cap)
    4. Analyze with Gemini (60s cooldown between chunks)
    5. Slice Gemini output by section labels
    6. Extract structured data with Groq (one call per section)
    7. Cache final result
    8. Return `AnalysisResult`
  - Add status tracking: `{"status": "fetching" | "parsing" | "analyzing" | "extracting" | "complete"}`
- **Commit:** `feat: wire up complete analysis pipeline with rate limiting`

---

### PHASE 3: React Frontend — Core UI
**Goal:** Working frontend with repo input, dependency graph, and analysis panels.

**Step 11:** Set up React frontend with Tailwind + React Flow
- `npm install reactflow tailwindcss @tailwindcss/typography axios`
- Configure Tailwind with dark mode support
- `App.jsx` — layout: left sidebar (panels) + main area (graph)
- `context/AnalysisContext.jsx` — useReducer with states: `idle | loading | loaded | error`
- **Commit:** `feat: set up React frontend with Tailwind and React Flow`

**Step 12:** Build RepoInput + Loading State
- `components/RepoInput.jsx`:
  - Input field for GitHub URL (validate format: `github.com/owner/repo`)
  - "Analyze" button → triggers POST `/analyze`
  - URL parsing: extract owner/repo from various GitHub URL formats
- `components/LoadingState.jsx`:
  - Multi-step progress indicator: Fetching → Parsing → Analyzing → Extracting
  - Skeleton loaders for graph and panels
  - Fun loading messages: "Reading the git blame so you don't have to..."
- `hooks/useAnalysis.js`:
  - `analyzeRepo(url)` — POST to backend, handle loading/error states
  - Store result in AnalysisContext
- `utils/api.js` — Axios instance with base URL from env var
- **Commit:** `feat: add repo input component with loading states`

**Step 13:** Build interactive Dependency Graph
- `components/DependencyGraph.jsx`:
  - Transform `dependency_graph.json` → React Flow nodes and edges
  - Node types:
    - `fileNode` — individual file (colored by language)
    - `moduleNode` — directory/package (grouped)
  - Edge types:
    - `import` — solid line
    - `call` — dashed line
    - `inherit` — dotted line with arrow
  - Features:
    - Auto-layout using dagre algorithm
    - Click node → open NodeDetail panel
    - Zoom, pan, minimap
    - Color-code nodes by tech debt severity
- `utils/graphHelpers.js`:
  - `transformToReactFlow(dependencyGraph)` → { nodes, edges }
  - `applyTechDebtColors(nodes, techDebt)` — green/yellow/orange/red
- `hooks/useGraphLayout.js` — dagre layout calculation
- **Commit:** `feat: add interactive React Flow dependency graph`

**Step 14:** Build Node Detail panel
- `components/NodeDetail.jsx`:
  - Appears when a graph node is clicked
  - Shows: file path, language, purpose description, imports, exports
  - Tech debt badge (severity color + type)
  - Related ADRs (if any reference this file)
  - "Simulate Refactor" button (links to RefactorSim)
- **Commit:** `feat: add node detail panel with file analysis display`

---

### PHASE 4: ADRs, Tech Debt, and Refactor Simulation
**Goal:** Complete the analysis UI and add the "killer feature" — refactor simulation.

**Step 15:** Build ADR Panel
- `components/ADRPanel.jsx`:
  - Scrollable list of Architectural Decision Records
  - Filter/search by keyword
  - Sort by: relevance, severity of impact
- `components/ADRCard.jsx`:
  - Expandable card showing: Title, Context, Decision, Consequences, Status
  - Status badges: `accepted | deprecated | superseded`
  - Links to related graph nodes
- **Commit:** `feat: add ADR panel with filterable decision records`

**Step 16:** Build Tech Debt Heatmap
- `components/TechDebtMap.jsx`:
  - Visual heatmap of the repository's tech debt
  - Grid layout: each cell = one file/module
  - Color intensity = debt severity (green → yellow → orange → red)
  - Hover: tooltip with debt type + description
  - Click: navigate to that node in the dependency graph
  - Summary stats at top: total items by severity, worst hotspot
- **Commit:** `feat: add tech debt heatmap visualization`

**Step 17:** Build Refactor Simulation ("What If?" feature)
- Backend: `routers/refactor.py`:
  - POST `/refactor` accepts `{"repo_url": "...", "scenario": "...", "target_files": [...]}`
  - Takes the cached analysis + user's refactor scenario
  - Sends to Gemini: "Given this codebase analysis, simulate what would happen if: {scenario}"
  - Gemini returns: impact assessment, files affected, risk level, suggested steps
  - Groq extracts: structured impact JSON (affected nodes, new edges, removed edges)
- Frontend: `components/RefactorSim.jsx`:
  - Dropdown: preset scenarios ("Extract this into a microservice", "Replace X with Y", "Remove this dependency")
  - Free-text input for custom scenarios
  - "Simulate" button → calls backend
  - Results: before/after graph diff, impact summary, risk meter
  - Highlight affected nodes in the dependency graph (pulsing animation)
- **Commit:** `feat: add refactor simulation with before/after graph diff`

---

### PHASE 5: Polish, Export, and Deploy
**Goal:** Production-ready, demo-worthy, deployed.

**Step 18:** Add export functionality
- `components/ExportButton.jsx`:
  - Export full analysis as Markdown file
  - Export dependency graph as PNG (React Flow's `toImage()`)
  - Export ADRs as individual markdown files
  - Download as .zip bundle
- **Commit:** `feat: add export to Markdown/PNG with zip download`

**Step 19:** UI polish and responsive design
- Dark mode toggle (Tailwind dark: classes)
- Responsive layout: mobile = stacked panels, desktop = sidebar + graph
- Smooth transitions between analysis states
- Error boundaries with helpful messages
- Empty states with example repos to try
- **Commit:** `feat: add dark mode, responsive design, and UI polish`

**Step 20:** Deploy to Vercel + Render (with cold start fix)
- Frontend: Connect to Vercel, set env vars (`VITE_API_URL`)
- Backend: Deploy to Render free tier, set env vars (API keys)
- **CRITICAL — Render Cold Start Fix:**
  - Render free tier spins down after 15 minutes of inactivity (50+ second cold start)
  - Set up a free cron job at https://cron-job.org to ping `GET /health` every 14 minutes
  - This keeps the backend warm so it responds instantly when a recruiter clicks "Analyze"
  - Alternative: UptimeRobot (free tier, 5-minute intervals) also works
- Add rate limit headers to responses for frontend awareness
- Test end-to-end with 3 real repos:
  - Small: A personal project (<20 files)
  - Medium: An open-source tool (~50-100 files)
  - Large: A well-known repo (e.g., express.js, fastapi)
- **Commit:** `feat: deploy to Vercel and Render with production config and keepalive`

**Step 21:** Write portfolio README
- Project banner/logo
- Animated GIF demo showing: input URL → loading → graph appears → click through features
- Architecture diagram
- Tech stack badges
- "Why I built this" section (tie to PM/engineering skills)
- "How it works" technical deep-dive
- Setup instructions
- Link to live demo
- **Commit:** `docs: add comprehensive portfolio README with demo GIF`

---

## Prompt Engineering Notes

### Gemini Prompts
- Always include the FULL file tree at the start — gives Gemini structural context before reading code.
- Use XML-style section markers in prompts (`<file_tree>`, `<file_contents>`) — Gemini handles these well.
- Ask Gemini to "think step by step" for architectural decisions — improves reasoning quality.
- End prompts with "Be specific. Reference actual file names and line patterns." to reduce vagueness.

### Groq Prompts
- Always specify "Return ONLY valid JSON. No markdown fences. No explanation."
- Include a concrete example of the expected JSON shape in every prompt.
- **NEVER pass the full Gemini analysis or file tree.** Only pass the relevant sliced section.
- Keep total input under 4K tokens per call — leaves room for output within the ~6-8K context window.
- If JSON parsing fails, retry ONCE with an appended "Fix this JSON:" + the broken output.

---

## Error Handling Patterns

- **GitHub 404:** "Repository not found. Check if the URL is correct and the repo is public."
- **GitHub 403:** "Rate limited by GitHub. Please wait 60 seconds or add a GitHub token."
- **Gemini 429 / RESOURCE_EXHAUSTED:** Wait 60 seconds (full TPM reset), then retry. Max 2 retries per chunk. If still failing: "Analysis service is overloaded. Please try again in a few minutes."
- **Groq 429:** Queue and retry with 2s gap. Max 5 retries.
- **Groq JSON parse fail:** One self-healing retry (send broken JSON back with "Fix this JSON:" prompt).
- **Groq context overflow:** If a sliced section still exceeds ~5K tokens, truncate to the first 4K tokens and add "...truncated. Focus on the items above."
- **Repo too large (>600K tokens):** "This repo is very large. Analyzing core modules only (entry points, routers, models, configs). Tests and docs are excluded."

---

## Key Decisions Log

1. **Python FastAPI over Node.js** — FastAPI's async is perfect for parallel API calls; Swapnil has more experience with this stack; Python's `zipfile` and regex libraries are batteries-included.
2. **Two-pass LLM strategy with section slicing** — Gemini for reasoning (large context), Groq for structure (fast JSON). Gemini outputs labeled sections → each section is sliced and sent independently to Groq. Keeps every Groq call under 4K tokens.
3. **GitHub zipball over REST file-by-file** — One API call instead of hundreds. In-memory extraction via `zipfile` + `io.BytesIO`. No disk I/O, no sequential fetching delays.
4. **Regex import extraction over tree-sitter** — tree-sitter requires C bindings that create deployment issues (M1 dev → Linux prod). Regex covers import extraction for 6+ languages with zero dependencies. Gemini handles the deeper semantic analysis (call graphs, inheritance) that regex can't.
5. **200K token cap per Gemini request** — Conservative estimate of free-tier TPM limits. Prevents RESOURCE_EXHAUSTED errors. 60-second cooldown between multi-chunk requests.
6. **SQLite over Postgres/Redis** — Zero config, single file, perfect for a portfolio project. No infra to manage.
7. **React Flow over D3** — Higher-level API, built-in interactions (zoom, pan, drag), better DX for this use case.
8. **useReducer over Redux** — State shape is simple (one repo analysis at a time). No need for Redux complexity.
9. **dagre for graph layout** — Standard hierarchical layout algorithm. Works well for dependency graphs. Used by React Flow community.
10. **Render cron ping for cold start** — Free cron job pings /health every 14 minutes. Prevents 50s+ cold starts that would kill recruiter demos.

---

## Git Workflow

- **One commit per step** (21 steps = 21+ commits)
- Commit messages follow: `type: description` (feat, fix, docs, refactor, style, test)
- Push after every commit — keep the contribution graph active
- Branch: work directly on `main` (portfolio project, solo dev)

---

## Demo Script (for recordings and interviews)

1. Open FossilAI → paste a GitHub URL (use a well-known open-source repo)
2. Watch the analysis progress: "Fetching... Parsing... Analyzing... Extracting..."
3. Dependency graph appears — zoom around, show the module clusters
4. Click a node — show the file analysis, tech debt badge, related ADRs
5. Open ADR panel — walk through 2-3 architectural decisions the AI identified
6. Open Tech Debt heatmap — point out the critical hotspots
7. Run a refactor simulation — "What if we extract the auth module into a separate service?"
8. Show the before/after graph diff and impact assessment
9. Export as Markdown — "Hand this to any new engineer joining the team"

**Time:** ~3 minutes for a full demo walkthrough.