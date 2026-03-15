// Pallas Frontend — Router-Konfiguration
// Dies ist der Einstiegspunkt der React-App
// Hier werden alle Routen (URLs) definiert:
// - "/" → Dashboard (Startseite)
// - "/modules/:id" → Modul-Detailseite (Dokumente + Zusammenfassungen)
// - "/mindmap/:summaryId" → Fullscreen Mindmap
// - "/journal" → Verschlüsseltes Tagebuch
//
// BrowserRouter aktiviert Client-Side Routing:
// Statt die ganze Seite neu zu laden, wechselt nur der Content-Bereich
//
// Layout ist der Wrapper mit Sidebar — alle Seiten werden darin gerendert

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ModuleDetail from './pages/ModuleDetail'
import MindmapPage from './pages/MindmapPage'
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

        {/* Mindmap ausserhalb von Layout — Fullscreen ohne Sidebar */}
        <Route path="mindmap/:summaryId" element={<MindmapPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App