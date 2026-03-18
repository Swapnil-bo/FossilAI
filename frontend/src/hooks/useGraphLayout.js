import { useMemo } from 'react'
import dagre from 'dagre'
import {
  FILE_NODE_WIDTH,
  FILE_NODE_HEIGHT,
  MODULE_NODE_WIDTH,
  MODULE_NODE_HEIGHT,
} from '../utils/graphHelpers'

/**
 * Apply a dagre hierarchical layout (top-to-bottom) to React Flow nodes + edges.
 * Returns new node/edge arrays with positions set — does not mutate inputs.
 *
 * @param {RFNode[]} nodes
 * @param {RFEdge[]} edges
 * @param {object} [options]
 * @param {'TB'|'LR'} [options.direction='TB']
 * @param {number} [options.nodesep=60]
 * @param {number} [options.ranksep=80]
 * @returns {{ nodes: RFNode[], edges: RFEdge[] }}
 */
export function useGraphLayout(nodes, edges, options = {}) {
  const { direction = 'TB', nodesep = 60, ranksep = 80 } = options

  return useMemo(() => {
    if (!nodes.length) return { nodes: [], edges }

    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({ rankdir: direction, nodesep, ranksep })

    // Register nodes with their dimensions
    for (const node of nodes) {
      const isModule = node.type === 'moduleNode'
      g.setNode(node.id, {
        width: node.width || (isModule ? MODULE_NODE_WIDTH : FILE_NODE_WIDTH),
        height: node.height || (isModule ? MODULE_NODE_HEIGHT : FILE_NODE_HEIGHT),
      })
    }

    // Register edges
    for (const edge of edges) {
      g.setEdge(edge.source, edge.target)
    }

    dagre.layout(g)

    // Apply computed positions (dagre gives center coords, React Flow uses top-left)
    const layoutedNodes = nodes.map((node) => {
      const dagreNode = g.node(node.id)
      if (!dagreNode) return node

      const isModule = node.type === 'moduleNode'
      const w = node.width || (isModule ? MODULE_NODE_WIDTH : FILE_NODE_WIDTH)
      const h = node.height || (isModule ? MODULE_NODE_HEIGHT : FILE_NODE_HEIGHT)

      return {
        ...node,
        position: {
          x: dagreNode.x - w / 2,
          y: dagreNode.y - h / 2,
        },
      }
    })

    return { nodes: layoutedNodes, edges }
  }, [nodes, edges, direction, nodesep, ranksep])
}
