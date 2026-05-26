import { NavLink } from 'react-router-dom'
import { LayoutDashboard, FileText, CreditCard, BrainCircuit, BookOpen, GitFork } from 'lucide-react'

const navlink_data = [
  {to:'/', icon: LayoutDashboard, label:'Dashboard'},
  {to:'/notes', icon: FileText, label:'Notes'},
  {to:'/study-guide', icon:BookOpen, label:'StudyGuide'},
  {to:'/flashcards', icon:CreditCard, label:'Flashcards'},
  {to:'/quiz', icon:BrainCircuit, label:'Quiz'},
  {to:'/mindmap', icon:GitFork, label:'MindMap'},
]

export default function Sidebar(){
  return (
    <aside className="w-60 h-screen bg-white border-r border-gray-200 flex flex-col justify-between">
      <div className="px-6 py-5 border-b border-gray-100">
        <h1 className="text-xl font-bold text-indigo-600 tracking-tight"> Thales </h1>
        <p className="text-xs text-gray-400 mt-0.5">Your AI study partner</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        { //eslint-disable-next-line no-unused-vars
          navlink_data.map(({ to, icon:Icon, label}) => 
            <NavLink key={to} to={to} end={to==='/'} 
              className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors 
              ${isActive?'bg-indigo-50 text-indigo-600':'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`} > 
              <Icon size={18}/>
              {label}
            </NavLink>
          )
        }
      </nav>
      <div className="px-4 py-4 border-t border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-bold"> niga </div>
        <div>
            <p className="text-sm font-medium text-gray-700">Student</p>
            <p className="text-xs text-gray-400">Free plan</p>
        </div>
      </div>
    </aside>
  )
}

