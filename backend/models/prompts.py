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

For the simulation, respond with clearly labeled sections using the exact headers below.

[RISK_LEVEL]
State exactly one of: low, medium, high, critical

[IMPACT_SUMMARY]
A concise paragraph summarizing the overall impact of this refactoring.

[AFFECTED_FILES]
List every file that would need to change, one per line. Use the file paths from the analysis.

[STEPS]
Numbered list of concrete steps to implement this refactoring, in order.

[NEW_DEPENDENCIES]
List any new dependency relationships that would be created. Format each as:
source_file -> target_file (type: import|call|inherit)
If none, write "None".

[REMOVED_DEPENDENCIES]
List any dependency relationships that would be removed. Format each as:
source_file -> target_file (type: import|call|inherit)
If none, write "None".

[POTENTIAL_ISSUES]
List things that could go wrong, one per line.

<analysis>
{analysis}
</analysis>
"""

GROQ_REFACTOR_IMPACT_PROMPT = """\
Extract the refactoring simulation result from this analysis as a JSON object.
Return ONLY valid JSON. No markdown fences. No explanation.

Expected shape:
{{"risk_level": "medium", "summary": "impact summary text", "affected_files": ["file1.py", "file2.js"], "new_edges": [{{"source": "file1.py", "target": "file2.py", "type": "import"}}], "removed_edges": [{{"source": "file3.py", "target": "file4.py", "type": "call"}}], "steps": ["Step 1 description", "Step 2 description"], "potential_issues": ["Issue 1", "Issue 2"]}}

Rules:
- "risk_level" must be one of: "low", "medium", "high", "critical"
- "type" for edges must be one of: "import", "call", "inherit"
- Keep steps as concise action items
- Use actual file paths from the analysis

Refactoring simulation output:
{section}
"""
