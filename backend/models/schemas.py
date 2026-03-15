from __future__ import annotations

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Dependency Graph
# ---------------------------------------------------------------------------

class GraphNode(BaseModel):
    id: str = Field(..., description="File path or module identifier")
    label: str = Field(..., description="Display name (typically the filename)")
    type: str = Field("file", description="file | module | package")
    description: str = Field("", description="Purpose of this node")


class GraphEdge(BaseModel):
    source: str = Field(..., description="Source node id")
    target: str = Field(..., description="Target node id")
    type: str = Field("import", description="import | call | inherit")


class DependencyGraph(BaseModel):
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Architectural Decision Records
# ---------------------------------------------------------------------------

class ADR(BaseModel):
    title: str = Field(..., description="Short title of the decision")
    context: str = Field("", description="Why this decision was needed")
    decision: str = Field(..., description="What was decided")
    consequences: str = Field("", description="Impact and trade-offs")
    status: str = Field("accepted", description="accepted | deprecated | superseded")


# ---------------------------------------------------------------------------
# Tech Debt
# ---------------------------------------------------------------------------

class TechDebtItem(BaseModel):
    file: str = Field(..., description="File or module affected")
    type: str = Field(..., description="complexity | duplication | outdated | missing_tests | tight_coupling")
    severity: str = Field(..., description="critical | high | medium | low")
    description: str = Field(..., description="What the debt is")
    suggested_fix: str = Field("", description="How to address it")


# ---------------------------------------------------------------------------
# Refactoring
# ---------------------------------------------------------------------------

class RefactorScenario(BaseModel):
    title: str = Field(..., description="Short name for the refactoring")
    description: str = Field("", description="Detailed explanation")
    target_files: list[str] = Field(default_factory=list, description="Files affected")
    impact: str = Field("", description="Expected impact of applying this refactoring")


# ---------------------------------------------------------------------------
# Full Analysis Result
# ---------------------------------------------------------------------------

class AnalysisResult(BaseModel):
    architecture: str = Field("", description="High-level architecture description")
    modules: str = Field("", description="Module-by-module breakdown")
    dependency_graph: DependencyGraph = Field(default_factory=DependencyGraph)
    adrs: list[ADR] = Field(default_factory=list)
    tech_debt: list[TechDebtItem] = Field(default_factory=list)
    refactor_scenarios: list[RefactorScenario] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list, description="Any warnings from the analysis pipeline")


# ---------------------------------------------------------------------------
# Request / Response models for API endpoints
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    repo_url: str


class RefactorRequest(BaseModel):
    repo_url: str
    scenario: str
    target_files: list[str] = Field(default_factory=list)
