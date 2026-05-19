// Pallas Frontend — Router-Konfiguration
// ThemeProvider + LanguageProvider wrappen alles
// Routen:
// - "/login" → Login-Seite (nur für Olymp-Server)
// - "/" → Begrüssungsseite
// - "/archiv" → Archiv (Module + Ordner)
// - "/modules/:id" → Modul-Detailseite
// - "/calendar" → Hauptkalender
// - "/mindmap/:summaryId" → Fullscreen Study-Mindmap
// - "/journal" → Verschlüsseltes Tagebuch (inkl. Metis-Tab)
// - "/journal/mindmap" → Fullscreen Journal-Mindmap

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LanguageProvider } from './hooks/useLanguage'
import { ThemeProvider } from './hooks/useTheme'
import { TaskProvider } from './context/TaskContext'
import Layout from './components/Layout'
import WelcomePage from './pages/WelcomePage'
import Archiv from './pages/Archiv'
import ModuleDetail from './pages/ModuleDetail'
import CalendarPage from './pages/CalendarPage'
import NotesPage from './pages/NotesPage'
import SportPage from './pages/SportPage'
import MetisPage from './pages/MetisPage'
import OntologyPage from './pages/OntologyPage'
import DelphiPage from './pages/DelphiPage'
import MindmapPage from './pages/MindmapPage'
import JournalMindmapPage from './pages/JournalMindmapPage'
import Journal from './pages/Journal'
import LoginPage from './pages/LoginPage'
import LLMChatPage from './components/archiv/LLMChatPage'

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <TaskProvider>
        <BrowserRouter>
          <Routes>
            {/* Login-Route — ausserhalb von Layout, kein Sidebar */}
            <Route path="login" element={<LoginPage />} />
            <Route path="/" element={<Layout />}>
              <Route index element={<WelcomePage />} />
              <Route path="archiv" element={<Archiv />} />
              <Route path="archiv/llm-chat/:id" element={<LLMChatPage />} />
              <Route path="modules/:id" element={<ModuleDetail />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="notes" element={<NotesPage />} />
              <Route path="sport" element={<SportPage />} />
              <Route path="metis" element={<MetisPage />} />
              <Route path="ontology" element={<OntologyPage />} />
              <Route path="delphi" element={<DelphiPage />} />
              <Route path="journal" element={<Journal />} />
            </Route>
            {/* Mindmaps ausserhalb von Layout — Fullscreen ohne Sidebar */}
            <Route path="mindmap/:summaryId" element={<MindmapPage />} />
            <Route path="journal/mindmap" element={<JournalMindmapPage />} />
          </Routes>
        </BrowserRouter>
        </TaskProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}

export default App
