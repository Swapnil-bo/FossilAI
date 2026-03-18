/**
 * graphHelpers.js
 * Transform backend DependencyGraph JSON → React Flow nodes/edges,
 * apply tech-debt severity colors, and resolve language colors.
 */

// ---------------------------------------------------------------------------
// Language → color mapping (GitHub-style)
// ---------------------------------------------------------------------------

const LANGUAGE_COLORS = {
  py: '#3572A5',     // Python — blue
  js: '#f1e05a',     // JavaScript — yellow
  jsx: '#f1e05a',
  ts: '#3178c6',     // TypeScript — blue
  tsx: '#3178c6',
  java: '#b07219',   // Java — brown/red
  go: '#00ADD8',     // Go — cyan
  rs: '#dea584',     // Rust — peach
  rb: '#701516',     // Ruby — dark red
  php: '#4F5D95',    // PHP — indigo
  css: '#563d7c',    // CSS — purple
  html: '#e34c26',   // HTML — orange
  json: '#292929',   // JSON — dark
  yaml: '#cb171e',   // YAML — red
  yml: '#cb171e',
  toml: '#9c4221',   // TOML — brown
  md: '#083fa1',     // Markdown — navy
  default: '#8b5cf6', // Accent purple fallback
}

/**
 * Get a hex color for a filename based on its extension.
 */
export function getLanguageColor(filename) {
  if (!filename) return LANGUAGE_COLORS.default
  const ext = filename.split('.').pop()?.toLowerCase()
  return LANGUAGE_COLORS[ext] || LANGUAGE_COLORS.default
}

// ---------------------------------------------------------------------------
// Severity → border color
// ---------------------------------------------------------------------------

const SEVERITY_BORDER_COLORS = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
}

const DEFAULT_BORDER_COLOR = '#3a3a4f' // fossil-600

// ---------------------------------------------------------------------------
// Node dimensions (used by dagre layout)
// ---------------------------------------------------------------------------

export const FILE_NODE_WIDTH = 200
export const FILE_NODE_HEIGHT = 56
export const MODULE_NODE_WIDTH = 240
export const MODULE_NODE_HEIGHT = 64

// ---------------------------------------------------------------------------
// Edge style presets
// ---------------------------------------------------------------------------

const EDGE_STYLES = {
  import: {
    stroke: '#8b5cf6',
    strokeWidth: 1.5,
  },
  call: {
    stroke: '#a78bfa',
    strokeWidth: 1.5,
    strokeDasharray: '6 3',
  },
  inherit: {
    stroke: '#c084fc',
    strokeWidth: 2,
    strokeDasharray: '2 4',
  },
}

// ---------------------------------------------------------------------------
// transformToReactFlow
// ---------------------------------------------------------------------------

/**
 * Convert a backend DependencyGraph (nodes + edges) into React Flow format.
 *
 * @param {object} dependencyGraph  - { nodes: GraphNode[], edges: GraphEdge[] }
 * @returns {{ nodes: RFNode[], edges: RFEdge[] }}
 */
export function transformToReactFlow(dependencyGraph) {
  if (!dependencyGraph) return { nodes: [], edges: [] }

  const { nodes: rawNodes = [], edges: rawEdges = [] } = dependencyGraph

  // Dedupe nodes by id
  const seenIds = new Set()
  const rfNodes = []

  for (const node of rawNodes) {
    if (!node.id || seenIds.has(node.id)) continue
    seenIds.add(node.id)

    const isModule = node.type === 'module' || node.type === 'package'
    const label = node.label || node.id.split('/').pop()

    rfNodes.push({
      id: node.id,
      type: isModule ? 'moduleNode' : 'fileNode',
      position: { x: 0, y: 0 }, // dagre will overwrite
      data: {
        label,
        filePath: node.id,
        nodeType: node.type || 'file',
        description: node.description || '',
        languageColor: getLanguageColor(node.id),
        borderColor: DEFAULT_BORDER_COLOR,
        severity: null,
      },
      width: isModule ? MODULE_NODE_WIDTH : FILE_NODE_WIDTH,
      height: isModule ? MODULE_NODE_HEIGHT : FILE_NODE_HEIGHT,
    })
  }

  // Only create edges whose source and target exist
  const nodeIdSet = new Set(rfNodes.map((n) => n.id))

  const rfEdges = rawEdges
    .filter((e) => e.source && e.target && nodeIdSet.has(e.source) && nodeIdSet.has(e.target) && e.source !== e.target)
    .map((edge, i) => {
      const edgeType = edge.type || 'import'
      const style = EDGE_STYLES[edgeType] || EDGE_STYLES.import

      return {
        id: `e-${edge.source}-${edge.target}-${i}`,
        source: edge.source,
        target: edge.target,
        type: 'default',
        style,
        animated: edgeType === 'call',
        markerEnd: edgeType === 'inherit'
          ? { type: 'arrowclosed', color: style.stroke, width: 16, height: 16 }
          : { type: 'arrow', color: style.stroke, width: 12, height: 12 },
        data: { edgeType },
      }
    })

  return { nodes: rfNodes, edges: rfEdges }
}

// ---------------------------------------------------------------------------
// applyTechDebtColors
// ---------------------------------------------------------------------------

/**
 * Annotate React Flow nodes with tech-debt severity border colors.
 * Mutates node.data.borderColor and node.data.severity.
 *
 * @param {RFNode[]} nodes
 * @param {TechDebtItem[]} techDebt  - array of { file, severity, ... }
 * @returns {RFNode[]} same array, mutated for convenience
 */
export function applyTechDebtColors(nodes, techDebt) {
  if (!techDebt || techDebt.length === 0) return nodes

  // Build a lookup: filePath → highest severity
  const severityRank = { critical: 4, high: 3, medium: 2, low: 1 }
  const fileDebt = {}

  for (const item of techDebt) {
    if (!item.file) continue
    const current = fileDebt[item.file]
    const incoming = severityRank[item.severity] || 0
    if (!current || incoming > (severityRank[current] || 0)) {
      fileDebt[item.file] = item.severity
    }
  }

  for (const node of nodes) {
    // Try exact match first, then check if any debt file is a substring or vice versa
    let severity = fileDebt[node.id]

    if (!severity) {
      // Fuzzy match: debt file might be a partial path
      for (const [debtFile, sev] of Object.entries(fileDebt)) {
        if (node.id.endsWith(debtFile) || debtFile.endsWith(node.id) ||
            node.id.includes(debtFile) || debtFile.includes(node.id)) {
          const current = severityRank[severity] || 0
          if ((severityRank[sev] || 0) > current) severity = sev
        }
      }
    }

    if (severity) {
      node.data = {
        ...node.data,
        borderColor: SEVERITY_BORDER_COLORS[severity] || DEFAULT_BORDER_COLOR,
        severity,
      }
    }
  }

  return nodes
}
