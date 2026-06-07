import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { callGemini } from '../lib/gemini'
import {
  AlertTriangle, Loader2, RefreshCw, ArrowRight,
  Table2, Layers2, GitBranch, LayoutGrid, ChartNoAxesCombined, Link2, ChevronDown, ChevronRight
} from 'lucide-react'

const TABS = [
  { id: 'comparison', label: 'Comparison Table', icon: Table2 },
  { id: 'causeEffect',label: 'Cause & Effect',    icon: GitBranch },
  { id: 'concepts',   label: 'Concept Breakdown', icon: Layers2 },
]

function buildAnalysisPrompt(notes) {
  return `You are an expert analytical study assistant. Analyse the following study notes and return ONLY a valid JSON object — no markdown fences, no backticks, no preamble, no explanation.

Use this exact structure:
{
  "comparison": {
    "entities": ["EntityA", "EntityB"],
    "attributes": [
      { "attribute": "Attribute name", "values": ["Value for A", "Value for B"] }
    ]
  },
  "conceptTable": [
    {
      "concept": "Concept name",
      "mechanism": "How it works mechanistically in practice — not a dictionary definition",
      "practicalImplications": "Real-world applications and use cases specific to this subject",
      "tradeoffs": "Costs, limitations, downstream consequences, what is sacrificed",
      "strategicTakeaway": "The single sharpest insight for a student — the 'so what?' that changes how they think about it"
    }
  ],
  "causeEffect": [
    {
      "cause": "Specific trigger or condition from the notes",
      "effect": "Direct result or outcome",
      "explanation": "The mechanism linking cause to effect — why this happens",
      "chain": ["Intermediate stage A", "Intermediate stage B"]
    }
  ]
}

Rules:
1. comparison.entities — Identify approximately 2–4 major competing or contrasting concepts/systems/frameworks from the notes. If fewer than 2 comparable entities exist, return { "entities": [], "attributes": [] }.
2. comparison.attributes — Approximately 4–8 attributes that reveal meaningful differences. Values must be specific and concrete — never write "varies" or "depends on context".
3. conceptTable — Approximately 3–8 key concepts from the notes. "mechanism" must explain the underlying process, not just define the term. "strategicTakeaway" must be sharp and actionable — never generic advice like "understand this well" or "review carefully".
4. causeEffect — Approximately 3–8 causal relationships directly traceable to the notes. "chain" is optional — only include it when the effect genuinely cascades through 2 or more distinct intermediate stages. Omit the "chain" key entirely when not applicable.
5. Every single field must reference actual content from the notes. Zero generic filler.
6. Dynamically scale the volume of your output: The exact number of entities, attributes, concepts, and relationships should vary based on the note's length, density, and complexity.

Study notes:
${notes}`
}


// ─── Comparison Table ─────────────────────────────────────────────────────────

function ComparisonTable({ data }) {
  const { entities, attributes } = data

  if (!entities?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
          <Table2 size={22} className="text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-600">No substantial comparable entities found in your notes.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 border-t-1 border-slate-200 pt-4">
        <div className="min-w-[40%]">
          <h2 className="ml-2 text-base font-semibold text-slate-800 min-w-max">Comparison Table</h2>
          <p className="ml-2 text-xs text-slate-500 mt-0.5">
            Comparing <span className="font-medium text-slate-700">{entities.length} entities</span> across{' '}
            <span className="font-medium text-slate-700">{attributes.length} dimensions</span>
          </p>
        </div>

        {/* Entity legend */}
        <div className="flex flex-wrap items-center justify-start gap-2">
          {entities.map((entity, i) => (
            <span key={i} className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500 text-white text-[10px] font-bold">
                {String.fromCharCode(65 + i)}
              </span>
              {entity}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="text-left px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider w-44 border-r border-slate-700">
                Attribute
              </th>
              {entities.map((entity, i) => (
                <th
                  key={i}
                  className="text-left px-5 py-3.5 font-semibold text-sm border-r border-slate-700 last:border-r-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500 text-white text-xs font-bold shrink-0">
                      {String.fromCharCode(65 + i)}
                    </span>
                    {entity}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attributes.map((row, rowIdx) => {
              return (
                <tr
                  key={rowIdx}
                  className={`border-b border-slate-100 transition-colors ${
                    rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'
                  } hover:bg-indigo-100/40`}
                >
                  <td className="px-5 py-3.5 font-medium text-slate-700 text-xs border-r border-slate-200 align-top">
                    {row.attribute}
                  </td>
                  {row.values.map((val, colIdx) => {
                    return (
                      <td
                        key={colIdx}
                        className="px-5 py-3.5 text-slate-600 border-r border-slate-200 last:border-r-0 align-top"
                      >
                        {val}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Concept Breakdown ────────────────────────────────────────────

const CONCEPT_FIELDS = [
  { key: 'mechanism', label: 'Core Mechanism', emoji: '⚙️', color: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-200' },
  { key: 'practicalImplications', label: 'Practical Implications', emoji: '🎯', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { key: 'tradeoffs', label: 'Trade-offs & Limitations', emoji: '⚖️', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  { key: 'strategicTakeaway', label: 'Strategic Takeaway', emoji: '💡', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
]

function ConceptBreakdown({ data }) {
  if (!data?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
          <Layers2 size={22} className="text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-600">No substantial concepts found in your notes.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between mb-6 border-t-1 border-slate-200 pt-4">
        <div className="min-w-[40%]">
          <h2 className="ml-2 text-base font-semibold text-slate-800 min-w-max">Concept Breakdown</h2>
          <p className="ml-2 text-xs text-slate-500 mt-0.5">
           <span className="font-medium text-slate-700">{data.length} key concepts </span> from your notes
          </p>
        </div>

        {/* Concept legend */}
        <div className="flex flex-wrap items-center justify-start gap-2">
          {data.map((item, i) => (
            <span key={i} className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500 text-white text-[10px] font-bold">
                {i + 1}
              </span>
              {item.concept}
            </span>
          ))}
        </div>
      </div>
      {data.map((item, i) => (
        <div key={i} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 bg-slate-800 flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
              {i + 1}
            </span>
            <h3 className="text-white font-semibold text-sm">{item.concept}</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            {CONCEPT_FIELDS.map(field => (
              <div key={field.key} className="p-4">
                <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border mb-2.5 ${field.bg} ${field.color} ${field.border}`}>
                  <span>{field.emoji}</span>
                  {field.label}
                </div>
                <p className="text-slate-700 text-sm leading-relaxed">{item[field.key]}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function CauseEffectView({ data }) {
  const [expanded, setExpanded] = useState(false)

  if (!data?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
          <GitBranch size={22} className="text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-600">No substantial causal relationships in your notes.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="border-t-1 border-slate-200 pt-4 mb-5">
        <h2 className="ml-2 text-base font-semibold text-slate-800">Cause & Effect</h2>
        <p className="ml-2 text-xs text-slate-500 mt-0.5">
          <span className="font-medium text-slate-700">{data.length} relationships</span> identified in your notes.
          Expand cards to see multi-step causal chains.
        </p>
      </div>
      {data.map((item, i) => (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow" key={i}>
          {/* Cause → Effect header */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-0">
            {/* Cause */}
            <div className="bg-amber-50 border-r border-slate-200 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1.5">
                Cause
              </p>
              <p className="text-sm font-medium text-slate-800 leading-snug">{item.cause}</p>
            </div>

            {/* Arrow connector */}
            <div className="flex items-center justify-center px-3 py-4 bg-white self-stretch">
              <div className="flex flex-col items-center gap-1">
                <div className="w-px h-6 bg-slate-300" />
                <ArrowRight size={16} className="text-indigo-400 shrink-0" />
                <div className="w-px h-6 bg-slate-300" />
              </div>
            </div>

            {/* Effect */}
            <div className="bg-indigo-50 border-l border-slate-200 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 mb-1.5">
                Effect
              </p>
              <p className="text-sm font-medium text-slate-800 leading-snug">{item.effect}</p>
            </div>
          </div>

          {/* Explanation + optional chain */}
          <div className="border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500 leading-relaxed">{item.explanation}</p>

            {item.chain?.length && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="mt-2.5 flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-600 font-medium transition-colors cursor-pointer"
              >
                <Link2 size={12} />
                {expanded ? 'Hide' : 'Show'} causal chain
                {<ChevronRight size={12} className={`shrink-0 ${expanded ? 'rotate-90' : ''} transition-transform duration-300`} />}
              </button>
            )}

            {item.chain?.length && expanded && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {item.chain.map((step, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-full font-medium border border-slate-200">
                      {step}
                    </span>
                    {i < item.chain.length - 1 && (
                      <ArrowRight size={12} className="text-slate-400 shrink-0" />
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))} 
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────

export default function Analysis() {
  const [notes] = useLocalStorage('knowtico-notes', '')
  const [analysis, setAnalysis] = useLocalStorage('knowtico-analysis', null)
  const [lastNotes, setLastNotes] = useLocalStorage('knowtico-last-notes-analysis', '')
  const [activeTab, setActiveTab] = useState('comparison')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notesChanged, setNotesChanged] = useState(false)
  const navigate = useNavigate()

  /*
  const location = useLocation()
  const navigate = useNavigate()

  // Auto-generate on navigation
  useEffect(() => {
    if (analysis && lastNotes === notes) return
    if (location.state?.autoGen) {
      navigate(location.pathname, { replace: true, state: { autoGen: false } })
      generate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) 
  */

  // Notes change detection
  useEffect(() => {
    if (!analysis || !notes.trim()) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (lastNotes !== notes) setNotesChanged(true)
    else setNotesChanged(false)
  }, [notes, analysis, lastNotes])

  async function generate() {
    if (!notes.trim()) { 
      setError('No notes found. Add notes first.'); 
      return 
    }
    setLoading(true)
    setError(null)
    try {
      const raw = await callGemini(buildAnalysisPrompt(notes))
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      setAnalysis(parsed)
      setLastNotes(notes) 
    } catch (err) {
      setError('Failed to generate Analysis. Check your API key or try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const tabCounts = analysis ? {
    comparison: analysis.comparison?.entities?.length ? `${analysis.comparison.entities.length}` : null,
    concepts: analysis.conceptTable?.length ? `${analysis.conceptTable.length}` : null,
    causeEffect: analysis.causeEffect?.length ? `${analysis.causeEffect.length}` : null,
  } : {}

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-indigo-400">
          <Loader2 size={32} className="animate-spin" />
          <p className="text-sm">Building your analysis...</p>
          <p className="text-xs text-gray-400">Analysing your notes</p>
        </div>
      </div>
    )
  }
  
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
              <ChartNoAxesCombined size={24} className="text-indigo-500" />
              <h2 className="text-xl font-bold text-gray-800">Analysis</h2>
            </div>
            <p className="ml-8 text-sm text-gray-400 mb-2">
              Structured breakdown — comparisons, concept deep-dives, and causal chains
            </p>
          </div>
          {analysis ?
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
      {analysis && (
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
                <Icon size={14} />
                {label}
                {tabCounts[id] && (
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${
                    activeTab === id
                      ? 'bg-indigo-100 text-indigo-600'
                      : 'bg-slate-200 text-slate-500'
                  }`}>
                    {tabCounts[id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 relative">

        {/* Empty state */}
        {!analysis && (
          !notes.trim() ? (
            <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl bg-white">
              <ChartNoAxesCombined size={32} className="text-indigo-200 mx-auto mb-3" />
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
              <ChartNoAxesCombined size={32} className="text-indigo-200 mx-auto mb-3" />
              <p className="text-gray-500 text-sm font-medium mb-1">No analysis yet</p>
              <p className="text-gray-400 text-xs mb-5 max-w-xs mx-auto">
                Generate a structured breakdown — comparison tables, concept deep-dives, and causal chains from your notes
              </p>
              <button
                onClick={generate}
                className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                Generate Analysis
              </button>
            </div>
          )
        )}

        {/* Tab content */}
        {analysis && (
          <>
            {activeTab === 'comparison'  && <ComparisonTable  data={analysis.comparison}  />}
            {activeTab === 'concepts'    && <ConceptBreakdown data={analysis.conceptTable} />}
            {activeTab === 'causeEffect' && <CauseEffectView  data={analysis.causeEffect}  />}
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