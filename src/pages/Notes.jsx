// del result panel from the right and add progress-tracker or a note history or a summary on the right.
// generate button appears only after writing 200+ characters
// improve on given notes, idenfitify errors or faulty ideas in notes
// live lecture input

import { useState,useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, ScrollText, ArrowRight, FileText, AlertTriangle, RefreshCw, GalleryHorizontalEnd, BrainCircuit, BookOpen, NotebookPen } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { callGemini } from '../lib/gemini'

const actions = [
  {
    key: '/study-guide',
    icon: BookOpen,
    label: 'Study Guide',
    description: 'Structured learning breakdown',
    color: 'text-orange-500',
    bg: 'bg-orange-50',
  },
  {
    key: '/mindmap',
    icon: FileText,
    label: 'Mind Map',
    description: 'Review with AI-generated Mind Map',
    color: 'text-blue-500',
    bg: 'bg-blue-50',
  },
  {
    key: '/flashcards',
    icon: GalleryHorizontalEnd,
    label: 'Flashcards',
    description: 'Review with AI-generated cards',
    color: 'text-purple-500',
    bg: 'bg-purple-50',
  },
  {
    key: '/quiz',
    icon: BrainCircuit,
    label: 'Quiz',
    description: 'Test your knowledge',
    color: 'text-green-500',
    bg: 'bg-green-50',
  },
]

function buildPrompt(notes) {
  return `You are a study assistant. Summarize the notes below into key points.

Return ONLY a JSON object in this exact format, no extra text:
{"summary": ["Each string in this array should be a 2-3 sentence paragraph covering a specific key point."]}

Rules:
- Write in plain text. Do NOT use **, ##, or any markdown formatting.
- Write each key point as its own short paragraph (2-3 sentences).
- Reorganize scattered ideas logically. Omit filler.
- Create as many paragraphs as necessary to cover all unique key points found in the notes.

Notes:
${notes}`;
}

export default function Notes() {
  const navigate = useNavigate()
  const [notes, setNotes] = useLocalStorage('knowtico-notes', '')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(null)
  const [result, setResult] = useLocalStorage('knowtico-summary', null)
  const [lastNotes, setLastNotes] = useLocalStorage('knowtico-notes-last-notes', '')
  const [notesChanged, setNotesChanged] = useState(false)

  useEffect(() => {
    if (!result || !notes.trim()) return
    if (notes !== lastNotes) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotesChanged(true)
    } else setNotesChanged(false)
  }, [notes, result, lastNotes])

  function handleAction(action) {
    if (!notes.trim()) {
      setError('Please enter some notes first.')
      return
    }
    navigate(action)
  }

  async function handleSummary() {
    if (!notes.trim()) {
      return setError('Please enter some notes first.');
    }
    setLoading(true);
    setError(null);
    try {
      const raw = await callGemini(buildPrompt(notes));
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      setResult(parsed);
      setLastNotes(notes)
      setNotesChanged(false)
    } catch(e) {
      setError('Failed to generate summary. Check your API key or try again.')
      console.error(e);
    } finally {
      setLoading(false);
    } 
  }
  
  return (
    <div className="flex h-full">

      {/* Left panel — note input */}
      <div className="w-1/2 flex flex-col border-r border-gray-200 p-6 gap-4 overflow-y-auto [scrollbar-width:thin]">
        <div className="flex items-center gap-2">
          <ScrollText size={20} className="text-indigo-500" />
          <h2 className="text-lg font-bold text-gray-700">Your Notes</h2>
        </div>
        {/* min-h essential */}
        <textarea
          className="min-h-3/4 w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
          placeholder="Paste or type your study notes here...&#10;&#10;Example: Chapter 3 - The water cycle involves evaporation, condensation, and precipitation..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {/* Quick actions */}
        <h2 className="mt-4 text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-4 mb-3 ">
          {/* eslint-disable-next-line no-unused-vars */}
          {actions.map(({ icon: Icon, label, description, key, color, bg }) => (
            <button
              key={key}
              onClick={() => handleAction(key)}
              className="flex items-start gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all text-left group cursor-pointer"
            >
              <div className={`${bg} ${color} p-2 rounded-lg`}>
                <Icon size={20} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{description}</p>
              </div>
              <ArrowRight size={16} className="text-gray-300 group-hover:text-indigo-400 transition-colors mt-1" />
            </button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg fixed bottom-4 right-4 z-50">{error}</p>
        )}
          
      </div>

      {/* Summary */}
      <div className="w-1/2 flex flex-col">
        {/* Notes-changed warning banner */}
        <div className={`shrink-0 overflow-hidden transition-all duration-300 ${ notesChanged ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0' }`}>
          <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex items-center justify-between gap-4">
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
                onClick={handleSummary}
                disabled={loading}
                className="text-xs font-medium bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors cursor-pointer disabled:bg-gray-200 disabled:text-gray-400 disabled:pointer-events-none"
              >
                Regenerate
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-6 border-b border-gray-100">
          <div className="flex items-center gap-2 text-indigo-500">
            <FileText size={16} strokeWidth={1.8} />
            <span className="text-sm font-semibold tracking-wide text-gray-500">
              Summary
            </span>
          </div>
          <button
            onClick={() => handleSummary()}
            disabled={loading}
            className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium 
                      bg-indigo-50 text-indigo-600 border border-indigo-100
                      hover:bg-indigo-100 hover:border-indigo-200
                      active:scale-95 transition-all duration-150 disabled:bg-gray-200 disabled:text-gray-400 disabled:pointer-events-none"
          >
            <RefreshCw size={12} strokeWidth={2} />
            {result?'Regenerate':'Generate'}
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 px-5 py-6 text-sm text-gray-400">
            <div className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            Generating…
          </div>
        )}

        {!loading && result && (
          <div className="px-5 py-6 overflow-y-auto">
            {result.summary.map((p, i) => (
              <p key={i} className="text-sm text-gray-700 leading-relaxed mb-3 last:mb-0">
                {p}
              </p>
            ))}
          </div>
        )}

        {!loading && !result && !notes.trim() && (
          <div className="text-center py-40 border border-dashed border-gray-200 rounded-xl bg-white">
            <FileText size={32} className="text-indigo-200 mx-auto mb-3" />
            <p className="text-gray-500 text-sm font-medium">No notes found</p>
            <p className="text-gray-400 text-xs mt-1">Add your study material first</p>
          </div>            
        )}

        {!loading && !result && notes.trim() && (
          <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl bg-white">
            <FileText size={32} className="text-indigo-200 mx-auto mb-3" />
            <p className="text-gray-500 text-sm font-medium mb-4">No Summary yet</p>
            <button
              onClick={() => handleSummary()}
              className="cursor-pointer gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-600
               border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-200 active:scale-95 transition-all duration-150"
            >
              <div className='flex gap-1.5'>
                <RefreshCw size={12} className='stroke-2 mt-0.5' />
                Generate 
              </div>
            </button>
          </div>
        )}

      </div>

    </div>
  )
}
