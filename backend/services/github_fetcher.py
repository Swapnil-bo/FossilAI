from __future__ import annotations

import io
import os
import zipfile

import httpx
from fastapi import HTTPException

from config import CODE_EXTENSIONS, GITHUB_TOKEN, MAX_FILE_SIZE_BYTES, SKIP_DIRS


def _should_skip_path(filepath: str) -> bool:
    """Check if any path component is in the skip list."""
    parts = filepath.split("/")
    return any(part in SKIP_DIRS for part in parts)


def _is_code_file(filepath: str) -> bool:
    """Check if file extension is in the allowed code extensions set."""
    _, ext = os.path.splitext(filepath)
    return ext.lower() in CODE_EXTENSIONS


def _strip_zip_prefix(filepath: str) -> str:
    """GitHub zipball wraps everything in a top-level dir like 'owner-repo-sha/'.
    Strip that prefix so paths start at the repo root."""
    parts = filepath.split("/", 1)
    return parts[1] if len(parts) > 1 else filepath


def filter_code_files(zip_bytes: bytes) -> dict[str, str]:
    """Extract code files from zip bytes in-memory.

    Returns a dict mapping cleaned file paths to their text content.
    Skips binaries, images, lock files, oversized files, and excluded dirs.
    """
    files: dict[str, str] = {}

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for info in zf.infolist():
            # Skip directories
            if info.is_dir():
                continue

            raw_path = info.filename
            clean_path = _strip_zip_prefix(raw_path)

            # Skip files in excluded directories
            if _should_skip_path(clean_path):
                continue

            # Skip files exceeding size limit
            if info.file_size > MAX_FILE_SIZE_BYTES:
                continue

            # Skip non-code files
            if not _is_code_file(clean_path):
                continue

            # Skip lock files explicitly
            basename = os.path.basename(clean_path)
            if basename in {"package-lock.json", "yarn.lock", "pnpm-lock.yaml",
                            "Pipfile.lock", "poetry.lock", "Cargo.lock",
                            "Gemfile.lock", "composer.lock", "go.sum"}:
                continue

            # Read and decode file content
            try:
                raw = zf.read(info.filename)
                content = raw.decode("utf-8", errors="replace")
                files[clean_path] = content
            except Exception:
                # Skip files that can't be read/decoded
                continue

    return files


def build_file_tree(files: dict[str, str]) -> str:
    """Build a visual file tree string from the extracted file paths."""
    if not files:
        return "(empty)"

    sorted_paths = sorted(files.keys())
    lines: list[str] = []

    for path in sorted_paths:
        depth = path.count("/")
        indent = "  " * depth
        name = os.path.basename(path)
        lines.append(f"{indent}{name}")

    return "\n".join(lines)


async def _download_zipball(
    client: httpx.AsyncClient, owner: str, repo: str, branch: str, headers: dict[str, str]
) -> httpx.Response:
    """Attempt to download a zipball for a specific branch."""
    url = f"https://api.github.com/repos/{owner}/{repo}/zipball/{branch}"
    return await client.get(url, headers=headers)


async def fetch_repo_zipball(
    owner: str, repo: str, branch: str = "main"
) -> tuple[dict[str, str], str]:
    """Download a GitHub repo via the /zipball endpoint and extract in-memory.

    Tries the given branch first, then falls back to common defaults
    (main → master) if the branch returns 404.

    Returns:
        (files, file_tree) where files is {path: content} and file_tree is
        a formatted string of the repo structure.

    Raises:
        HTTPException on GitHub API errors.
    """
    headers = {"Accept": "application/vnd.github+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"

    branches_to_try = [branch]
    if branch == "main":
        branches_to_try.append("master")
    elif branch == "master":
        branches_to_try.append("main")

    async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
        response = None
        for try_branch in branches_to_try:
            response = await _download_zipball(client, owner, repo, try_branch, headers)
            if response.status_code != 404:
                break

    if response.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail="Repository not found. Check if the URL is correct and the repo is public.",
        )

    if response.status_code == 403:
        raise HTTPException(
            status_code=429,
            detail="Rate limited by GitHub. Please wait 60 seconds or add a GitHub token.",
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"GitHub API error: {response.status_code} — {response.text[:200]}",
        )

    # Extract in-memory, then immediately discard zip bytes
    zip_bytes = response.content
    files = filter_code_files(zip_bytes)
    del zip_bytes

    file_tree = build_file_tree(files)

    return files, file_tree
