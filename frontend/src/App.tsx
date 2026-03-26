// Pallas Frontend — Router-Konfiguration
// Routen:
// - "/" → Dashboard
// - "/modules/:id" → Modul-Detailseite
// - "/mindmap/:summaryId" → Fullscreen Study-Mindmap
// - "/journal" → Verschlüsseltes Tagebuch
// - "/journal/mindmap" → Fullscreen Journal-Mindmap

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ModuleDetail from './pages/ModuleDetail'
import MindmapPage from './pages/MindmapPage'
import JournalMindmapPage from './pages/JournalMindmapPage'
import Journal from './pages/Journal'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="modules/:id" element={<ModuleDetail />} />
          <Route path="journal" element={<Journal />} />
        </Route>
        {/* Mindmaps ausserhalb von Layout — Fullscreen ohne Sidebar */}
        <Route path="mindmap/:summaryId" element={<MindmapPage />} />
        <Route path="journal/mindmap" element={<JournalMindmapPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App