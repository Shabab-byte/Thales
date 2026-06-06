// chatbox
// write or speak your understanding and let ai fix your misunderstanding (feynmann technique)
// endless quiz mode
// MindMap+Timeline+FLOWCHART
// Data Visualization
// back to study-guide button for all pages
// integration with calender + spaced repition reminder
// socratic method + feynmann technique
import Sidebar from './components/layout/Sidebar'
import Dashboard from './pages/Dashboard'
import Flashcards from './pages/Flashcards'
import MindMap from './pages/MindMap'
import Notes from './pages/Notes'
import Quiz from './pages/Quiz'
import StudyGuide from './pages/StudyGuide'
import Context from './pages/Context'
import Analysis from './pages/Analysis'
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
            <Route path='/context' element={<Context/>} />
            <Route path="/analysis" element={<Analysis />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

