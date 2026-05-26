// chatbox
// write or speak your understanding and let ai fix your misunderstanding
// endless quiz mode
// Robust before you start + Terminology + Context section
// MindMap+Timeline+FLOWCHART
// Diagram+labelling+figure system
// Comparison + Cause-Effect+Quick-Glance Table
import Sidebar from './components/layout/Sidebar'
import Dashboard from './pages/Dashboard'
import Flashcards from './pages/Flashcards'
import MindMap from './pages/MindMap'
import Notes from './pages/Notes'
import Quiz from './pages/Quiz'
import StudyGuide from './pages/StudyGuide'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

export default function App() {
  return (
    <BrowserRouter>
      <div className='flex h-screen bg-gray-50 overflow-auto'>
        <Sidebar/>
        <main className="flex-auto overflow-y-auto">
          <Routes>
            <Route path='/' element={<Dashboard/>} />
            <Route path='/flashcards' element={<Flashcards/>} />
            <Route path='/mindmap' element={<MindMap/>} />
            <Route path='/notes' element={<Notes/>} />
            <Route path='/quiz' element={<Quiz/>} />
            <Route path='/study-guide' element={<StudyGuide/>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

