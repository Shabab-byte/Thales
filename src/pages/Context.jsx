import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { callGemini } from '../lib/gemini'
import {
  Loader2, LockKeyholeOpen , RefreshCw, ListChecks, Lightbulb,
  AlertTriangle, Brain, CheckCircle, Circle,
  ChevronRight, Layers, Zap, ChevronLeft
} from 'lucide-react'

function buildContextPrompt(notes) {
  return `You are a master educator preparing a student before they begin studying. Your job is to write the context and orientation section that an expert tutor would give in the first 5 minutes of a session — the part that determines whether everything else sticks or not.

Return ONLY a raw JSON object — no markdown, no explanation, no code fences.

{
  "subject": "Specific subject name detected from the notes (e.g. 'Cell Membrane Transport', 'The French Revolution', 'Binary Search Trees', 'Quadratic Equations')",

  "prerequisites": [
    {
      "concept": "The specific concept the student must already understand",
      "whyItMatters": "One or two sentences explaining exactly how this prerequisite connects to the material in these notes. Do not say 'it is important' — explain the mechanical connection. E.g. 'Osmosis is built on water potential — without understanding potential energy gradients, the direction water moves will feel arbitrary, not logical.'",
      "checkQuestion": "A single self-assessment question the student should be able to answer before proceeding. Make it specific enough that if they can't answer it, they genuinely need to review that concept first."
    }
  ],

  "terminology": [
    {
      "term": "The exact term as it appears or would appear in this subject",
      "formal": "The precise, technically accurate definition — the kind found in a textbook or academic source. Do not dumb it down.",
      "plain": "A plain-English explanation that builds intuition. Use an analogy, a concrete example, or a physical metaphor. This should make the formal definition feel obvious in hindsight.",
      "dontConfuseWith": "The most common term students confuse this with, and a one-sentence explanation of the distinction that cuts right to the conceptual difference. Only include this if a real, common confusion exists — not a forced one."
    }
  ],

  "mentalModels": [
    {
      "title": "Short, memorable name for this mental model (5 words or fewer)",
      "model": "Describe the mental model or reframe in 2-4 sentences. Be concrete and specific to this material. This should be an insight that makes the subject click — not a study tip, not generic advice. The best mental models reframe something that seemed complex into something intuitive.",
      "appliesTo": "The specific concept or section of the notes this model unlocks. Be precise — name the actual concept."
    }
  ]
}

--- CRITICAL RULES ---
- Every whyItMatters must name a specific concept from the notes and explain the mechanical connection — not 'it helps' or 'it is foundational'.
- Every plain definition must contain either an analogy, a physical metaphor, or a concrete real-world example grounded in how this concept behaves.
- Every dontConfuseWith must name the actual confusable term. If no real confusion exists for a term, set dontConfuseWith to null.
- Every mental model must be specific to THIS material. A model that could apply to any subject is not a mental model, it is a platitude. Reject and rewrite it.
- Mental models must describe a reframe or analogy, not a study strategy.

--- QUANTITY RULES ---
- prerequisites: 1–4 items. Only include concepts where the student would genuinely struggle without them. Do not pad with obvious assumptions (e.g. do not include 'basic reading comprehension').
- terminology: all key terms from the notes that a student might not know or might confuse. Typically 5–12 terms. Prioritise terms that are either jargon, have counterintuitive definitions, or are commonly confused.
- mentalModels: 2–4 models. More is not better — only include models that genuinely change how someone thinks about this material.

Notes:
${notes}`
}

export default function Context() {
  const navigate = useNavigate()
  const [notes] = useLocalStorage('knowtico-notes', '')
  const [context, setContext] = useLocalStorage('knowtico-context', null)
  const [checked, setChecked] = useLocalStorage('knowtico-context-checked', {})

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastNotes, setLastNotes] = useLocalStorage('knowtico-context-last-notes', '')
  const [notesChanged, setNotesChanged] = useState(false)
  const [lastNotesGuide] = useLocalStorage('knowtico-study-guide-last-notes', '')
  const location = useLocation()

  useEffect(() => {
    if (!context || !notes.trim()) return
    if (lastNotes !== notes) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotesChanged(true)
    } else setNotesChanged(false)
  }, [notes, context, lastNotes])

  // auto-generate context
  useEffect(() => {
    if (context && (lastNotes === notes || lastNotes === lastNotesGuide)) return
    if (location.state?.autoGen) {
      navigate(location.pathname, {replace: true, state: {autoGen: false}})
      generate()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function generate() {
    if (!notes.trim()) { 
      setError('No notes found. Add notes first.'); 
      return 
    }
    setLoading(true)
    setError(null)
    try {
      const raw = await callGemini(buildContextPrompt(notes))
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      setContext(parsed)
      setChecked({})
      setLastNotes(notes) 
    } catch (err) {
      setError('Failed to generate context page. Check your API key or try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function toggle(key) {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }))
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-indigo-400">
          <Loader2 size={32} className="animate-spin" />
          <p className="text-sm">Building your Preliminaries guide...</p>
          <p className="text-xs text-gray-400">Identifying prerequisites, terms, and mental models</p>
        </div>
      </div>
    )
  }

  if (!context) {
    return <EmptyState notes={notes} error={error} onGenerate={generate} navigate={navigate} />
  }

  const prereqsAllDone = context.prerequisites?.every((_, i) => checked[`prereq-${i}`])
  const totalTerms = context.terminology?.length ?? 0
  const termsDone = context.terminology?.filter((_, i) => checked[`term-${i}`]).length ?? 0
  const modelsDone = context.mentalModels?.filter((_, i) => checked[`model-${i}`]).length ?? 0

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      <div className={`shrink-0 overflow-hidden transition-all duration-300 ${ notesChanged ? 'max-h-24 opacity-100 mb-4' : 'max-h-0 opacity-0' }`}>
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-500 shrink-0" />
            <p className="text-xs text-amber-800">
              Your notes have changed since this was generated.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setNotesChanged(false)}
              className="text-xs text-amber-600 hover:text-amber-800 px-2 py-1 transition-colors cursor-pointer"
            >
              Dismiss
            </button>
            <button
              onClick={() => generate()}
              className="text-xs font-medium bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors cursor-pointer"
            >
              Regenerate
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto w-full pb-10">

        {/* Page header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            {/* Header Section */}
            <div className="flex items-center gap-2 mb-2">
              <ListChecks size={20} className="text-indigo-500 mt-0.5" />
              <h2 className="text-lg font-bold tracking-tight text-gray-800">
                {context.subject}
              </h2>
            </div>

            {/* Visual Metadata Badges */}
            <div className="ml-9 flex flex-wrap items-center gap-2 text-xs font-medium">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200/60">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {context.prerequisites?.length || 0} Prerequisites
              </span>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 border border-purple-200/60">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                {context.terminology?.length || 0} Key Terms
              </span>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {context.mentalModels?.length || 0} Mental Models
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/study-guide')}
              className="flex items-center gap-1.5 text-xs text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors cursor-pointer shrink-0"
            >
              <ChevronLeft size={12} /> Back to Study Guide
            </button>
            <button
              onClick={generate}
              className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-300 px-3 py-1.5 rounded-lg hover:border-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
            >
              <RefreshCw size={12} /> Regenerate
            </button>
          </div>
        </div>

        {/* ── Section 1: Prerequisites ──────────────────────────────────────────── */}
        {context.prerequisites?.length > 0 && (
          <Section
            icon={<AlertTriangle size={16} className="text-amber-500" />}
            title="Prerequisites"
            subtitle="Concepts you must be comfortable with before this material will make sense"
            count={`${context.prerequisites.filter((_, i) => checked[`prereq-${i}`]).length} / ${context.prerequisites.length} confirmed`}
            allDone={prereqsAllDone}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              {context.prerequisites.map((p, i) => (
                <PrerequisiteCard
                  key={i}
                  item={p}
                  done={!!checked[`prereq-${i}`]}
                  onToggle={() => toggle(`prereq-${i}`)}
                />
              ))}
            </div>
          </Section>
        )}

        {/* ── Section 2: Terminology ────────────────────────────────────────────── */}
        {context.terminology?.length > 0 && (
          <Section
            icon={<Layers size={16} className="text-purple-500" />}
            title="Key Terminology"
            subtitle={`${totalTerms} terms — formal definitions, simple explanations, and common confusions`}
            count={`${termsDone} / ${totalTerms} reviewed`}
            allDone={termsDone === totalTerms}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {context.terminology.map((t, i) => (
                <TermCard
                  key={i}
                  item={t}
                  done={!!checked[`term-${i}`]}
                  onToggle={() => toggle(`term-${i}`)}
                />
              ))}
            </div>
          </Section>
        )}

        {/* ── Section 3: Mental Models ──────────────────────────────────────────── */}
        {context.mentalModels?.length > 0 && (
          <Section
            icon={<Brain size={16} className="text-indigo-500" />}
            title="Mental Models"
            subtitle="Reframes that make this material intuitive rather than memorised"
            count={`${modelsDone} / ${context.mentalModels.length} understood`}
            allDone={modelsDone === context.mentalModels.length}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {context.mentalModels.map((m, i) => (
                <MentalModelCard
                  key={i}
                  item={m}
                  done={!!checked[`model-${i}`]}
                  onToggle={() => toggle(`model-${i}`)}
                />
              ))}
            </div>
          </Section>
        )}

        {/* ── Ready banner ──────────────────────────────────────────────────────── */}
        {prereqsAllDone && (
          <div className="mt-6 bg-green-50 border border-green-200 rounded-2xl p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle size={20} className="text-green-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800">Prerequisites confirmed</p>
                <p className="text-xs text-green-600 mt-0.5">
                  You have the foundation you need. Head back to the Study Guide to begin.
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/study-guide')}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 transition-colors shrink-0 cursor-pointer"
            >
              Start Learning <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ icon, title, subtitle, count, allDone, children }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="mb-8">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2.5 w-full text-left mb-4 group cursor-pointer"
      >
        <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center group-hover:bg-gray-200 transition-colors">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-800 transition-opacity group-hover:opacity-80">{title}</h3>
          <p className="text-xs text-gray-400">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            allDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {allDone ? '✓ Done' : count}
          </span>
          <ChevronRight
            size={14}
            className={`text-gray-400 transition-transform group-hover:text-gray-800 ${open ? 'rotate-90' : ''}`}
          />
        </div>
      </button>
      {open && children}
    </div>
  )
}

function PrerequisiteCard({ item, done, onToggle }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`bg-white border rounded-xl p-4 transition-all ${
      done ? 'border-green-200 bg-green-50 opacity-80' : 'border-gray-200 hover:border-amber-200'
    }`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className={`text-sm font-semibold leading-snug ${done ? 'text-green-800' : 'text-gray-800'}`}>
          {item.concept}
        </p>
        <button
          onClick={onToggle}
          className="shrink-0 mt-0.5 transition-colors cursor-pointer"
          title={done ? 'Mark as not confirmed' : 'Confirm I know this'}
        >
          {done
            ? <CheckCircle size={18} className="text-green-500" />
            : <Circle size={18} className="text-gray-300 hover:text-amber-400" />
          }
        </button>
      </div>

      <p className="text-xs text-gray-600 leading-relaxed mb-3">{item.whyItMatters}</p>

      {item.checkQuestion && (
        <>
          <button
            onClick={() => setExpanded(o => !o)}
            className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-800 transition-colors cursor-pointer"
          >
            <Lightbulb size={11} />
            Self-check question
            <ChevronRight size={11} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
          {expanded && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <p className="text-xs text-amber-800 italic leading-relaxed">
                "{item.checkQuestion}"
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TermCard({ item, done, onToggle }) {
  const [view, setView] = useState('plain') // 'plain' | 'formal'

  return (
    <div className={`bg-white border rounded-xl p-4 flex flex-col gap-3 transition-all ${
      done ? 'border-purple-200 bg-purple-50 opacity-80' : 'border-gray-200 hover:border-purple-200'
    }`}>
      {/* Term header */}
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm font-semibold leading-snug ${done ? 'text-purple-800' : 'text-gray-800'}`}>
          {item.term}
        </p>
        <button 
          onClick={onToggle} className="shrink-0 mt-0.5 transition-colors cursor-pointer" 
          title={done ? 'Mark as not reviewed' : 'Mark as reviewed'}
        >
          {done
            ? <CheckCircle size={17} className="text-purple-500" />
            : <Circle size={17} className="text-gray-300 hover:text-purple-400" />
          }
        </button>
      </div>

      {/* Toggle between plain / formal */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
        <button
          onClick={() => setView('plain')}
          className={`flex-1 text-xs py-1 rounded-md font-medium transition-all ${
            view === 'plain' ? 'bg-white text-gray-700 shadow-sm' : 'text-gray-400 hover:text-gray-600 cursor-pointer'
          }`}
        >
          Plain English
        </button>
        <button
          onClick={() => setView('formal')}
          className={`flex-1 text-xs py-1 rounded-md font-medium transition-all ${
            view === 'formal' ? 'bg-white text-gray-700 shadow-sm' : 'text-gray-400 hover:text-gray-600 cursor-pointer'
          }`}
        >
          Formal
        </button>
      </div>

      {/* Definition */}
      <p className="text-xs text-gray-600 leading-relaxed min-h-[3rem]">
        {view === 'plain' ? item.plain : item.formal}
      </p>

      {/* Don't confuse with */}
      {item.dontConfuseWith && (
        <div className="border-t border-gray-100 pt-3 flex items-start gap-2">
          <AlertTriangle size={11} className="text-orange-400 shrink-0 mt-1" />
          <p className="text-xs text-orange-700 leading-relaxed">
            <span className="font-semibold">Don't confuse: </span>
            {item.dontConfuseWith}
          </p>
        </div>
      )}
    </div>
  )
}

function MentalModelCard({ item, done, onToggle }) {
  return (
    <div className={`bg-white border rounded-xl p-5 transition-all ${
      done ? 'border-indigo-200 bg-indigo-50 opacity-80' : 'border-gray-200 hover:border-indigo-200'
    }`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
            <Zap size={13} className="text-indigo-600" />
          </div>
          <p className={`text-sm font-semibold leading-snug ${done ? 'text-indigo-800' : 'text-gray-800'}`}>
            {item.title}
          </p>
        </div>
        <button 
          onClick={onToggle} className="shrink-0 mt-0.5 transition-colors cursor-pointer" 
          title={done ? 'Mark as not reviewed' : 'Mark as reviewed'}
        >
          {done
            ? <CheckCircle size={17} className="text-indigo-500" />
            : <Circle size={17} className="text-gray-300 hover:text-indigo-400" />
          }
        </button>
      </div>

      <p className="text-xs text-gray-700 leading-relaxed mb-3">{item.model}</p>

      <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5">
        <LockKeyholeOpen  size={12} className="text-indigo-400 shrink-0" />
        <p className="text-xs text-indigo-600">
          <span className="font-medium">Unlocks: </span>{item.appliesTo}
        </p>
      </div>
    </div>
  )
}

function EmptyState({ notes, error, onGenerate, navigate }) {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <ListChecks size={24} className="text-indigo-500" />
        <h2 className="text-xl font-bold text-gray-800">Preliminaries</h2>
      </div>
      <p className="ml-8 text-sm text-gray-400 mb-8">
        Prerequisites, key terms, and the mental models that make this material click
      </p>

      {!notes.trim() ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl bg-white">
          <ListChecks size={32} className="text-indigo-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium">No notes found</p>
          <p className="text-gray-400 text-xs mt-1">Go to Notes and add your study material first</p>
          <button
            onClick={() => navigate('/notes')}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Add Notes
          </button>
        </div>
      ) : (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl bg-white">
          <ListChecks size={32} className="text-indigo-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium mb-1">No Preliminaries yet</p>
          <p className="text-gray-400 text-xs mb-5 max-w-xs mx-auto">
            Generate prerequisites, a full terminology glossary with simple explanations, and the mental models that make this material intuitive.
          </p>
          <button
            onClick={onGenerate}
            className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
          >
            Generate Preliminaries
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg fixed bottom-4 right-4 z-50">{error}</p>}
    </div>
  )
}