// Pallas Frontend — Router-Konfiguration
// ThemeProvider + LanguageProvider wrappen alles
// Routen:
// - "/" → Begrüssungsseite
// - "/dashboard" → Dashboard (Module + Ordner)
// - "/modules/:id" → Modul-Detailseite
// - "/calendar" → Hauptkalender
// - "/mindmap/:summaryId" → Fullscreen Study-Mindmap
// - "/journal" → Verschlüsseltes Tagebuch
// - "/journal/mindmap" → Fullscreen Journal-Mindmap

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LanguageProvider } from './hooks/useLanguage'
import { ThemeProvider } from './hooks/useTheme'
import Layout from './components/Layout'
import WelcomePage from './pages/WelcomePage'
import Dashboard from './pages/Dashboard'
import ModuleDetail from './pages/ModuleDetail'
import CalendarPage from './pages/CalendarPage'
import MindmapPage from './pages/MindmapPage'
import JournalMindmapPage from './pages/JournalMindmapPage'
import Journal from './pages/Journal'

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<WelcomePage />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="modules/:id" element={<ModuleDetail />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="journal" element={<Journal />} />
            </Route>
            {/* Mindmaps ausserhalb von Layout — Fullscreen ohne Sidebar */}
            <Route path="mindmap/:summaryId" element={<MindmapPage />} />
            <Route path="journal/mindmap" element={<JournalMindmapPage />} />
          </Routes>
        </BrowserRouter>
      </LanguageProvider>
    </ThemeProvider>
  )
}

export default App