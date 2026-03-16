import { useCallback, useMemo } from 'react'
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useAnalysisContext } from '../context/AnalysisContext'
import { useGraphLayout } from '../hooks/useGraphLayout'
import {
  transformToReactFlow,
  applyTechDebtColors,
  getLanguageColor,
} from '../utils/graphHelpers'

// ---------------------------------------------------------------------------
// Custom node: FileNode
// ---------------------------------------------------------------------------

function FileNode({ data, selected }) {
  const ext = data.filePath?.split('.').pop()?.toUpperCase() || ''

  return (
    <div
      className={`fossil-file-node ${selected ? 'ring-2 ring-accent' : ''} ${data.highlighted ? 'fossil-node-pulse' : ''}`}
      style={{ borderColor: data.highlighted ? '#8b5cf6' : data.borderColor }}
    >
      <Handle type="target" position={Position.Top} className="fossil-handle" />

      <div className="flex items-center gap-2 min-w-0">
        {/* Language dot */}
        <span
          className="flex-shrink-0 w-3 h-3 rounded-full"
          style={{ backgroundColor: data.languageColor }}
          title={ext}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate text-fossil-800 dark:text-fossil-100">
            {data.label}
          </p>
          {data.description && (
            <p className="text-[10px] truncate text-fossil-500 dark:text-fossil-400">
              {data.description}
            </p>
          )}
        </div>
        {/* Severity badge */}
        {data.severity && (
          <span
            className="flex-shrink-0 w-2 h-2 rounded-full"
            style={{ backgroundColor: data.borderColor }}
            title={`Tech debt: ${data.severity}`}
          />
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="fossil-handle" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Custom node: ModuleNode
// ---------------------------------------------------------------------------

function ModuleNode({ data, selected }) {
  return (
    <div
      className={`fossil-module-node ${selected ? 'ring-2 ring-accent' : ''} ${data.highlighted ? 'fossil-node-pulse' : ''}`}
      style={{ borderColor: data.highlighted ? '#8b5cf6' : data.borderColor }}
    >
      <Handle type="target" position={Position.Top} className="fossil-handle" />

      <div className="flex items-center gap-2 min-w-0">
        {/* Folder icon */}
        <svg
          className="flex-shrink-0 w-4 h-4 text-accent"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold truncate text-fossil-800 dark:text-fossil-100">
            {data.label}
          </p>
          {data.description && (
            <p className="text-[10px] truncate text-fossil-500 dark:text-fossil-400">
              {data.description}
            </p>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="fossil-handle" />
    </div>
  )
}

// Register custom node types (must be stable reference — defined outside component)
const nodeTypes = {
  fileNode: FileNode,
  moduleNode: ModuleNode,
}

// ---------------------------------------------------------------------------
// MiniMap node color callback
// ---------------------------------------------------------------------------

function miniMapNodeColor(node) {
  if (node.data?.severity) return node.data.borderColor
  if (node.type === 'moduleNode') return '#8b5cf6'
  return node.data?.languageColor || '#6b6b85'
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function GraphLegend() {
  return (
    <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-2 bg-white/90 dark:bg-fossil-800/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-fossil-200 dark:border-fossil-700 text-[10px]">
      {/* Edge types */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className="w-5 border-t-2 border-accent" />
          <span className="text-fossil-600 dark:text-fossil-300">import</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-5 border-t-2 border-dashed border-accent-light" />
          <span className="text-fossil-600 dark:text-fossil-300">call</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-5 border-t-2 border-dotted" style={{ borderColor: '#c084fc' }} />
          <span className="text-fossil-600 dark:text-fossil-300">inherit</span>
        </span>
      </div>
      {/* Severity colors */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-severity-low" />
          <span className="text-fossil-600 dark:text-fossil-300">low</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-severity-medium" />
          <span className="text-fossil-600 dark:text-fossil-300">med</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-severity-high" />
          <span className="text-fossil-600 dark:text-fossil-300">high</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-severity-critical" />
          <span className="text-fossil-600 dark:text-fossil-300">crit</span>
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyGraph() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-center space-y-2">
        <svg
          className="w-12 h-12 mx-auto text-fossil-400 dark:text-fossil-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
        <p className="text-sm text-fossil-400 dark:text-fossil-500">
          No dependency data available
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main DependencyGraph component
// ---------------------------------------------------------------------------

export default function DependencyGraph() {
  const { state, dispatch } = useAnalysisContext()
  const { dependency_graph, tech_debt } = state.analysisResult || {}
  const { highlightedNodes } = state

  // 1. Transform backend data → React Flow format
  const { nodes: rawNodes, edges: rawEdges } = useMemo(
    () => transformToReactFlow(dependency_graph),
    [dependency_graph],
  )

  // 2. Apply tech debt severity coloring
  const coloredNodes = useMemo(
    () => applyTechDebtColors([...rawNodes.map((n) => ({ ...n, data: { ...n.data } }))], tech_debt),
    [rawNodes, tech_debt],
  )

  // 2b. Apply refactor highlight (pulse) to affected nodes
  const highlightedColoredNodes = useMemo(() => {
    if (!highlightedNodes || highlightedNodes.length === 0) return coloredNodes

    const highlightSet = new Set(highlightedNodes)
    return coloredNodes.map((node) => {
      // Match by exact id, or if any highlighted file ends with or contains the node id
      const isHighlighted =
        highlightSet.has(node.id) ||
        highlightedNodes.some(
          (hf) => node.id.endsWith(hf) || hf.endsWith(node.id) || node.id.includes(hf) || hf.includes(node.id)
        )

      if (isHighlighted) {
        return { ...node, data: { ...node.data, highlighted: true } }
      }
      return node
    })
  }, [coloredNodes, highlightedNodes])

  // 3. Apply dagre layout
  const { nodes: layoutedNodes, edges: layoutedEdges } = useGraphLayout(
    highlightedColoredNodes,
    rawEdges,
  )

  // 4. React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges)

  // 5. Handle node click → dispatch to context for NodeDetail panel
  const onNodeClick = useCallback(
    (_event, node) => {
      dispatch({ type: 'SELECT_NODE', payload: node })
    },
    [dispatch],
  )

  // Deselect on pane click
  const onPaneClick = useCallback(() => {
    dispatch({ type: 'SELECT_NODE', payload: null })
  }, [dispatch])

  if (!dependency_graph || rawNodes.length === 0) {
    return <EmptyGraph />
  }

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.5 }}
        minZoom={0.1}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
        className="fossil-graph"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          className="!bg-fossil-100 dark:!bg-fossil-900"
          color="#9a9ab0"
        />
        <Controls
          showInteractive={false}
          className="fossil-controls"
        />
        <MiniMap
          nodeColor={miniMapNodeColor}
          maskColor="rgba(0, 0, 0, 0.15)"
          className="!bg-fossil-100 dark:!bg-fossil-800 !border-fossil-200 dark:!border-fossil-700"
          pannable
          zoomable
        />
      </ReactFlow>
      <GraphLegend />
    </div>
  )
}
