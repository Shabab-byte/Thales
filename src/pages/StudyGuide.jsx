//Each step should have their own key points, common mistakes to avoid, flashcard, quiz, Mastery check question (preferably generated separately because AI might not be handle all of this properly)
// hoover to see full name
// addition points and ideas outside of the note
//disable generate buttons if loading
// maintain states when switching
// if marked done, add a go to next step button
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { callGemini } from '../lib/gemini'
import {
  Loader2, Sparkles, RefreshCw, BookOpen, Brain,
  CheckCircle, Circle, Lightbulb, AlertTriangle,
  Target, Clock, Zap, ArrowRight, Trophy, ChevronRight, GraduationCap, Info,
} from 'lucide-react'


const STEP_CONFIG = {
  orient:    { icon: BookOpen,  color: 'text-blue-500',   bg: 'bg-blue-50',   border: 'border-blue-200'   },
  understand:{ icon: Brain,     color: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-200' },
  memorize:  { icon: Zap,       color: 'text-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
  practice:  { icon: Target,    color: 'text-green-500',  bg: 'bg-green-50',  border: 'border-green-200'  },
  test:      { icon: Brain,     color: 'text-indigo-500', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  reflect:   { icon: Lightbulb, color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' },
  review:    { icon: RefreshCw, color: 'text-red-500',    bg: 'bg-red-50',    border: 'border-red-200'    },
}


function buildStudyGuidePrompt(notes) {
  return `You are an expert teacher and learning coach. A student has given you their study notes. Your job is to create a highly personalized, expert-quality mastery plan — the kind of advice a great tutor would give in a one-on-one session, not a generic study tips list.

Return ONLY a raw JSON object — no markdown, no explanation, no code fences.

{
  "subject": "Detected subject name (e.g. 'Cell Biology', 'World War II', 'React Hooks', 'Calculus - Derivatives')",
  "overview": "Approximately 2-3 sentences written directly to the learner. What this material is about, why it matters, and the single most important thing to keep in mind while learning it.",
  "prerequisiteWarning": "Specific concepts the student MUST already understand before this material will make sense. Be concrete. Or null if no real prerequisites.",
  "howToUse": "One sentence telling the learner how to navigate these steps — whether they must be followed strictly in order, or whether certain steps are independent. Base this on the actual structure of the material, not a generic instruction.",
  "steps": [
    {
      "id": "step-1",
      "type": "orient | understand | memorize | practice | test | reflect",
      "title": "Action-oriented title",
      "description": "Specific, concrete instruction for THIS material. Reference actual concepts from the notes. Tell them WHAT to do and exactly WHY this step matters for this subject. Not generic advice — something a tutor who read these notes would say.",
      "expertTip": "One insight that separates students who struggle from students who master this. A specific misconception warning, a mental model that unlocks understanding, a connection to something they likely already know, or a sequencing insight. Name actual concepts. Never say 'take your time', 'review carefully', or anything a generic study guide would say.",
      "estimatedMinutes": "An estimated range of time in minutes like: 10–15",
      "keyPoints": [
        "a few points that serve as a crash-course for this step. Write each as an insight or principle, not a definition. The learner should understand the WHY behind the concept, not just what it is. Bad: 'Reductive method = analyzing past causes.' Good: 'The reductive method tells you where you came from but gives you no direction for where to go — which is why Jung found it insufficient for adult patients.'"
      ],
      "commonMistakes": [
        {
          "mistake": "A specific mistake students make at THIS step with THIS material — not a generic study warning. It must be a mistake someone could only make after engaging with these exact concepts.",
          "correction": "The correct mental model or approach, explained concretely using the actual concept."
        }
      ],
      "masteryTests": [
        "A question that proves genuine understanding of THIS step — requires application or explanation, not recall. Must be answerable only by someone who worked through this step, not by someone who just read the heading."
      ]
    }
  ]
}

--- CRITICAL RULES (output will be rejected if violated) ---
- Steps must follow a logical pedagogical arc: orientation and context first, then understanding, then encoding and practice, then application and testing, then reflection. Never open with a memorize or test step.
- Every description, expertTip, keyPoint, commonMistake, and masteryTest must reference actual concepts or terminology from the notes. Nothing generic, nothing that applies to every other subject.
- Each masteryTest question must be specific enough that it could only appear in a guide about THIS material — if it could appear in every other study guide, rewrite it.

--- QUALITY RULES (define the difference between good and great output) ---
- The number of steps, commonMistakes, masteryTests, keyPoints you generate should be based on the note's length, density, difficulty and other relevant parameters.
- expertTip must name a specific concept. If a real insight does not exist for a step, give a conceptual connection to an earlier step or a sequencing warning instead.
- keyPoints must build understanding, not just restate definitions. If a keyPoint reads like a generic glossary entry, rewrite it as an insight.
- Do not default to one Common Mistake or one Mastery Test question per step. If a concept is multi-faceted, you are required to provide 2–4 or more commonMistakes and masteryTests per step to ensure full coverage.
Notes:
${notes}`
}

export default function StudyGuide() {
  const navigate = useNavigate()
  const [notes] = useLocalStorage('knowtico-notes', '')
  const [guide, setGuide] = useLocalStorage('knowtico-study-guide', null)
  const [noteId, setNoteId] = useLocalStorage('knowtico-study-guide-note-id', null)
  const [progress, setProgress] = useLocalStorage('knowtico-study-progress', {})

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeStepId, setActiveStepId] = useLocalStorage('knowtico-study-guide-active-step-id', null)
  const [lastNotes, setLastNotes] = useLocalStorage('knowtico-study-guide-last-notes', '')
  const [notesChanged, setNotesChanged] = useState(false)
  const [pulsingStepId, setPulsingStepId] = useState(null)
  const [expanded, setExpanded] = useState({ mistakes: true, mastery: true })

  const stepRefs = useRef({})
  
  const [ quizScores, setQuizScores] = useLocalStorage('knowtico-quiz-scores', {}) // { [stepTitle]: score }
  const [ cardsScores, setCardsScores] = useLocalStorage('knowtico-flashcards-scores', {}) // { [stepTitle]: score }

  useEffect(() => {
    if (!guide || !notes.trim()) return
    if (notes !== lastNotes) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotesChanged(true)
    } else setNotesChanged(false)
  }, [notes, guide, lastNotes])

  useEffect(() => {
    if (!guide || !noteId) return
    const updates = {}
    guide.steps.forEach(step => {
      const key = `${noteId}-${step.id}`
      let quizFlag = false
      let cardsFlag = false
      if ( cardsScores?.[step.title] && cardsScores?.[step.title] >= 75) {
        cardsFlag = true
      }
      if ( quizScores?.[step.title] && quizScores?.[step.title] >= 70) {
        quizFlag = true
      }
      if (quizFlag && cardsFlag && !progress[key] ) updates[key] = true
    })
    if (Object.keys(updates).length > 0) {
      setProgress(prev => ({ ...prev, ...updates }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ quizScores, cardsScores, noteId, guide, activeStepId])

  useEffect(() => {
    if (!guide) return
    if (!activeStepId) {
      const first = guide?.steps?.find(s => !progress[`${noteId}-${s.id}`]) ?? guide.steps[0]
      setActiveStepId(first?.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide])


  function isComplete(stepId) {
    return notes? !!progress[`${noteId}-${stepId}`] : false
  }

  function toggleComplete(stepId) {
    if (!noteId) return
    // console.log('running')
    const key = `${noteId}-${stepId}`
    const completed = !progress[key]
    setProgress(prev => ({ ...prev, [key]: completed })) // [key]

    if (completed) {
      const currentIdx = guide?.steps?.findIndex(s => s.id === stepId)
      const next = guide.steps.slice(currentIdx + 1).find(s => !progress[`${noteId}-${s.id}`])  // next id that is unchecked, After the current id.
      if (next) {
        setActiveStepId(next.id)
        setPulsingStepId(next.id)
        setTimeout(() => {
          stepRefs.current[next.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 120)
        setTimeout(() => setPulsingStepId(null), 400) //needs application
      }
    }
  }

  async function generateGuide() {
    if (!notes.trim()) { setError('No notes found. Add notes first.'); return }
    setLoading(true)
    setError(null)
    try {
      const raw = await callGemini(buildStudyGuidePrompt(notes))
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      const newId = `note_${Date.now()}`
      setGuide(parsed)
      setNoteId(newId)
      setProgress({})
      setActiveStepId(parsed.steps[0]?.id)
      setNotesChanged(false)
      setLastNotes(notes)
      setQuizScores({}) 
      setCardsScores({})
    } catch (err) {
      setError('Failed to generate study guide. Check your API key or try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }


  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-indigo-400">
          <Loader2 size={32} className="animate-spin" />
          <p className="text-sm">Building your study guide...</p>
          <p className="text-xs text-gray-400">Analysing your notes</p>
        </div>
      </div>
    )
  }

  if (!guide || !notes.trim()) {
    return <EmptyState notes={notes} error={error} onGenerate={generateGuide} navigate={navigate} />
  }

  const completedCount = guide.steps.filter(s => isComplete(s.id)).length
  const totalSteps = guide.steps.length
  const progressPct = Math.round((completedCount / totalSteps) * 100)
  const activeStep = guide?.steps?.find(s => s.id === activeStepId) ?? guide.steps[0]

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Notes-changed warning banner */}
      <div className={`shrink-0 overflow-hidden transition-all duration-300 ${ notesChanged ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0' }`}>
        <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-500 shrink-0" />
            <p className="text-xs text-amber-800">
              Your notes have changed since this guide was generated.
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
              onClick={generateGuide}
              className="text-xs font-medium bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors cursor-pointer"
            >
              Regenerate
            </button>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-6 py-4 border-b border-gray-200 bg-white">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-0.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <h2 className="text-lg font-bold text-gray-800">{guide.subject}</h2>
              <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-medium shrink-0">
                {completedCount} / {totalSteps} steps
              </span>
            </div>
          </div>
          <button
            onClick={generateGuide}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg hover:border-gray-500 transition-colors shrink-0 cursor-pointer"
          >
            <RefreshCw size={12} /> Regenerate
          </button>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">{guide.overview}</p>

        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <p className="text-xs text-gray-400">
            {progressPct === 100 ? '🎉 All steps complete!' : `${progressPct}% progress`}
          </p>
          <p className="text-xs text-gray-400">
            {totalSteps - completedCount > 0
              ? `${totalSteps - completedCount} step${totalSteps - completedCount > 1 ? 's' : ''} remaining`
              : 'Done!'}
          </p>
        </div>

        {/* Prerequisite warning */}
        {guide.prerequisiteWarning && (
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <Info size={13} className="text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700">
              <span className="font-semibold">Before you start: </span>
              {guide.prerequisiteWarning}
            </p>
          </div>
        )}
      </div>

      {/* Two-panel body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: Step list */}
        <div className="w-64 shrink-0 border-r border-gray-200 overflow-y-auto p-3 flex flex-col gap-1.5">
          {guide.steps.map((step, idx) => {
            const cfg = STEP_CONFIG[step.type] ?? STEP_CONFIG.orient
            const Icon = cfg.icon
            const done = isComplete(step.id)
            const isActive = activeStepId === step.id
            const isPulsing = pulsingStepId === step.id

            return (
              <div
                key={step.id}
                ref={el => { stepRefs.current[step.id] = el }}
                onClick={() => setActiveStepId(step.id)}
                className={`
                  cursor-pointer rounded-xl border p-3 transition-all duration-200
                  ${isPulsing ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}
                  ${isActive
                    ? 'border-indigo-300 bg-indigo-50 shadow-sm'
                    : done
                    ? 'border-green-200 bg-green-50 opacity-60 hover:opacity-90'
                    : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-gray-50'}
                `}
              >
                <div className="flex items-start gap-2.5">
                  {/* Circle / check badge */}
                  <div className={`
                    mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium transition-colors
                    ${done
                      ? 'bg-green-500 text-white'
                      : isActive
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-500'}
                  `}>
                    {done ? '✓' : idx + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium leading-snug truncate ${
                      isActive ? 'text-indigo-800' : done ? 'text-green-700' : 'text-gray-700'
                    }`}>
                      {step.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Icon size={10} className={done ? 'text-green-400' : cfg.color} />
                      <span className="text-xs text-gray-400">{step.estimatedMinutes} min</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Right: Active step detail */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-2xl">
            {activeStep && (
              <ActiveStepDetail
                step={activeStep}
                stepNumber={guide?.steps?.findIndex(s => s.id === activeStep.id) + 1}
                totalSteps={totalSteps}
                done={isComplete(activeStep.id)}
                onToggle={toggleComplete}
                onNavigate={navigate}
                cardsScores={cardsScores}
                quizScores={quizScores}
                expanded={expanded}
                setExpanded={setExpanded}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Active step detail panel ─────────────────────────────────────────────────

function ActiveStepDetail({ step, stepNumber, totalSteps, done, onToggle, onNavigate, cardsScores, quizScores, expanded, setExpanded }) {
  const cfg = STEP_CONFIG[step.type] ?? STEP_CONFIG.orient
  const Icon = cfg.icon
  const quizScore = quizScores?.[step.title] ?? null
  const cardsScore = cardsScores?.[step.title] ?? null

  // Auto-complete status message
  const autoMsgCards = cardsScore !== null
    ? cardsScore >= 75
      ? { text: 'Auto-completed — flashcard mastery', ok: true, score: cardsScore }
      : { text: 'Reach 75%+ mastery in Flashcards to auto-complete this step', ok: false, score: cardsScore }
    : { text: 'Complete a Flashcards session to auto-complete this step', ok: false, score: null };

  const autoMsgQuiz = quizScore !== null
    ? quizScore >= 70
      ? { text: 'Auto-completed — quiz score', ok: true, score: quizScore }
      : { text: 'Score 70%+ on the Quiz to auto-complete this step', ok: false, score: quizScore }
    : { text: 'Complete a Quiz session to auto-complete this step', ok: false, score: null };

  return (
    <div>
      {/* Step header */}
      <div className="flex items-start gap-3 mb-5">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center border shrink-0 ${cfg.bg} ${cfg.border}`}>
          <Icon size={20} className={cfg.color} />
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Step {stepNumber} of {totalSteps}</p>
          <h3 className="text-lg font-bold text-gray-800 leading-tight">{step.title}</h3>
          <div className="flex items-center gap-1.5 mt-1">
            <Clock size={11} className="text-gray-400" />
            <span className="text-xs text-gray-400">{step.estimatedMinutes} min estimated</span>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
        <p className="text-sm text-gray-700 leading-relaxed">{step.description}</p>
      </div>

      {/* Expert tip */}
      {step.expertTip && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-2.5">
          <GraduationCap size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-0.5">Expert tip</p>
            <p className="text-xs text-amber-800 leading-relaxed">{step.expertTip}</p>
          </div>
        </div>
      )}
      
      {/* key points */}
      {step.keyPoints?.length > 0 && (
        <div className="mt-6">
          {/* Section header */}
          <div className="flex items-center gap-2.5 mb-3.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-100 border border-indigo-300 shrink-0">
              <Lightbulb className="w-4 h-4 text-indigo-600" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
              Key Points
            </span>
          </div>

          {/* Key points list */}
          <div className="flex flex-col gap-2">
            {step.keyPoints.map((p, i) => (
              <div
                key={i}
                className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 border-l-[3px] border-l-indigo-400 rounded-xl p-3.5 transition-all duration-150 hover:bg-indigo-100 hover:border-l-indigo-500"
              >
                <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500 text-white text-[11px] font-semibold mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-indigo-900 leading-relaxed">{p}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Common mistakes */}
      {step.commonMistakes?.length > 0 && (
        <section className="mt-7">
          <button
            onClick={() => setExpanded(p => ({ ...p, mistakes: !p.mistakes }))}
            className="group flex items-center gap-2 w-full text-left mb-3 cursor-pointer"
          >
            <AlertTriangle size={15} className="text-orange-500 shrink-0 group-hover:text-orange-600" />
            <span className="text-xs font-semibold uppercase tracking-wide text-orange-500 group-hover:text-orange-600">Common mistakes to avoid</span>
            <ChevronRight
              size={14}
              className={`ml-auto text-orange-500 transition-transform group-hover:text-orange-600 ${expanded.mistakes ? 'rotate-90' : ''}`}
            />
          </button>
          {expanded.mistakes && (
            <div className="flex flex-col gap-2">
              {step.commonMistakes.map((m, i) => (
                <div key={i} className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                  <p className="text-xs font-medium text-orange-700 mb-1.5 flex items-start gap-1.5">
                    <span className="shrink-0 mt-0.5">✗</span>{m.mistake}
                  </p>
                  <p className="text-xs text-orange-600 flex items-start gap-1.5">
                    <span className="shrink-0 mt-0.5">✓</span>{m.correction}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Mastery check */}
      {step.masteryTests?.length > 0 && (
        <section className="mt-4 mb-10">
          <button
            onClick={() => setExpanded(p => ({ ...p, mastery: !p.mastery }))}
            className="flex items-center gap-2 w-full text-left mb-3 group cursor-pointer"
          >
            <Trophy size={15} className="text-indigo-400 shrink-0 group-hover:text-indigo-500" />
            <span className="text-xs font-semibold uppercase tracking-wide text-indigo-400 group-hover:text-indigo-500">Mastery check</span>
            <ChevronRight
              size={14}
              className={`ml-auto text-indigo-400 transition-transform group-hover:text-indigo-500 ${expanded.mastery ? 'rotate-90' : ''}`}
            />
          </button>
          {expanded.mastery && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
              <p className="text-xs text-indigo-600 mb-3">
                If you can answer these without your notes, you've genuinely mastered this step:
              </p>
              <div className="flex flex-col gap-2.5">
                {step.masteryTests.map((q, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-xs font-semibold text-indigo-400 shrink-0 mt-0.5">{i + 1}.</span>
                    <p className="text-xs text-indigo-800 leading-relaxed">{q}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <StatusBanner msg={autoMsgCards} linkedPage='/flashcards' onNavigate={onNavigate} />
      <StatusBanner msg={autoMsgQuiz}  linkedPage='/quiz' onNavigate={onNavigate} />

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => onToggle(step.id)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border transition-all cursor-pointer ${
            done
              ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
              : 'border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50'
          }`}
        >
          {done
            ? <><CheckCircle size={14} /> Mark incomplete</>
            : <><Circle size={14} /> Mark complete</>
          }
        </button>
      </div>

    </div>
  )
}


function EmptyState({ notes, error, onGenerate, navigate }) {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-1">Study Guide</h2>
      <p className="text-sm text-gray-400 mb-8">
        A personalised, step-by-step plan to master your material
      </p>

      {!notes.trim() ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl bg-white">
          <BookOpen size={32} className="text-indigo-200 mx-auto mb-3" />
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
          <Sparkles size={32} className="text-indigo-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium mb-1">No study guide yet</p>
          <p className="text-gray-400 text-xs mb-5 max-w-xs mx-auto">
            Generate a personalised mastery plan based on your notes — step-by-step, with expert advice for this specific material.
          </p>
          <button
            onClick={onGenerate}
            className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
          >
            Generate Study Guide
          </button>
        </div>
      )}

      {error && <p className="text-red-500 text-sm mt-4 text-center">{error}</p>}
    </div>
  )
}

function StatusBanner({ msg, linkedPage, onNavigate}) {
  return (
    <div
      className={`rounded-xl mb-3 flex items-center justify-between gap-4 px-4 py-3 border-l-4 border border-l-current ${
        msg.ok
          ? 'bg-green-50 border-green-100 text-green-600'
          : 'bg-gray-50 border-gray-100 text-gray-400'
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {msg.ok ? (
          <CheckCircle size={18} className="shrink-0 text-green-600" />
        ) : (
          <Circle size={18} className="shrink-0 text-gray-400" />
        )}
        
        <div className="flex flex-col items-center min-w-0">
          <p className={`text-xs font-medium ${msg.ok ? 'text-green-700' : 'text-gray-600'}`}>
            {msg.text}
          </p>
        </div>
        {/* Dynamic Status Badge */}
        {msg.score !== null ? (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ml-1 ${
              msg.ok
                ? 'bg-green-100 text-green-800'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            <span>{msg.ok ? '🎉' : '🎯'}</span>
            <span>{msg.score}%</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 shrink-0 ml-1">
            <span>⏳</span>
            <span>Not started</span>
          </span>
        )}
      </div>

      <button
        onClick={() => onNavigate(linkedPage, { state: { autoGen: true } })}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer shadow-sm"
      >
        Go to {linkedPage === '/flashcards' ? 'Flashcards' : 'Quiz'}
        <ArrowRight size={12} />
      </button>
    </div>
  );
}