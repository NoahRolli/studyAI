// Pallas Frontend — Router-Konfiguration
// Dies ist der Einstiegspunkt der React-App
// Hier werden alle Routen (URLs) definiert:
// - "/" → Dashboard (Startseite)
// - "/journal" → Verschlüsseltes Tagebuch
//
// BrowserRouter aktiviert Client-Side Routing:
// Statt die ganze Seite neu zu laden, wechselt nur der Content-Bereich
//
// Layout ist der Wrapper mit Sidebar — alle Seiten werden darin gerendert

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Journal from './pages/Journal'

function App() {
  return (
    // BrowserRouter = aktiviert URL-basiertes Routing
    <BrowserRouter>
      {/* Routes = Container für alle Route-Definitionen */}
      <Routes>
        {/* Layout als Eltern-Route — Sidebar ist immer sichtbar
            Alle Kind-Routen werden im <Outlet /> von Layout gerendert */}
        <Route path="/" element={<Layout />}>

          {/* index = Standard-Route wenn URL genau "/" ist */}
          <Route index element={<Dashboard />} />

          {/* /journal → Journal-Seite */}
          <Route path="journal" element={<Journal />} />

        </Route>
      </Routes>
    </BrowserRouter>
  )
}

// Default Export — wird in main.tsx importiert und gerendert
export default App