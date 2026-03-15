GEMINI_ANALYSIS_PROMPT = """\
You are a senior software architect performing a comprehensive code review.
Analyze this codebase and respond with clearly labeled sections using the exact headers below.
Think step by step about each section. Be specific. Reference actual file names and line patterns.

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
Here is a pre-extracted import map:
<import_map>
{import_map}
</import_map>
Enrich this with call relationships, inheritance, and any dependencies the regex missed.
List all dependency relationships between files/modules.

[REFACTORING]
Suggest 3-5 concrete refactoring opportunities with expected impact.

<file_tree>
{file_tree}
</file_tree>

<file_contents>
{file_contents}
</file_contents>
"""

# ---------------------------------------------------------------------------
# Groq extraction prompts — each receives ONLY one sliced section
# ---------------------------------------------------------------------------

GROQ_DEPENDENCY_PROMPT = """\
Extract the dependency graph from this analysis as a JSON object.
Return ONLY valid JSON. No markdown fences. No explanation.

Expected shape:
{{"nodes": [{{"id": "filepath", "label": "filename", "type": "file", "description": "purpose"}}], "edges": [{{"source": "filepath", "target": "filepath", "type": "import"}}]}}

Rules:
- "type" for nodes must be one of: "file", "module", "package"
- "type" for edges must be one of: "import", "call", "inherit"
- Use the actual file paths from the analysis

Analysis (dependencies section only):
{section}
"""

GROQ_ADR_PROMPT = """\
Extract architectural decisions from this analysis as a JSON array.
Return ONLY valid JSON. No markdown fences. No explanation.

Expected shape:
[{{"title": "short title", "context": "why needed", "decision": "what was decided", "consequences": "impact", "status": "accepted"}}]

Rules:
- "status" must be one of: "accepted", "deprecated", "superseded"
- Extract 5-10 decisions if available

Analysis (decisions section only):
{section}
"""

GROQ_TECH_DEBT_PROMPT = """\
Extract tech debt items from this analysis as a JSON array.
Return ONLY valid JSON. No markdown fences. No explanation.

Expected shape:
[{{"file": "filepath", "type": "complexity", "severity": "high", "description": "what the debt is", "suggested_fix": "how to fix"}}]

Rules:
- "type" must be one of: "complexity", "duplication", "outdated", "missing_tests", "tight_coupling"
- "severity" must be one of: "critical", "high", "medium", "low"

Analysis (tech debt section only):
{section}
"""

GROQ_REFACTOR_PROMPT = """\
Extract refactoring opportunities from this analysis as a JSON array.
Return ONLY valid JSON. No markdown fences. No explanation.

Expected shape:
[{{"title": "short name", "description": "detailed explanation", "target_files": ["file1", "file2"], "impact": "expected impact"}}]

Analysis (refactoring section only):
{section}
"""

GROQ_FIX_JSON_PROMPT = """\
The following JSON is malformed. Fix it and return ONLY valid JSON. No markdown fences. No explanation.

Broken JSON:
{broken_json}
"""

GEMINI_REFACTOR_PROMPT = """\
You are a senior software architect. Given this codebase analysis, simulate what would happen \
if the following refactoring scenario were applied.

Scenario: {scenario}
Target files: {target_files}

For the simulation, provide:
1. **Impact Assessment** — Which files and modules would be affected?
2. **Risk Level** — Low / Medium / High / Critical
3. **Steps Required** — Concrete steps to implement this refactoring
4. **New Dependencies** — Any new dependency relationships created
5. **Removed Dependencies** — Any dependency relationships removed
6. **Potential Issues** — What could go wrong?

<analysis>
{analysis}
</analysis>
"""
