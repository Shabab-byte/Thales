import { useLocalStorage } from '../hooks/useLocalStorage'
import { useNavigate } from 'react-router-dom'
import { FileText, CreditCard, BrainCircuit, BookOpen, Sparkles, ArrowRight } from 'lucide-react'

const quickActions = [
  {
    icon: FileText,
    label: 'My Notes',
    description: 'Write or paste study material',
    to: '/notes',
    color: 'text-blue-500',
    bg: 'bg-blue-50',
  },
  {
    icon: CreditCard,
    label: 'Flashcards',
    description: 'Review with AI-generated cards',
    to: '/flashcards',
    color: 'text-purple-500',
    bg: 'bg-purple-50',
  },
  {
    icon: BrainCircuit,
    label: 'Quiz',
    description: 'Test your knowledge',
    to: '/quiz',
    color: 'text-green-500',
    bg: 'bg-green-50',
  },
  {
    icon: BookOpen,
    label: 'Study Guide',
    description: 'Structured learning breakdown',
    to: '/study-guide',
    color: 'text-orange-500',
    bg: 'bg-orange-50',
  },
]

export default function Dashboard() {
  const [notes] = useLocalStorage('knowtico-notes', '')
  const [result] = useLocalStorage('knowtico-last-result', null)
  const navigate = useNavigate()

  const wordCount = notes.trim() ? notes.trim().split(/\s+/).length : 0
  const charCount = notes.length

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back 👋</h1>
        <p className="text-gray-500 text-sm mt-1">What are you studying today?</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Words in Notes" value={wordCount} />
        <StatCard label="Characters" value={charCount} />
        <StatCard label="Last Output" value={result ? result.type : '—'} capitalize />
      </div>

      {/* Quick actions */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Quick Actions
      </h2>
      <div className="grid grid-cols-2 gap-4 mb-8">
        {quickActions.map(({ icon: Icon, label, description, to, color, bg }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
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

      {/* Notes preview */}
      {notes.trim() && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Current Notes Preview
          </h2>
          <div
            onClick={() => navigate('/notes')}
            className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-indigo-300 transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-indigo-400" />
              <span className="text-xs text-indigo-400 font-medium">Click to edit</span>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed line-clamp-4">
              {notes}
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!notes.trim() && (
        <div className="text-center py-12 bg-white border border-dashed border-gray-200 rounded-xl">
          <Sparkles size={32} className="text-indigo-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium">No notes yet</p>
          <p className="text-gray-400 text-xs mt-1 mb-4">Start by adding your study material</p>
          <button
            onClick={() => navigate('/notes')}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
          >
            Add Notes
          </button>
        </div>
      )}

    </div>
  )
}

function StatCard({ label, value, capitalize }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-xl font-bold text-gray-800 ${capitalize ? 'capitalize' : ''}`}>
        {value}
      </p>
    </div>
  )
}