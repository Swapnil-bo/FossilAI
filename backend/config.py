import os
from dotenv import load_dotenv

load_dotenv()

# API Keys
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# Gemini 2.5 Flash — Free Tier Rate Limits (conservative)
GEMINI_MAX_TOKENS_PER_REQUEST = 200_000
GEMINI_RPM = 15
GEMINI_TPM = 250_000
GEMINI_RPD = 1500
GEMINI_CHUNK_COOLDOWN_SECONDS = 60
GEMINI_MAX_RETRIES = 2
GEMINI_RETRY_WAIT_SECONDS = 60

# Groq API — Free Tier Rate Limits
GROQ_RPM = 30
GROQ_MAX_INPUT_TOKENS = 4000
GROQ_CONTEXT_WINDOW = 6000
GROQ_MAX_RETRIES = 5
GROQ_MIN_REQUEST_GAP_SECONDS = 2

# GitHub API
GITHUB_UNAUTHENTICATED_RPH = 60
GITHUB_AUTHENTICATED_RPH = 5000

# File filtering
MAX_FILE_SIZE_BYTES = 100_000
CODE_EXTENSIONS = {
    ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go", ".rs",
    ".rb", ".php", ".css", ".html", ".json", ".yaml", ".yml",
    ".toml", ".md",
}
SKIP_DIRS = {"node_modules", ".git", "__pycache__", "venv", ".venv", "dist", "build"}

# Repo size thresholds (in estimated tokens)
REPO_SMALL_THRESHOLD = 200_000
REPO_MEDIUM_THRESHOLD = 600_000

# SQLite Cache TTL (seconds)
CACHE_REPO_TTL = 86400      # 24 hours
CACHE_ANALYSIS_TTL = 3600   # 1 hour

# CORS
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
]
ALLOW_ORIGIN_REGEX = r"https://.*\.vercel\.app"
