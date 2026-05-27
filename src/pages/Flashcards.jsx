// realoading makes you lose results or progress during reviewing.
// need conceptual questions and other short questions besides just simple memory questions
import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { callGemini } from '../lib/gemini'
import { Loader2, ChevronLeft, ChevronRight, RotateCcw, CheckCircle, XCircle, RefreshCw, AlertTriangle, Focus, GalleryHorizontalEnd } from 'lucide-react'

function buildFlashcardsPrompt(notes) {
  return `You are an expert educator building flashcards for active recall practice. Create flashcards from these study notes. Return ONLY a raw JSON array, no markdown, no explanation:
[
  {
    "front": "A conceptual question from the notes. You can use one of these frames: 'Why does X happen?', 'How does X differ from Y?', 'What breaks down if you assume X?', 'A learner does X — what have they misunderstood?'.", 
    "back": "A clear explanation that would satisfy a curious learner. Explain the reasoning or mechanism, not just the answer. If the question involves a contrast, address both sides. Should be brief and to the point, but complete enough to be satisfying on its own."
  }
]

--- RULES ---
- The number of cards you generate should be based on the note's length, density, difficulty and other relevant parameters.
- If a strong conceptual question cannot be written, write a straight forward 'What is X?' or 'Define X.' or cause-effect question instead.
- Make cards varied in difficulty.

Notes:
${notes}`
}

function buildFlashcardsPromptPerStep(notes, step) {
  return `You are an expert educator building flashcards for active recall practice. A learner is currently studying one specific step from their study material. Every flashcard must target understanding of THIS step only.

Flashcards here are not memory tests. They are short conceptual questions that force the learner to reconstruct understanding, not retrieve a label. A card is only good if getting it wrong tells the learner something specific about what they misunderstood.

Return ONLY a raw JSON object — no markdown, no explanation, no code fences.

[
  {
    "front": "A conceptual question targeting a specific idea from this step. You can use one of these frames: 'Why does X happen?', 'How does X differ from Y?', 'What breaks down if you assume X?', 'A learner does X — what have they misunderstood?'.", 
    "back": "A clear explanation that would satisfy a curious learner. Explain the reasoning or mechanism, not just the answer. If the question involves a contrast, address both sides. Should be brief and to the point, but complete enough to be satisfying on its own."
  }
]

--- CRITICAL RULES ---
- Every card must be grounded in the step description and key points provided.
- Card backs must explain reasoning, not just state the answer.
- Do NOT repeat the exact questions from the mastery tests, key points, common mistakes list — use them as inspiration but rephrase and create new ones that target the same concepts.

--- QUALITY RULES ---
- The number of cards you generate should be based on the note's length, density, difficulty and other relevant parameters.
- If a strong conceptual question cannot be written for this step, write a straight forward 'What is X?' or 'Define X.' or cause-effect question instead.
- Make cards varied in difficulty.

### Context:
Step Title: ${step.title}
Step Description: ${step.description}
Key Points: ${JSON.stringify(step.keyPoints)}
Common Mistakes (use as distractor source): ${JSON.stringify(step.commonMistakes)}
Mastery Tests (do not repeat, use as quality benchmark): ${JSON.stringify(step.masteryTests)}
Full Notes (for context and accuracy): ${notes}`
}

export default function Flashcards() {
  const navigate = useNavigate()

  const [notes] = useLocalStorage('knowtico-notes', '')
  const [cards, setCards] = useLocalStorage('knowtico-flashcards', [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Review mode state
  const [reviewing, setReviewing] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [known, setKnown] = useState([])
  const [unknown, setUnknown] = useState([])
  const [finished, setFinished] = useState(false)
  const [orgCards, setOrgCards] = useLocalStorage('knowtico-flashcards-original', []) 
  const missedRetryRef = useRef(false)

  const [lastNotes, setLastNotes] = useLocalStorage('knowtico-flashcards-last-notes', '')
  const [notesChanged, setNotesChanged] = useState(false)

  const [lastNotesGuide] = useLocalStorage('knowtico-study-guide-last-notes', '')
  const [activeStepId] = useLocalStorage('knowtico-study-guide-active-step-id', null)
  const [guide] = useLocalStorage('knowtico-study-guide', null)
  const activeStep = guide?.steps?.find(s => s.id === activeStepId) ?? null
  const [lastCardsMetaData, setLastCardsMetaData] = useLocalStorage('knowtico-flashcards-last-meta-data' ,{}) // type: 'full' || 'section' , stepTitle: activeStep.title
  const [cardsMode, setCardsMode] = useState(lastCardsMetaData.type ?? '') // 'full' || 'section'
  const [needsRegen, setNeedsRegen] = useState(false)
  const location = useLocation()
  const [ , setCardsScores] = useLocalStorage('knowtico-flashcards-scores', {}) // { [stepTitle]: score }

  // set cardsScores
  useEffect(() => {
    if (finished && cards.length > 0) {
      const score = Math.round((known.length / cards.length) * 100);
      
      setCardsScores(s => ({
        ...s, 
        [lastCardsMetaData?.stepTitle]: score
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);
  
  // auto-generate flashcards
  useEffect(() => {
    if (lastNotes === lastNotesGuide && activeStep?.title === lastCardsMetaData.stepTitle) return
    if (location.state?.autoGen) {
      navigate(location.pathname, {replace: true, state: {autoGen: false}})
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCardsMode('section')
      generateCards('section')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!cards.length || !notes.trim()) return
    if (lastNotes !== notes && lastNotes !== lastNotesGuide ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotesChanged(true)
    } else setNotesChanged(false)
  }, [notes, cards, lastNotes, lastNotesGuide])
  

  async function generateCards(modeOfCards = cardsMode) {
    if (!notes.trim()) {
      setError('No notes found. Add notes first.')
      return
    }
    // console.log(`modeOfCards: ${modeOfCards}, cardsMode: ${cardsMode}`)
    const prompt = modeOfCards === 'section' ? buildFlashcardsPromptPerStep(lastNotesGuide, activeStep) : buildFlashcardsPrompt(notes)
    setLoading(true)
    setError(null)
    try {
      const raw = await callGemini(prompt)
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      setCards(parsed)
      setNotesChanged(false)
      setLastNotes(modeOfCards === 'section' ? lastNotesGuide : notes)
      setLastCardsMetaData(modeOfCards === 'section' ? {type: 'section', stepTitle: activeStep?.title} : {type: 'full', stepTitle: ''} )
      // console.log(`set lastNotes to ${modeOfCards === 'section' ? 'lastNotesGuide' : 'notes'}, set lastCardsMetaData to ${modeOfCards === 'section' ? `{type: 'section', stepTitle: ${activeStep?.title}}` : `{type: 'full', stepTitle: ''}`}`)
      resetReview()
    } catch (err) {
      setError('Failed to generate flashcards. Try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function startReview() {
    resetReview()
    setReviewing(true)
  }

  function resetReview() {
    if (orgCards.length > 0 && !missedRetryRef.current) { //multiple levels of complexity here.
      setCards(orgCards)
      setOrgCards([])
    }
    missedRetryRef.current = false
    setCurrentIndex(0)
    setFlipped(false)
    setKnown([])
    setUnknown([])
    setFinished(false)
    setReviewing(false)
  }

  function handleKnow() {
    setKnown(prev => [...prev, cards[currentIndex].front+cards[currentIndex].back])
    advance()
  }

  function handleDontKnow() {
    setUnknown(prev => [...prev, cards[currentIndex].front+cards[currentIndex].back])
    advance()
  }

  function advance() {
    setFlipped(false)
    if (currentIndex + 1 >= cards.length) {
      setFinished(true)
    } else {
      setCurrentIndex(prev => prev + 1)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-indigo-400">
          <Loader2 size={32} className="animate-spin" />
          <p className="text-sm">Generating flashcards...</p>
        </div>
      </div>
    )
  }

  if (!cards.length) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <GalleryHorizontalEnd size={24} className="inline text-indigo-500 mb-1" />
        <h2 className="ml-2 inline text-xl font-bold text-gray-800 mb-1">Flashcards</h2>
        <p className="ml-9 text-sm text-gray-400">AI-generated cards from your notes</p>

        {!notes.trim() ? (
          <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl bg-white mt-8">
            <GalleryHorizontalEnd size={32} className="text-indigo-200 mx-auto mb-3" />
            <p className="text-gray-500 text-sm font-medium">No notes found</p>
            <p className="text-gray-400 text-xs mt-1">Go to Notes and add your study material first</p>
            <button
              onClick={() => navigate('/notes')}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer mt-3"
            >
              Add Notes
            </button>
          </div>
        ) : (
          <div>
            {/* Scope selector — compact inline pill */}
            <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg p-1 mt-1">
              <Focus size={13} className="text-indigo-400 ml-1.5 shrink-0" />
              <button
                onClick={() => {setCardsMode('full'); setNeedsRegen(false); setTimeout(() => setNeedsRegen(true), 20)}}
                disabled={cardsMode === 'full'}
                className={`py-1.5 px-3 text-xs font-medium rounded-md transition-all duration-200 ${
                  cardsMode === 'full'
                    ? 'bg-white text-indigo-500 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 cursor-pointer hover:bg-gray-200/60'
                }`}
              >
                Full Note
              </button>
              <button
                onClick={() => {setCardsMode('section'); setNeedsRegen(false); setTimeout(() => setNeedsRegen(true), 20);}}
                disabled={cardsMode === 'section' || !activeStep}
                className={`py-1.5 px-3 text-xs font-medium rounded-md transition-all duration-200 ${
                  cardsMode === 'section'
                    ? 'bg-white text-indigo-500 shadow-sm'
                    : !activeStep ? 'text-gray-500' : 'text-gray-500 hover:text-gray-700 cursor-pointer hover:bg-gray-200/60'
                }`}
              >
                {activeStep?.title}
              </button>
            </div>
            <div className='flex items-center gap-2 mb-7'>
              <p className="text-xs text-gray-400 ml-2 leading-relaxed">
                {cardsMode === 'section'
                  ? `New cards will focus on "${activeStep?.title}" section Only.`
                  : 'New cards will be drawn from the entire note.'}
              </p>
            </div>
            <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl bg-white">
              <GalleryHorizontalEnd size={32} className="text-indigo-200 mx-auto mb-3" />
              <p className="text-gray-500 text-sm font-medium mb-4">No flashcards yet</p>
              <button
                onClick={() => generateCards()}
                className={`px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer ${needsRegen?'animate-[pulse-sonar_1.5s_ease-out_3]':''}`}
              >
                Generate Flashcards
              </button>
            </div>
          </div>
        )}
        {error && <p className="text-red-500 text-sm mt-4 text-center">{error}</p>}
      </div>
    )
  }

  if (!reviewing) {
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
                onClick={() => generateCards()}
                className="text-xs font-medium bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors cursor-pointer"
              >
                Regenerate
              </button>
            </div>
          </div>
        </div>
        <div className="p-6 max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-1">
            <div>
              <GalleryHorizontalEnd size={24} className="inline text-indigo-500 mb-1" />
              <h2 className="ml-2 inline text-xl font-bold text-gray-800">Flashcards</h2>
              <p className="ml-9 text-sm text-gray-400">{cards.length} cards generated</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => generateCards()}
                className={`flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:border-indigo-300 transition-colors cursor-pointer ${needsRegen?'animate-[pulse-sonar_1.5s_ease-out_3]':''}`}
              >
                <RefreshCw size={14} /> Regenerate
              </button>
              <button
                onClick={startReview}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                <GalleryHorizontalEnd size={14} /> Start Review
              </button>
            </div>
          </div>
          {/* Scope selector — compact inline pill */}
          <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg p-1">
            <Focus size={13} className="text-indigo-400 ml-1.5 shrink-0" />
            <button
              onClick={() => {setCardsMode('full'); setNeedsRegen(false); setTimeout(() => setNeedsRegen(true), 20)}}
              disabled={cardsMode === 'full'}
              className={`py-1.5 px-3 text-xs font-medium rounded-md transition-all duration-200 ${
                cardsMode === 'full'
                  ? 'bg-white text-indigo-500 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 cursor-pointer hover:bg-gray-200/60'
              }`}
            >
              Full Note
            </button>
            <button
              onClick={() => {setCardsMode('section'); setNeedsRegen(false); setTimeout(() => setNeedsRegen(true), 20);}}
              disabled={cardsMode === 'section' || !activeStep}
              className={`py-1.5 px-3 text-xs font-medium rounded-md transition-all duration-200 ${
                cardsMode === 'section'
                  ? 'bg-white text-indigo-500 shadow-sm'
                  : !activeStep ? 'text-gray-500' : 'text-gray-500 hover:text-gray-700 cursor-pointer hover:bg-gray-200/60'
              }`}
            >
              {activeStep?.title}
            </button>
          </div>
          <div className='flex items-center gap-2 mb-7'>
            <p className="text-xs text-gray-400 ml-2 leading-relaxed">
              {cardsMode === 'section'
                ? `New cards will focus on "${activeStep?.title}" section Only.`
                : 'New cards will be drawn from the entire note.'}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {cards.map((card, i) => (
              <PreviewCard key={card.front + card.back} card={card} index={i} />
            ))}
          </div>

          {error && <p className="text-red-500 text-sm mt-4 text-center fixed bottom-4 right-4 z-50">{error}</p>}
        </div>
      </>
    )
  }

  if (finished) {
    const score = Math.round((known.length / cards.length) * 100)
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <div className="bg-white border border-gray-200 rounded-2xl mt-12">
          <button
            onClick={resetReview}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors px-3 py-4 cursor-pointer"
          >
            <ChevronLeft size={16} /> 
          </button>
          <div className='p-8'>
            <p className="text-4xl mb-4">{score >= 70 ? '🎉' : '📚'}</p>
            <h2 className="text-xl font-bold text-gray-800 mb-1">Session Complete!</h2>
            <p className="text-gray-400 text-sm mb-6">Here's how you did</p>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-green-50 rounded-xl p-4">
                <p className="text-2xl font-bold text-green-600">{known.length}</p>
                <p className="text-xs text-green-500 mt-1">Knew it</p>
              </div>
              <div className="bg-red-50 rounded-xl p-4">
                <p className="text-2xl font-bold text-red-500">{unknown.length}</p>
                <p className="text-xs text-red-400 mt-1">Need review</p>
              </div>
            </div>

            <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
              <div
                className="bg-indigo-500 h-2 rounded-full transition-all"
                style={{ width: `${score}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mb-8">{score}% mastery</p>

            <div className="flex flex-col gap-2">
              {unknown.length > 0 && (
                <button
                  onClick={() => {
                    const missed = cards.filter((card) => unknown.includes(card.front + card.back))
                    if (orgCards.length === 0) {
                      setOrgCards(cards)
                    }
                    missedRetryRef.current = true
                    setCards(missed)
                    startReview()
                  }}
                  className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
                >
                  Retry Missed Cards ({unknown.length})
                </button>
              )}
              <button
                onClick={startReview}
                className="w-full py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
              >
                Restart All Cards
              </button>
              <button
                onClick={() => generateCards()}
                className="w-full py-2.5 border border-gray-200 text-gray-500 text-sm rounded-lg hover:border-indigo-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw size={14} /> Regenerate Cards
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const card = cards[currentIndex]
  const progress = ((currentIndex) / cards.length) * 100

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={resetReview}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        >
          <ChevronLeft size={16} /> 
        </button>
        <p className="text-sm text-gray-500">
          {currentIndex + 1} / {cards.length}
        </p>
        <button
          onClick={startReview}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-8">
        <div
          className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Card */}
      <div
        onClick={() => setFlipped(!flipped)}
        className="cursor-pointer bg-white border-2 border-gray-200 rounded-2xl p-8 min-h-52 flex flex-col items-center justify-center text-center hover:border-indigo-300 transition-all mb-6 shadow-sm"
      >
        <p className="text-xs font-medium text-indigo-400 mb-4 uppercase tracking-wide">
          {flipped ? 'Answer' : 'Question'}
        </p>
        <p className="text-gray-800 font-medium text-lg leading-relaxed">
          {flipped ? card.back : card.front}
        </p>
        <p className="text-xs text-gray-300 mt-6"> {flipped? 'Click to see question' : 'Click to reveal answer'}</p>
      </div>

      {/* Action buttons — only show after flipping */}
      {flipped ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleDontKnow}
            className="flex items-center justify-center gap-2 py-3 bg-red-50 text-red-500 font-medium rounded-xl hover:bg-red-100 transition-colors border border-red-100 cursor-pointer"
          >
            <XCircle size={18} /> Still Learning
          </button>
          <button
            onClick={handleKnow}
            className="flex items-center justify-center gap-2 py-3 bg-green-50 text-green-600 font-medium rounded-xl hover:bg-green-100 transition-colors border border-green-100 cursor-pointer"
          >
            <CheckCircle size={18} /> Got It
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { if (currentIndex > 0) {setCurrentIndex(i => i - 1); setFlipped(false)} } }
            disabled={currentIndex === 0}
            className="flex items-center justify-center gap-2 py-3 bg-gray-100 text-gray-500 font-medium rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-default"
          >
            <ChevronLeft size={18} /> Previous
          </button>
          <button
            onClick={() => setFlipped(true)}
            className="flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors cursor-pointer"
          >
            Flip Card <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  )
}

function PreviewCard({ card, index }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      onClick={() => setOpen(!open)}
      className={`group cursor-pointer rounded-xl border border-gray-200 p-4 hover:border-indigo-300 hover:shadow-sm transition-all active:scale-95 ${open ? 'bg-indigo-50' : 'bg-white'}`}
    >
      <p className="text-xs font-medium text-indigo-400 mb-1">Card {index + 1} — {open ? 'Answer' : 'Question'}</p>
      <p className={`text-sm ${open ? 'text-indigo-800' : 'text-gray-700'}`}>{open ? card.back : card.front}</p>
      <div className='mt-6 flex items-center gap-2'>
        <div className='h-1 w-1 rounded-full bg-gray-400 group-hover:bg-indigo-400' />
        <p className="text-xs text-gray-300 text-gray-400 group-hover:text-indigo-400">{open ? 'Click to see question' : 'Click to reveal answer'}</p>
      </div>
    </div>
  )
}