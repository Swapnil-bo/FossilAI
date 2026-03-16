#!/usr/bin/env python3
"""
Generate demo data for FossilAI.

Usage:
    python -m scripts.generate_demo https://github.com/expressjs/express

This runs the full analysis pipeline (fetch -> parse -> Gemini -> Groq)
and saves the result as a JSON file in backend/demo_data/{repo_name}.json.

Run from the backend/ directory:
    cd backend
    python -m scripts.generate_demo https://github.com/owner/repo
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys

# Ensure the backend directory is on the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()


_GITHUB_URL_RE = re.compile(
    r"(?:https?://)?(?:www\.)?github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)"
)

DEMO_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "demo_data")


async def generate(repo_url: str) -> None:
    # Import services after path setup
    from models.schemas import AnalysisResult, DependencyGraph
    from services.cache import init_db
    from services.gemini_analyzer import analyze_repo as gemini_analyze
    from services.github_fetcher import fetch_repo_zipball
    from services.groq_extractor import (
        extract_adrs,
        extract_dependency_graph,
        extract_refactor_seeds,
        extract_tech_debt,
    )
    from services.import_extractor import build_import_map
    from services.section_slicer import slice_gemini_output
    from utils.token_counter import estimate_tokens_for_files

    match = _GITHUB_URL_RE.search(repo_url.strip())
    if not match:
        print(f"ERROR: Invalid GitHub URL: {repo_url}")
        sys.exit(1)

    owner = match.group(1)
    repo = match.group(2)
    if repo.endswith(".git"):
        repo = repo[:-4]

    print(f"\n{'='*60}")
    print(f"  FossilAI Demo Generator")
    print(f"  Repo: {owner}/{repo}")
    print(f"{'='*60}\n")

    # Initialize DB (needed for cache module)
    await init_db()

    # 1. Fetch
    print("[1/6] Fetching repository via zipball...")
    files, file_tree = await fetch_repo_zipball(owner, repo)
    total_tokens = estimate_tokens_for_files(files)
    print(f"       {len(files)} files, ~{total_tokens:,} tokens")

    # 2. Parse imports
    print("[2/6] Extracting import map...")
    import_map = build_import_map(files)
    print(f"       {sum(len(v) for v in import_map.values())} import relationships found")

    # 3. Analyze with Gemini
    print("[3/6] Running Gemini deep analysis (this may take a while)...")
    raw_analysis, warnings = await gemini_analyze(files, file_tree, import_map)
    print(f"       Analysis complete ({len(raw_analysis):,} chars)")
    if warnings:
        for w in warnings:
            print(f"       WARNING: {w}")

    # 4. Slice output
    print("[4/6] Slicing Gemini output into sections...")
    sections = slice_gemini_output(raw_analysis)
    print(f"       Sections: {list(sections.keys())}")

    # 5. Extract structured data via Groq
    print("[5/6] Extracting structured data via Groq...")

    dependency_graph = await extract_dependency_graph(
        sections.get("DEPENDENCIES", "")
    ) if "DEPENDENCIES" in sections else None

    adrs = await extract_adrs(
        sections.get("DECISIONS", "")
    ) if "DECISIONS" in sections else []

    tech_debt = await extract_tech_debt(
        sections.get("TECH_DEBT", "")
    ) if "TECH_DEBT" in sections else []

    refactor_scenarios = await extract_refactor_seeds(
        sections.get("REFACTORING", "")
    ) if "REFACTORING" in sections else []

    print(f"       Graph: {len((dependency_graph or DependencyGraph()).nodes)} nodes, "
          f"{len((dependency_graph or DependencyGraph()).edges)} edges")
    print(f"       ADRs: {len(adrs)}")
    print(f"       Tech debt items: {len(tech_debt)}")
    print(f"       Refactor scenarios: {len(refactor_scenarios)}")

    # 6. Assemble and save
    print("[6/6] Saving demo data...")

    result = AnalysisResult(
        architecture=sections.get("ARCHITECTURE", ""),
        modules=sections.get("MODULES", ""),
        dependency_graph=dependency_graph or DependencyGraph(),
        adrs=adrs,
        tech_debt=tech_debt,
        refactor_scenarios=refactor_scenarios,
        warnings=warnings,
    )

    result_dict = result.model_dump()
    result_dict["owner"] = owner
    result_dict["repo"] = repo
    result_dict["file_count"] = len(files)
    result_dict["total_tokens_estimate"] = total_tokens
    result_dict["source"] = "demo"

    os.makedirs(DEMO_DATA_DIR, exist_ok=True)
    output_path = os.path.join(DEMO_DATA_DIR, f"{repo}.json")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result_dict, f, indent=2, ensure_ascii=False)

    size_kb = os.path.getsize(output_path) / 1024
    print(f"\n  Saved to: {output_path}")
    print(f"  Size: {size_kb:.1f} KB")
    print(f"\n{'='*60}")
    print(f"  Done! Restart the backend to load this demo.")
    print(f"{'='*60}\n")


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m scripts.generate_demo <github_url>")
        print("Example: python -m scripts.generate_demo https://github.com/expressjs/express")
        sys.exit(1)

    asyncio.run(generate(sys.argv[1]))


if __name__ == "__main__":
    main()
