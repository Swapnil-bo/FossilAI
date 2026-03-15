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
