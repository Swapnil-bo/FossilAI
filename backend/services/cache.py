from __future__ import annotations

import json
import os
import time

import aiosqlite

from config import CACHE_ANALYSIS_TTL, CACHE_REPO_TTL

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "db", "fossil.db")


async def init_db() -> None:
    """Create tables if they don't exist. Also ensures the db/ directory exists."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS repos (
                repo_url   TEXT PRIMARY KEY,
                tree_data  TEXT NOT NULL,
                file_data  TEXT NOT NULL,
                fetched_at REAL NOT NULL
            )
            """
        )
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS analyses (
                repo_url     TEXT PRIMARY KEY,
                analysis_json TEXT NOT NULL,
                created_at   REAL NOT NULL
            )
            """
        )
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS analytics (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                repo_url            TEXT NOT NULL,
                repo_name           TEXT NOT NULL,
                analyzed_at         REAL NOT NULL,
                file_count          INTEGER NOT NULL DEFAULT 0,
                token_count         INTEGER NOT NULL DEFAULT 0,
                architecture_pattern TEXT NOT NULL DEFAULT '',
                tech_debt_count     INTEGER NOT NULL DEFAULT 0,
                avg_severity        TEXT NOT NULL DEFAULT ''
            )
            """
        )
        await db.commit()


async def get_cached_repo(url: str) -> tuple[dict[str, str], str] | None:
    """Return (files, file_tree) from cache if within TTL, else None."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT tree_data, file_data, fetched_at FROM repos WHERE repo_url = ?",
            (url,),
        )
        row = await cursor.fetchone()

    if row is None:
        return None

    tree_data, file_data, fetched_at = row
    if time.time() - fetched_at > CACHE_REPO_TTL:
        return None

    files = json.loads(file_data)
    return files, tree_data


async def cache_repo(url: str, tree_data: str, file_data: dict[str, str]) -> None:
    """Store fetched repo data in cache."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT OR REPLACE INTO repos (repo_url, tree_data, file_data, fetched_at)
            VALUES (?, ?, ?, ?)
            """,
            (url, tree_data, json.dumps(file_data), time.time()),
        )
        await db.commit()


async def get_cached_analysis(url: str) -> dict | None:
    """Return cached analysis JSON if within TTL, else None."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT analysis_json, created_at FROM analyses WHERE repo_url = ?",
            (url,),
        )
        row = await cursor.fetchone()

    if row is None:
        return None

    analysis_json, created_at = row
    if time.time() - created_at > CACHE_ANALYSIS_TTL:
        return None

    return json.loads(analysis_json)


async def cache_analysis(url: str, analysis_json: dict) -> None:
    """Store analysis result in cache."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT OR REPLACE INTO analyses (repo_url, analysis_json, created_at)
            VALUES (?, ?, ?)
            """,
            (url, json.dumps(analysis_json), time.time()),
        )
        await db.commit()


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

_SEVERITY_ORDER = {"critical": 4, "high": 3, "medium": 2, "low": 1}


def _compute_avg_severity(tech_debt: list[dict]) -> str:
    """Return the average severity label from a list of tech debt items."""
    if not tech_debt:
        return ""
    scores = [_SEVERITY_ORDER.get(d.get("severity", "").lower(), 0) for d in tech_debt]
    valid = [s for s in scores if s > 0]
    if not valid:
        return ""
    avg = sum(valid) / len(valid)
    if avg >= 3.5:
        return "critical"
    if avg >= 2.5:
        return "high"
    if avg >= 1.5:
        return "medium"
    return "low"


def _extract_architecture_pattern(architecture: str) -> str:
    """Pull out a short architecture label from the free-text field."""
    if not architecture:
        return "unknown"
    text = architecture.lower()
    for pattern in [
        "microservices", "microservice",
        "monolith", "monolithic",
        "mvc", "model-view-controller",
        "middleware", "middleware-based",
        "serverless",
        "event-driven", "event driven",
        "layered",
        "modular",
        "client-server",
    ]:
        if pattern in text:
            # Normalize to a clean label
            label_map = {
                "microservices": "microservices", "microservice": "microservices",
                "monolith": "monolith", "monolithic": "monolith",
                "mvc": "MVC", "model-view-controller": "MVC",
                "middleware": "middleware", "middleware-based": "middleware",
                "serverless": "serverless",
                "event-driven": "event-driven", "event driven": "event-driven",
                "layered": "layered",
                "modular": "modular",
                "client-server": "client-server",
            }
            return label_map.get(pattern, pattern)
    return "other"


async def insert_analytics(repo_url: str, result: dict) -> None:
    """Record an analysis run in the analytics table."""
    owner = result.get("owner", "")
    repo = result.get("repo", "")
    repo_name = f"{owner}/{repo}" if owner and repo else repo_url.split("/")[-1]

    file_count = result.get("file_count", 0)
    token_count = result.get("total_tokens_estimate", 0)

    architecture = result.get("architecture", "")
    arch_pattern = _extract_architecture_pattern(architecture)

    tech_debt = result.get("tech_debt", [])
    tech_debt_count = len(tech_debt)
    avg_severity = _compute_avg_severity(tech_debt)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO analytics
                (repo_url, repo_name, analyzed_at, file_count, token_count,
                 architecture_pattern, tech_debt_count, avg_severity)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (repo_url, repo_name, time.time(), file_count, token_count,
             arch_pattern, tech_debt_count, avg_severity),
        )
        await db.commit()


async def get_analytics() -> list[dict]:
    """Return all past analyses ordered by most recent first."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """
            SELECT id, repo_url, repo_name, analyzed_at, file_count, token_count,
                   architecture_pattern, tech_debt_count, avg_severity
            FROM analytics
            ORDER BY analyzed_at DESC
            LIMIT 100
            """
        )
        rows = await cursor.fetchall()

    return [dict(row) for row in rows]


async def get_analytics_summary() -> dict:
    """Return aggregate stats across all analyzed repos."""
    async with aiosqlite.connect(DB_PATH) as db:
        # Total repos
        cursor = await db.execute("SELECT COUNT(*) FROM analytics")
        (total_repos,) = await cursor.fetchone()

        # Total files
        cursor = await db.execute("SELECT COALESCE(SUM(file_count), 0) FROM analytics")
        (total_files,) = await cursor.fetchone()

        # Total tokens
        cursor = await db.execute("SELECT COALESCE(SUM(token_count), 0) FROM analytics")
        (total_tokens,) = await cursor.fetchone()

        # Average tech debt count
        cursor = await db.execute(
            "SELECT COALESCE(AVG(tech_debt_count), 0) FROM analytics"
        )
        (avg_debt,) = await cursor.fetchone()

        # Most common architecture
        cursor = await db.execute(
            """
            SELECT architecture_pattern, COUNT(*) as cnt
            FROM analytics
            WHERE architecture_pattern != '' AND architecture_pattern != 'unknown'
            GROUP BY architecture_pattern
            ORDER BY cnt DESC
            LIMIT 1
            """
        )
        arch_row = await cursor.fetchone()
        most_common_arch = arch_row[0] if arch_row else "N/A"

    return {
        "total_repos_analyzed": total_repos,
        "total_files_analyzed": total_files,
        "total_tokens_processed": total_tokens,
        "avg_tech_debt_items": round(avg_debt, 1),
        "most_common_architecture": most_common_arch,
    }
