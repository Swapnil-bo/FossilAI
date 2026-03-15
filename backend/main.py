from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import ALLOWED_ORIGINS, ALLOW_ORIGIN_REGEX
from routers.health import router as health_router
from routers.analyze import router as analyze_router
from services.cache import init_db

app = FastAPI(
    title="FossilAI",
    description="AI Code Archaeologist — reverse-engineer the intent behind any GitHub repository",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOW_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(analyze_router)


@app.on_event("startup")
async def startup():
    await init_db()
