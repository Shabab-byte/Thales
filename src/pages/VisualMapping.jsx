// { useLocalStorage }
// timeline is trash, it should be horizontal
// mind map is ok but needs better layout and dynamic zooming and collapse-all and expand-all buttons, horizontal view
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactFlow, { Panel, useReactFlow, ReactFlowProvider, Background, Controls, Handle, Position, useNodesState, useEdgesState } from 'reactflow'
import 'reactflow/dist/style.css'
import { AlertTriangle, Loader2, RefreshCw, Clock, Network, Info, Split, ChevronsUpDown, ChevronsDownUp } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { callGemini } from '../lib/gemini'
import { MarkerType } from '@xyflow/react'

function buildVisualsPrompt(notes) {
  return `You are an expert study assistant that generates structured visual learning data. Analyse the following study notes and return ONLY a valid JSON object — no markdown fences, no backticks, no preamble, no explanation.

Use this exact structure:
{
  "timeline": [
    {
      "date": "string — a specific year, period, or date label",
      "label": "string — short event name, max 6 words",
      "description": "string — 1–2 sentences grounded in the notes",
      "significance": "major",
      "conceptId": "string — short kebab-case identifier e.g. french-revolution"
    }
  ],
  "mindmap": {
    "id": "root",
    "label": "string — the central topic, max 5 words",
    "description": "string — 1–2 sentences describing the central topic",
    "conceptId": "string",
    "children": [
      {
        "id": "node-1",
        "label": "string — subtopic name",
        "description": "string — 1–2 sentences specific to this subtopic",
        "conceptId": "string",
        "children": [
          {
            "id": "node-1-1",
            "label": "string",
            "description": "string — 1–2 sentences",
            "conceptId": "string",
            "children": []
          }
        ]
      }
    ]
  }
}

Strict rules:
1. timeline — Extract 4–10 chronological events, dates, or milestones directly from the notes. Order them chronologically (oldest first). Set significance to "major" for pivotal events, "minor" for supporting details. If the notes have no temporal or historical content, return an empty array [].
2. mindmap — The root node is the primary subject of the notes. First-level children are the main themes or categories. Second-level children are specific concepts under each theme. Maximum depth is 2 levels of children.
3. mindmap nodes — Aim for 3–6 first-level children, each with 2–4 second-level children. Every node must have a unique "id" string and a unique "conceptId" in short kebab-case.
4. All descriptions must be grounded in actual note content. No generic filler.

Study notes:
${notes}`
}

// ─── Mind Map layout helpers ──────────────────────────────────────

function countLeaves(node) {
  if (!node.children || node.children.length === 0) return 1
  return node.children.reduce((sum, c) => sum + countLeaves(c), 0)
}

function layoutTree(node, x = 0, startY = 0, allNodes = [], allEdges = []) {
  const HGAP = 260
  const VGAP = 88
  const leaves = countLeaves(node)
  const nodeY = startY + (leaves-1) * VGAP / 2

  allNodes.push({
    id: node.id,
    type: 'mindMapNode',
    position: { x, y: nodeY },
    data: {
      label: node.label,
      description: node.description,
      conceptId: node.conceptId,
      isRoot: node.id === 'root',
      hasChildren: (node.children?.length ?? 0) > 0,
    },
  })

  let currentY = startY
  for (const child of (node.children ?? [])) {
    allEdges.push({ // label?
      id: `e-${node.id}-${child.id}`,
      source: node.id,
      target: child.id,
      type: 'default',
      style: { stroke: '#cbd5e1', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.Arrow },  
    })
    layoutTree(child, x + HGAP, currentY, allNodes, allEdges)
    const childLeaves = countLeaves(child)
    currentY += childLeaves * VGAP
  }

  return { nodes: allNodes, edges: allEdges }
}
/*
function getDescendantIds(nodeId, tree) {
  const result = new Set()

  function findAndCollect(node) {
    if (node.id === nodeId) { collectChildren(node); return }
    for (const child of (node.children ?? [])) findAndCollect(child)
  }

  function collectChildren(node) {
    for (const child of (node.children ?? [])) {
      result.add(child.id)
      collectChildren(child)
    }
  }

  findAndCollect(tree)
  return result
}
*/

// ─── Custom Mind Map Node (must be defined outside parent component) ──

function MindMapNode({ data }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className={`relative rounded-xl border shadow-sm select-none min-w-[130px] max-w-[170px] px-3.5 py-2.5 cursor-pointer ${hovered?'z-40':'z-0'} ${
        data.isRoot
          ? 'bg-indigo-600 border-indigo-700'
          : 'bg-white border-slate-200 hover:border-indigo-300 transition-colors'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!data.isRoot && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: '#94a3b8', width: 6, height: 6, border: 'none', opacity: 0 }}
        />
      )}

      <div className="flex items-start justify-between gap-1.5">
        <p className={`text-xs font-semibold leading-snug ${data.isRoot ? 'text-white' : 'text-slate-800'}`}>
          {data.label}
        </p>
        {data.hasChildren && (
          <span className={`text-[10px] w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 font-bold ${
            data.isRoot ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
          }`}>
            {data.isCollapsed ? '+' : '−'}
          </span>
        )}
      </div>

      {/* Hover tooltip */}
      {hovered && data.description && (
        <div className="absolute mr-3 right-full ml-3 top-0 z-50 w-56 bg-slate-800 opacity-90 text-white text-xs rounded-xl p-3 shadow-xl leading-relaxed pointer-events-none z-50">
          <div className="absolute -right-0.5 top-3 w-3 h-3 bg-slate-800 rotate-45" />
          {data.description}
        </div>
      )}

      {data.hasChildren && (
        <Handle
          type="source"
          position={Position.Right}
          style={{ background: '#94a3b8', width: 6, height: 6, border: 'none', opacity: 0 }}
        />
      )}
    </div>
  )
}

const nodeTypes = { mindMapNode: MindMapNode }

function pruneTree(node, collapsed) {
  if (collapsed.has(node.id)) {
    return { ...node, children: [] }  // collapsed — act as if no children
  }
  return {
    ...node,
    children: (node.children ?? []).map(child => pruneTree(child, collapsed))
  }
}

// ─── Timeline View ────────────────────────────────────────────────

function TimelineView({ data }) {
  if (!data?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
          <Clock size={22} className="text-slate-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-600">No timeline events found</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            Your notes don't appear to contain chronological or historical content.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative pl-8 max-w-2xl">
      {/* Vertical connector line */}
      <div className="absolute left-3 top-2 bottom-2 w-px bg-slate-200" />

      <div className="flex flex-col">
        {data.map((event, i) => (
          <div key={i} className="relative flex gap-5 pb-7 last:pb-0">
            {/* Dot marker */}
            <div className={`absolute rounded-full border-2 border-white shrink-0 ${
              event.significance === 'major'
                ? 'w-4 h-4 bg-indigo-500 -left-5 mt-1'
                : 'w-3 h-3 bg-slate-400 -left-[18px] mt-1.5'
            }`} />

            {/* Content */}
            <div className="flex-1 pl-2">
              <div className="flex items-baseline gap-2.5 mb-1">
                <span className="text-xs font-bold text-indigo-500 shrink-0">{event.date}</span>
                <h3 className={`font-semibold text-sm ${
                  event.significance === 'major' ? 'text-slate-800' : 'text-slate-600'
                }`}>
                  {event.label}
                </h3>
              </div>
              <p className="text-slate-500 text-xs leading-relaxed">{event.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Mind Map View ────────────────────────────────────────────────

function MindMapView({ data }) {
  const [collapsed, setCollapsed] = useState(new Set())
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const { fitView } = useReactFlow()

  /* 
    useEffect(() => {
    if (!data) return

    const prunedTree = pruneTree(data, collapsed)
    const { nodes: allNodes, edges: allEdges } = layoutTree(prunedTree) 
    
    const hiddenIds = new Set()
    collapsed.forEach(id => {
      getDescendantIds(id, data).forEach(descId => hiddenIds.add(descId))
    })

    const visibleNodes = allNodes
      .filter(n => !hiddenIds.has(n.id))
      .map(n => ({ ...n, data: { ...n.data, isCollapsed: collapsed.has(n.id) } }))

    const visibleEdges = allEdges.filter(e => !hiddenIds.has(e.target))

    setNodes(visibleNodes)
    setEdges(visibleEdges)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, collapsed])
  */
  useEffect(() => {
    if (!data) return

    const prunedTree = pruneTree(data, collapsed)
    const { nodes: allNodes, edges: allEdges } = layoutTree(prunedTree)

    setNodes(allNodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        isCollapsed: collapsed.has(n.id),
        hasChildren: n.data.hasChildren || collapsed.has(n.id),
      }
    })))
    setEdges(allEdges)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, collapsed])

  const handleNodeClick = useCallback((_, node) => {
    if (!node.data.hasChildren) return
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(node.id)) next.delete(node.id)
      else next.add(node.id)
      return next
    })

    setTimeout(() => {
      fitView({ duration: 600, padding: 0.25 })
    }, 50)
  }, [fitView])

  const collapseAll = useCallback(() => {
    const parentIds = new Set(
      nodes
        .filter(n => n.data.hasChildren && n.id!=='root')
        .map(n => n.id)
    )
    setCollapsed(parentIds)

      setTimeout(() => {
      fitView({ duration: 600, padding: 0.25 })
    }, 50)
  }, [nodes, fitView])

  const expandAll = useCallback(() => {
    setCollapsed(new Set())

      setTimeout(() => {
      fitView({ duration: 600, padding: 0.25 })
    }, 50)
  }, [fitView])
  
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
          <Network size={22} className="text-slate-400 rotate-270" />
        </div>
        <p className="text-sm font-medium text-slate-600">No mind map data found.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 overflow-y" style={{ height: 520 }}>
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center gap-1">
        <Info size={12} className="text-slate-400 shrink-0" />
        <p className="text-xs text-slate-400">Click a node to expand or collapse its children. Hover to read descriptions. Tip: If it gets too cluttered, use the 'Collapse All' button on the top-right corner.</p>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.3}
        maxZoom={1.2}
        preventScrolling={false}
      >
        <Background color="#e2e8f0" gap={20} size={1} />
        <Controls showInteractive={true} style={{ bottom: '26px' }}/>
        <Panel 
          position="top-right" 
          style={{ top: '-12px', right: '12px',}}
          className="flex gap-3"
        >
          {/* Expand All Button */}
          <div className="relative group flex items-center justify-center">
            <button
              onClick={expandAll}
              aria-label="Expand All"
              className="flex items-center justify-center w-10 h-10 bg-white text-indigo-500 rounded-lg shadow-md border border-indigo-100 transition-all duration-200 hover:bg-indigo-600 hover:text-white hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1"
            >
              <ChevronsUpDown size={22} strokeWidth={1.5} />
            </button>
            
            {/* Custom Tooltip */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max px-2.5 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-md shadow-sm opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-events-none z-50">
              Expand All
              {/* Tooltip Arrow */}
            </div>
          </div>

          {/* Collapse All Button */}
          <div className="relative group flex items-center justify-center">
            <button
              onClick={collapseAll}
              aria-label="Collapse All"
              className="flex items-center justify-center w-10 h-10 bg-white text-indigo-500 rounded-lg shadow-md border border-indigo-100 transition-all duration-200 hover:bg-indigo-600 hover:text-white hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1"
            >
              <ChevronsDownUp size={22} strokeWidth={1.5} />
            </button>
            
            {/* Custom Tooltip */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max px-2.5 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-md shadow-sm opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-events-none z-50">
              Collapse All
              {/* Tooltip Arrow */}            
            </div>
          </div>
        </Panel>
      </ReactFlow>      
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────

const TABS = [
  { id: 'mindmap',  label: 'Mind Map',  icon: Network },
  { id: 'timeline', label: 'Timeline', icon: Clock   },
]

export default function VisualMapping() {
  const [notes] = useLocalStorage('knowtico-notes', '')
  const [visuals, setVisuals] = useLocalStorage('knowtico-visuals', null)
  const [lastNotes, setLastNotes] = useLocalStorage('knowtico-last-notes-visuals', '')
  const [activeTab, setActiveTab] = useState('mindmap')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notesChanged, setNotesChanged] = useState(false)

  //const location = useLocation()
  const navigate = useNavigate()

  // Notes change detection
  useEffect(() => {
    if (!visuals || !notes.trim()) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (lastNotes !== notes) setNotesChanged(true)
    else setNotesChanged(false)
  }, [notes, visuals, lastNotes])
  /*
  // Auto-generate on navigation
  useEffect(() => {
    if (visuals && lastNotes === notes) return
    if (location.state?.autoGen) {
      navigate(location.pathname, { replace: true, state: { autoGen: false } })
      generate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  */
  async function generate() {
    if (!notes.trim()) {
      setError('No notes found. Add notes first.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const raw = await callGemini(buildVisualsPrompt(notes))
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      setVisuals(parsed)
      setLastNotes(notes)
    } catch (err) {
      setError('Failed to generate visuals. Check your API key or try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // ── Loading early return ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-indigo-400">
          <Loader2 size={32} className="animate-spin" />
          <p className="text-sm">Building your visual maps…</p>
          <p className="text-xs text-gray-400">Mapping your notes</p>
        </div>
      </div>
    )
  }

  // ── Main render ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* Notes changed banner */}
      <div className={`shrink-0 overflow-hidden transition-all duration-300 ${
        notesChanged ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'
      }`}>
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-500 shrink-0" />
            <p className="text-xs text-amber-800">Your notes have changed since this was generated.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setNotesChanged(false)}
              className="text-xs text-amber-600 hover:text-amber-800 px-2 py-1 transition-colors cursor-pointer"
            >
              Dismiss
            </button>
            <button
              onClick={generate}
              className="text-xs font-medium bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors cursor-pointer"
            >
              Regenerate
            </button>
          </div>
        </div>
      </div>

      {/* Page header */}
      <div className="shrink-0 px-6 pt-6 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Split size={24} className="text-indigo-500 rotate-90 mt-1" />
              <h2 className="text-xl font-bold text-gray-800">Visual Mapping</h2>
            </div>
            <p className="ml-8 text-sm text-gray-400 mb-2">
               Spatial and structural views — timelines and mind maps of your notes
            </p>
          </div>
          {visuals ?
            <button
              onClick={generate}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg hover:border-gray-500 transition-colors shrink-0 cursor-pointer"
            >
              <RefreshCw size={15} /> Regenerate
            </button>
            : null
            }
        </div>
      </div>

      {/* Tab bar — only shown once content exists */}
      {visuals && (
        <div className="shrink-0 px-6 pb-4">
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
            {/* eslint-disable-next-line no-unused-vars */}
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === id
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon size={14} className={`${id === 'mindmap' ? 'rotate-270' : ''}`} />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {!visuals ? (
          !notes.trim() ? (
            <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl bg-white">
              <Split size={32} className="text-indigo-200 mx-auto mb-3 rotate-90" />
              <p className="text-gray-500 text-sm font-medium">No notes found</p>
              <p className="text-gray-400 text-xs mt-1">Go to Notes and add your study material first</p>
              <button
                onClick={() => navigate('/notes')}
                className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                Add Notes
              </button>
            </div>
          ) : (
            <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl bg-white">
              <Split size={32} className="text-indigo-200 mx-auto mb-3 rotate-90" />
              <p className="text-gray-500 text-sm font-medium mb-1">No visual maps yet</p>
              <p className="text-gray-400 text-xs mb-5 max-w-xs mx-auto">
                Generate a timeline and a mind map from your notes to see how everything connects spatially.
              </p>
              <button
                onClick={generate}
                className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                Generate Visual Maps
              </button>
            </div>
          )
        ) : (
          <>
            {/* CSS show/hide keeps mind map pan+zoom state when switching tabs */}
            <div className={activeTab === 'timeline' ? 'block' : 'hidden'}>
              <TimelineView data={visuals.timeline} />
            </div>
            <div className={activeTab === 'mindmap' ? 'block' : 'hidden'}>
              <ReactFlowProvider> <MindMapView data={visuals.mindmap} /> </ReactFlowProvider>
            </div>
          </>
        )}
      </div>

      {/* Error toast */}
      {error && (
        <p className="text-sm text-red-500 bg-red-50 border border-red-100 px-3 py-2 rounded-lg fixed bottom-4 right-4 z-50">
          {error}
        </p>
      )}
    </div>
  )
}