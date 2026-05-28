//progress bar like gemini+navigation system
//ABCD
//regular timer
import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { callGemini } from '../lib/gemini'
import {
  Loader2, ChevronLeft, ChevronRight, RotateCcw,
  CheckCircle, XCircle, RefreshCw, Clock, Lightbulb, Brain,
  Timer, Trophy, AlertTriangle, Focus, BrainCircuit
} from 'lucide-react'


function buildQuizPrompt(notes) {
  return `You are an expert educator building a focused quiz. Create multiple choice questions from these study notes.
Return ONLY a raw JSON array — no markdown, no explanation, no code fences.

Each object must have exactly these keys:
- "question": a clear, specific question derived from the notes. The question should be testing understanding of this note. If someone could answer it without reading the note, rewrite it.
- "options": exactly 4 distinct answer strings. 1 Correct answer — precise and unambiguous, 3 Wrong answer derived from a real misconception about this topic (Do not invent implausible and obvious wrong answers).
- "answer": the full text of the correct option (must match one of the options exactly, character-for-character).
- "hint": a helpful clue that guides thinking without directly giving away the answer. 

--- RULES ---
- The number of questions you generate should be based on the note's length, density, difficulty and other relevant parameters.
- Make questions varied in difficulty. 
- Ensure hints are genuinely useful but not too obvious.
- If a strong conceptual question cannot be written, write a straight forward 'What is X?' or 'Define X.' or cause-effect question instead.
- Wrong answer options must come from real misconceptions. Do not invent implausible and obvious wrong answers.

Format:
[{"question":"...","options":["A","B","C","D"],"answer":"A","hint":"..."}]

Notes:
${notes}`
}

function buildQuizPromptPerStep(notes, step) {
  return `You are an expert educator building a focused quiz. A learner is currently studying one specific step from their study material. Create multiple choice questions from these study notes. Every question you generate must test understanding of THIS step only — not the broader subject, not adjacent concepts.

Return ONLY a raw JSON object — no markdown, no explanation, no code fences.

[
  {
    "question": "A specific question testing understanding of this Step. If someone could answer it without reading the note, rewrite it.",
    "options": [
      "Correct answer — precise and unambiguous",
      "Wrong answer derived from a real misconception about this step",
      "Wrong answer derived from a real misconception about this step",
      "Wrong answer derived from a real misconception about this step"
    ],
    "answer":"The full text of the Correct answer (must match Correct answer exactly, character-for-character)",
    "hint":"a helpful clue that guides thinking without directly giving away the answer"
  }
]

--- CRITICAL RULES ---
- Every question must be grounded in the step description and key points provided. 
- Do NOT repeat the exact questions from the mastery tests, key points, common mistakes lists — use them as inspiration but rephrase and create new ones that target the same concepts.
- Ensure hints are genuinely useful but not too obvious.


--- QUALITY RULES ---
- The number of questions you generate should be based on the note's length, density, difficulty and other relevant parameters.
- If a strong conceptual question cannot be written for this step, write a straight forward 'What is X?' or 'Define X.' or cause-effect question instead.
- Make questions varied in difficulty. 
- Wrong answer options must come from real misconceptions. Do not invent implausible and obvious wrong answers.


### Context:
Step Title: ${step.title}
Step Description: ${step.description}
Key Points: ${JSON.stringify(step.keyPoints)}
Common Mistakes (use as distractor source): ${JSON.stringify(step.commonMistakes)}
Mastery Tests (do not repeat, use as quality benchmark): ${JSON.stringify(step.masteryTests)}
Full Notes (for context and accuracy): ${notes}`
}

function buildFeedbackPrompt(wrongAnswers) {
  const items = wrongAnswers
    .map(
      (a, i) =>
        `Q${i + 1}: ${a.question}\nCorrect answer: ${a.answer}\nStudent answered: ${  // i should be original Question index instead.
          a.timedOut ? '(timed out — no answer)' : a.selected
        }`
    )
    .join('\n\n')

  return `For each of these questions, I either got it wrong or failed to answer it within the time limit. For each of these questions, explain forthrightly (1–3 sentences) why I was wrong and mention the correct answer, as provided below.
Return ONLY a raw JSON array — no markdown, no explanation:
[{"question":"exact question text","explanation":"your explanation"}]

Wrong answers:
${items}`
}

const TIME_OPTIONS = [15, 30, 45, 60]

export default function Quiz() {
  const navigate = useNavigate()
  const [notes] = useLocalStorage('knowtico-notes', '')
  const [questions, setQuestions] = useLocalStorage('knowtico-quiz', [])
  const [orgQuestions, setOrgQuestions] = useLocalStorage('knowtico-quiz-original', [])

  const [phase, setPhase] = useState('config') // phase: 'config' | 'loading' | 'quiz' | 'results'
  const [timerEnabled, setTimerEnabled] = useState(true)
  const [timePerQ, setTimePerQ] = useState(30)
  const [error, setError] = useState(null)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [selected, setSelected] = useState(null)  // null | option string | '__timeout__'
  const [hintShown, setHintShown] = useState(false)
  const [timeLeft, setTimeLeft] = useState(30)
  const [answers, setAnswers] = useState([])  // answers[i] = { question, answer, options, hint, selected, correct, hintUsed, timedOut } 

  const [feedback, setFeedback] = useState([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)

  const timerRef = useRef(null)
  const answeredRef = useRef(false)

  const [triggerTimer, setTriggerTimer] = useState('false') 
  const [lastNotes, setLastNotes] = useLocalStorage('knowtico-quiz-last-notes', '')
  const [notesChanged, setNotesChanged] = useState(false)

  const [lastNotesGuide] = useLocalStorage('knowtico-study-guide-last-notes', '')
  const [activeStepId] = useLocalStorage('knowtico-study-guide-active-step-id', null)
  const [guide] = useLocalStorage('knowtico-study-guide', null)
  const activeStep = guide?.steps?.find(s => s.id === activeStepId) ?? null
  const [lastQuizMetaData, setLastQuizMetaData] = useLocalStorage('knowtico-quiz-last-meta-data' ,{}) // type: 'full' || 'section' , stepTitle: activeStep.title
  const [quizMode, setQuizMode] = useState(lastQuizMetaData.type ?? '') // 'full' || 'section'
  const [needsRegen, setNeedsRegen] = useState(false)
  const location = useLocation()
  const [ , setQuizScores] = useLocalStorage('knowtico-quiz-scores', {}) // { [stepTitle]: score }
  
  // auto-generate quiz
  useEffect(() => {
    if (lastNotes === lastNotesGuide && activeStep?.title === lastQuizMetaData.stepTitle) return
    if (location.state?.autoGen) {
      navigate(location.pathname, {replace: true, state: {autoGen: false}})
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuizMode('section')
      generateQuiz('section')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!questions.length || !notes.trim()) return
    if (lastNotes !== notes && lastNotes !== lastNotesGuide ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotesChanged(true)
    } else setNotesChanged(false)
  }, [notes, questions, lastNotes, lastNotesGuide])
  
  useEffect(() => { //needs work
    if (phase !== 'quiz' || !timerEnabled) return

    //answeredRef.current = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimeLeft(timePerQ)

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [phase, currentIndex, timerEnabled, timePerQ, triggerTimer])

  useEffect(() => {
    if (timeLeft === 0 && phase === 'quiz' && !answeredRef.current) {
      const q = questions[currentIndex]
      if (!q) return
      answeredRef.current = true
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected('__timeout__')
      setAnswers((prev) => [
        ...prev,
        {
          question: q.question,
          answer: q.answer,
          options: q.options,
          hint: q.hint,
          selected: null,
          correct: false,
          hintUsed: hintShown,
          timedOut: true,
        },
      ])
    }
  }, [timeLeft, phase, currentIndex, hintShown, questions])


  async function generateQuiz(modeOfQuiz = quizMode) {
    if (!notes.trim()) {
      setError('No notes found. Add notes first.')
      return
    }
    // console.log(`modeOfQuiz: ${modeOfQuiz}, quizMode: ${quizMode}`)
    const prompt = modeOfQuiz === 'section' ? buildQuizPromptPerStep(lastNotesGuide, activeStep) : buildQuizPrompt(notes) 
    setPhase('loading')
    setError(null)
    try {
      const raw = await callGemini(prompt)
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      setQuestions(parsed)
      setNotesChanged(false)
      setLastNotes(modeOfQuiz === 'section' ? lastNotesGuide : notes)
      setLastQuizMetaData(modeOfQuiz === 'section' ? {type: 'section', stepTitle: activeStep?.title} : {type: 'full', stepTitle: ''} )
      // console.log(`set lastNotes to ${modeOfQuiz === 'section' ? 'lastNotesGuide' : 'notes'}, set lastQuizMetaData to ${modeOfQuiz === 'section' ? `{type: 'section', stepTitle: ${activeStep?.title}}` : `{type: 'full', stepTitle: ''}`}`)
      beginQuiz(false,'config')
    } catch (err) {
      setError('Failed to generate quiz. Check your API key or try again.')
      setPhase('config')
      console.error(err)
    }
  }

  function beginQuiz(isRetry = false, phase='quiz') {
    clearInterval(timerRef.current) //unnecessary?
    answeredRef.current = false
    setCurrentIndex(0)
    setSelected(null)
    setHintShown(false)
    setTimeLeft(timePerQ) //unnecessary?
    setAnswers([])
    setFeedback([]) 
    setFeedbackLoading(false)
    setPhase(phase)
    if (orgQuestions.length > 0 && !isRetry) {
      setQuestions(orgQuestions)
      setOrgQuestions([])
    }
    setQuestions(prev =>
      [...prev]
        .sort(() => Math.random() - 0.5)
        .map(q => ({ ...q, options: [...q.options].sort(() => Math.random() - 0.5) }))
    )
  }

  function handleSelect(opt) {
    if (selected !== null) return
    clearInterval(timerRef.current)
    answeredRef.current = true
    const q = questions[currentIndex]  
    const correct = opt === q.answer
    setSelected(opt)
    setAnswers((prev) => [
      ...prev,
      {
        question: q.question,
        answer: q.answer,
        options: q.options,
        hint: q.hint,
        selected: opt,
        correct,
        hintUsed: hintShown,
        timedOut: false,
      },
    ])
  }

  function next() {
    if (currentIndex + 1 >= questions.length) {
      endQuiz()
    } else {
      setTimeLeft(timePerQ) //necessary to avoid Automatic timedOut on Q-2, when Q-1 was timed out.
      answeredRef.current = false
      setCurrentIndex((i) => i + 1)
      setSelected(null)
      setHintShown(false)
    }
  }

  async function endQuiz() {
    setPhase('results')
    const wrongAs = answers.filter((a) => !a.correct)
    if (wrongAs.length === 0) return

    setFeedbackLoading(true)
    try {
      const raw = await callGemini(buildFeedbackPrompt(wrongAs))
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      setFeedback(parsed)
    } catch (err) {
      console.error('Feedback generation failed:', err)
    } finally {
      setFeedbackLoading(false)
    }
  }

  function retryWrong() {
    const wrongQs = questions.filter((q, i) => answers[i] && !answers[i].correct)
    if (!wrongQs.length) return
    if (orgQuestions.length === 0) setOrgQuestions(questions)
    setQuestions(wrongQs)
    beginQuiz(true)
  }


  if (phase === 'loading') {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-indigo-400">
          <Loader2 size={32} className="animate-spin" />
          <p className="text-sm">Generating quiz questions...</p>
        </div>
      </div>
    )
  }

  if (phase === 'config') {
    return (
      <ConfigScreen
        notes={notes}
        questions={questions}
        timerEnabled={timerEnabled}
        setTimerEnabled={setTimerEnabled}
        timePerQ={timePerQ}
        setTimePerQ={setTimePerQ}
        onGenerate={generateQuiz}
        onStart={() => beginQuiz()}
        error={error}
        navigate={navigate}
        notesChanged={notesChanged}
        setNotesChanged={setNotesChanged}
        quizMode={quizMode}
        setQuizMode={setQuizMode}
        activeStep={activeStep}
        needsRegen={needsRegen}
        setNeedsRegen={setNeedsRegen}
      />
    )
  }

  if (phase === 'results') {
    return (
      <ResultsScreen
        answers={answers}
        feedback={feedback}
        feedbackLoading={feedbackLoading}
        onRetryWrong={retryWrong}
        onRestart={() => beginQuiz()}
        onRegenerate={generateQuiz}
        timerRef={timerRef}
        orgQuestions={orgQuestions}
        setQuestions={setQuestions}
        setOrgQuestions={setOrgQuestions}
        setPhase={setPhase}
        lastQuizMetaData={lastQuizMetaData}
        setQuizScores={setQuizScores}
        lastNotes={lastNotes}
        lastNotesGuide={lastNotesGuide}
        quizMode={quizMode}
        error={error}
      />
    )
  }


  const q = questions[currentIndex]
  const hasAnswered = selected !== null 
  const progress = (currentIndex / questions.length) * 100
  const timerPercent = (timeLeft / timePerQ) * 100
  const timerColor =
    timeLeft <= 10
      ? 'bg-red-500'
      : timeLeft <= Math.ceil(timePerQ / 2)
      ? 'bg-yellow-400'
      : 'bg-green-500'

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => {
            clearInterval(timerRef.current)
            if (orgQuestions.length > 0) {
              setQuestions(orgQuestions)
              setOrgQuestions([])
            }
            setPhase('config')
          }}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        >
          <ChevronLeft size={16} />
        </button>
        <p className="text-sm text-gray-500">
          {currentIndex + 1} / {questions.length}
        </p>
        <button
          onClick={() => {
            beginQuiz(true)
            setTriggerTimer(!triggerTimer) //Timer doesnt reset on question-1 because currentIndex doesnt change at Q-1 and neither of the other dependencies in the timer useEffect change, so we force a re-trigger by toggling an unrelated state variable. 
          }}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Quiz progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1.5">
        <div
          className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Timer bar */}
      {timerEnabled && (
        <div className="w-full bg-gray-100 rounded-full h-1 mb-5">
          <div
            className={`${timerColor} h-1 rounded-full transition-all duration-1000`}
            style={{ width: `${timerPercent}%` }}
          />
        </div>
      )}

      {/* Question card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-4 shadow-sm">
        {timerEnabled && (
          <div
            className={`flex items-center gap-1.5 text-xs font-medium mb-3 transition-colors ${
              timeLeft <= 10 ? timeLeft===0 ? 'text-red-500' : 'text-red-500 animate-pulse' : 'text-gray-400' 
            }`}
          >
            <Clock size={12} />
            {timeLeft}s remaining
          </div>
        )}
        <p className="text-gray-800 font-medium text-base leading-relaxed">
          {q.question}
        </p>
      </div>

      {/* Answer options */}
      <div className="flex flex-col gap-2.5 mb-4">
        {q.options.map((opt) => {
          const isCorrect = opt === q.answer
          const isSelected = selected === opt

          let cls =
            'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-700 cursor-pointer active:scale-95'
          if (hasAnswered) {
            if (isCorrect)
              cls = 'bg-green-50 border-green-300 text-green-700 cursor-default'
            else if (isSelected)
              cls = 'bg-red-50 border-red-300 text-red-600 cursor-default'
            else
              cls = 'bg-gray-50 border-gray-200 text-gray-400 cursor-default'
          }

          return (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              disabled={hasAnswered}
              className={`text-left text-sm px-4 py-3 rounded-xl border transition-all ${cls}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span>{opt}</span>
                {hasAnswered && isCorrect && (
                  <CheckCircle size={16} className="text-green-500 shrink-0" />
                )}
                {hasAnswered && isSelected && !isCorrect && (
                  <XCircle size={16} className="text-red-400 shrink-0" />
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Hint button — only before answering */}
      {!hasAnswered && !hintShown && q.hint && (
        <button
          onClick={() => setHintShown(true)}
          disabled={hintShown}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
            hintShown
              ? 'bg-amber-50 border-amber-200 text-amber-600 cursor-default'
              : 'border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 cursor-pointer'
          }`}
        >
          <Lightbulb size={14} />
          {hintShown ? 'Hint shown' : 'Show hint'}
        </button>
      )}

      {/* Hint bubble */}
      {hintShown && q.hint && (
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
          <Lightbulb size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">{q.hint}</p>
        </div>
      )}

      {/* Post-answer feedback + Next button */}
      {hasAnswered && (
        <div className="mt-4 flex flex-col gap-3">
          {/* Feedback banner */}
          <div
            className={`rounded-xl px-4 py-3 border ${
              selected === '__timeout__'
                ? 'bg-orange-50 border-orange-200'
                : answers[currentIndex]?.correct
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}
          >
            <p
              className={`text-sm font-medium ${
                selected === '__timeout__'
                  ? 'text-orange-700'
                  : answers[currentIndex]?.correct
                  ? 'text-green-700'
                  : 'text-red-600'
              }`}
            >
              {selected === '__timeout__'
                ? `⏱ Time's up! The correct answer was: ${q.answer}` 
                : answers[currentIndex]?.correct
                ? '✓ Correct!'
                : `✗ The correct answer was: ${q.answer}`}
            </p>
          </div>

          {/* Next button */}
          <button
            onClick={next}
            className="flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors cursor-pointer"
          >
            {currentIndex + 1 >= questions.length ? 'See Results' : 'Next Question'}
            <ChevronRight size={16} />
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg fixed bottom-4 right-4 z-50">{error}</p>}
    </div>
  )
}

// ─── Config / landing screen ─────────────────────────────────────────────────

function ConfigScreen({
  questions,
  timerEnabled,
  setTimerEnabled,
  timePerQ,
  setTimePerQ,
  onGenerate,
  onStart,
  error,
  notesChanged,
  setNotesChanged,
  quizMode,
  setQuizMode,
  activeStep,
  needsRegen,
  setNeedsRegen
}) {
  return (
    <>
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
              onClick={() => onGenerate()}
              className="text-xs font-medium bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors cursor-pointer"
            >
              Regenerate
            </button>
          </div>
        </div>
      </div>
      <div className="p-6 max-w-2xl mx-auto">
        <BrainCircuit size={24} className="inline text-indigo-500 mb-1" />
        <h2 className="ml-2 inline text-xl font-bold text-gray-800 mb-0.5">Quiz</h2>
        <p className="ml-9 text-sm text-gray-400 mb-4">
          Test your knowledge
        </p>
        <div className="flex flex-col gap-2">
        {/* Quiz scope card */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Focus size={16} className="text-indigo-500" />
            <span className="text-sm font-medium text-gray-700">Quiz scope</span>
          </div>
          <div className="flex bg-gray-100 rounded-lg p-1 gap-2">
            <button
              onClick={() => {setQuizMode('full'); setNeedsRegen(false); setTimeout(() => setNeedsRegen(true), 20)}}
              disabled={quizMode==='full'}
              className={`flex-auto py-1.5 px-3 text-xs font-medium rounded-md transition-all duration-200 ${
                quizMode === 'full'
                  ? 'bg-white text-indigo-500 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 cursor-pointer hover:bg-gray-200/60'
              }`}
            >
              Full Note
            </button>
            <button
              onClick={() => {setQuizMode('section'); setNeedsRegen(false); setTimeout(() => setNeedsRegen(true), 20);}}
               disabled={quizMode==='section' || !activeStep}
              className={`flex-auto py-1.5 px-3 text-xs font-medium rounded-md transition-all duration-200 ${
                quizMode === 'section'
                  ? 'bg-white text-indigo-500 shadow-sm'
                  : !activeStep ? 'text-gray-500': 'text-gray-500 hover:text-gray-700 cursor-pointer hover:bg-gray-200/60'
              }`}
            >
              {activeStep?.title}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2.5 leading-relaxed">
            {quizMode === 'section'
              ? `New questions will focus on "${activeStep?.title}" section Only.`
              : 'New questions will be drawn from the entire note.'}
          </p>
        </div>
          {/* Timer settings card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Timer size={17} className="text-indigo-500" />
                <span className="text-sm font-medium text-gray-700">Timer</span>
              </div>
              {/* Toggle */}
              <button
                onClick={() => setTimerEnabled(!timerEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                  timerEnabled ? 'bg-indigo-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    timerEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {timerEnabled ? (
              <>
                <p className="text-xs text-gray-400 mb-3">Seconds per question</p>
                <div className="flex gap-2">
                  {TIME_OPTIONS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTimePerQ(t)}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-all ${
                        timePerQ === t
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-gray-200 text-gray-600 hover:border-indigo-300 cursor-pointer'
                      }`}
                    >
                      {t}s
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-400">
                Timer is off — answer at your own pace.
              </p>
            )}
          </div>

          {/* Action buttons */} 
          <div className="flex gap-3">
            {questions.length > 0 && (
              <button
                onClick={onStart}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white text-sm font-medium rounded-xl cursor-pointer hover:bg-indigo-700 transition-colors"
              >
                <BrainCircuit size={14} /> Start Quiz ({questions.length} Qs)
              </button>
            )}
            <button
              onClick={() => {onGenerate(); setNeedsRegen(false)}}
              className={`flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium rounded-xl border transition-colors cursor-pointer ${
                questions.length > 0
                  ? 'border-gray-200 text-gray-600 hover:border-indigo-300'
                  : 'flex-1 bg-indigo-600 text-white hover:bg-indigo-700 border-transparent'
              }
              ${needsRegen?'animate-[pulse-sonar_1.5s_ease-out_3]':''}
              `}
            >
              <RefreshCw size={14} />
              {questions.length > 0 ? 'Regenerate' : 'Generate Quiz'}
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg fixed bottom-4 right-4 z-50">{error}</p>}
      </div>
    </>
  )
}

// ─── Results screen ───────────────────────────────────────────────────────────

function ResultsScreen({
  answers,
  feedback,
  feedbackLoading,
  onRetryWrong,
  onRestart,
  onRegenerate,
  timerRef,
  orgQuestions,
  setQuestions,
  setOrgQuestions,
  setPhase,
  lastQuizMetaData,
  setQuizScores,
  lastNotes,
  lastNotesGuide,
  error,
}) {
  const correct = answers.filter((a) => a.correct).length
  const wrong = answers.length - correct
  const hintsUsed = answers.filter((a) => a.hintUsed).length
  const timedOut = answers.filter((a) => a.timedOut).length
  const score = Math.round((correct / answers.length) * 100)

  useEffect(() => {
    if ( lastNotes === lastNotesGuide && lastQuizMetaData.stepTitle) {
      setQuizScores(s => ({...s, [lastQuizMetaData.stepTitle]: score}))
      // console.log(`Set quiz score for step ${lastQuizMetaData.stepTitle} to ${score}`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [] )

  const emoji = score >= 80 ? '🏆' : score >= 60 ? '🎯' : '📚'

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Score card */}
      <div className="bg-white border border-gray-200 rounded-2xl text-center mb-5">
        <button
          onClick={() => {
            clearInterval(timerRef.current)
            if (orgQuestions.length > 0) {
              setQuestions(orgQuestions)
              setOrgQuestions([])
            }
            setPhase('config')
          }}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors px-3 py-4 cursor-pointer"
        >
          <ChevronLeft size={16} />
        </button>
        <div className='p-8'>
          <p className="text-5xl mb-3">{emoji}</p>
          <h2 className="text-xl font-bold text-gray-800 mb-1">Quiz Complete!</h2>
          <p className="text-gray-400 text-sm mb-6">Here's how you did</p>

          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-2xl font-bold text-green-600">{correct}</p>
              <p className="text-xs text-green-500 mt-0.5">Correct</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3">
              <p className="text-2xl font-bold text-red-500">{wrong}</p>
              <p className="text-xs text-red-400 mt-0.5">Wrong</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3">
              <p className="text-2xl font-bold text-amber-500">{hintsUsed}</p>
              <p className="text-xs text-amber-500 mt-0.5">Hints used</p>
            </div>
          </div>

          {timedOut > 0 && (
            <p className="text-xs text-orange-500 mb-3">
              ⏱ {timedOut} question{timedOut > 1 ? 's' : ''} timed out
            </p>
          )}

          <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all"
              style={{ width: `${score}%` }}
            />
          </div>
          <p className="text-xs text-gray-400">{score}% score</p>
        </div>  
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2 mb-6">
        {wrong > 0 && (
          <button
            onClick={onRetryWrong}
            className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
          >
            Retry Wrong Answers ({wrong})
          </button>
        )}
        <button
          onClick={onRestart}
          className="w-full py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
        >
          Restart Quiz
        </button>
        <button
          onClick={() => onRegenerate()}
          className="w-full py-2.5 border border-gray-200 text-gray-500 text-sm rounded-lg hover:border-indigo-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <RefreshCw size={14} /> New Questions
        </button>
      </div>

      {/* Per-question breakdown */}
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Question Review</h3>
      <div className="flex flex-col gap-3 pb-6">
        {answers.map((a) => {
          const fb = feedback.find((f) => f.question === a.question)

          return (
            <div
              key={a.question+a.answer}
              className={`bg-white border rounded-xl p-4 ${
                a.correct ? 'border-green-200' : 'border-red-200'
              }`}
            >
              {/* Question row */}
              <div className="flex items-start gap-2 mb-1">
                {a.correct ? (
                  <CheckCircle
                    size={15}
                    className="text-green-500 mt-0.5 shrink-0"
                  />
                ) : (
                  <XCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
                )}
                <p className="text-sm font-medium text-gray-800">{a.question}</p>
              </div>

              {/* Wrong answer detail */}
              {!a.correct && (
                <div className="pl-5 mt-2 flex flex-col gap-1">
                  {a.timedOut ? (
                    <p className="text-xs text-orange-500">⏱ Timed out</p>
                  ) : (
                    <p className="text-xs text-red-500">
                      Your answer: {a.selected}
                    </p>
                  )}
                  <p className="text-xs text-green-600 font-medium">
                    Correct: {a.answer}
                  </p>

                  {/* AI explanation needs work: what if no feedback + not loading?*/}
                  {feedbackLoading && !fb && (
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <Loader2 size={10} className="animate-spin" /> 
                      Getting explanation...
                    </p>
                  )}
                  {fb && (
                    <p className="text-xs text-gray-600 mt-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 leading-relaxed">
                      💡 {fb.explanation}
                    </p>
                  )}
                </div>
              )}

              {/* Hint badge */}
              {a.hintUsed && (
                <div className="pl-5 mt-1.5">
                  <span className="inline-flex items-center gap-1 text-xs text-amber-500">
                    <Lightbulb size={10} /> Hint used
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg fixed bottom-4 right-4 z-50">{error}</p>}
    </div>
  )
}