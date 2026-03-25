// Dashboard — Ordner-Hierarchie mit Drag & Drop
// Zeigt den Inhalt der aktuellen Ebene: Ordner + Module
// Ordner sind klickbar → navigiert eine Ebene tiefer
// Elemente können per Drag & Drop in Ordner verschoben werden
// Breadcrumbs oben zeigen den aktuellen Pfad

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { get, post, put, del } from '../hooks/useAPI'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import DraggableCard from '../components/DraggableCard'
import DroppableFolder from '../components/DroppableFolder'
import type {
  Module,
  ModuleCreate,
  Folder,
  FolderCreate,
  FolderContents,
  BreadcrumbItem,
} from '../types/models'

function Dashboard() {
  // --- State ---

  // Aktueller Ordner (null = Root/Dashboard)
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null)

  // Inhalt der aktuellen Ebene
  const [folders, setFolders] = useState<Folder[]>([])
  const [modules, setModules] = useState<Module[]>([])

  // Breadcrumbs für die Navigation
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([])

  // Lade- und Fehlerzustand
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Formular-Steuerung
  const [showFolderForm, setShowFolderForm] = useState(false)
  const [showModuleForm, setShowModuleForm] = useState(false)

  // Formular-Daten
  const [newFolderName, setNewFolderName] = useState('')
  const [newModule, setNewModule] = useState<ModuleCreate>({
    name: '',
    description: '',
    color: '#00d4ff',
  })

  // Drag & Drop — welches Element wird gerade gezogen?
  const [dragLabel, setDragLabel] = useState<string | null>(null)

  // --- Daten laden ---

  async function loadContents() {
    try {
      setLoading(true)
      setError(null)
      const query = currentFolderId !== null ? `?parent_id=${currentFolderId}` : ''
      const data = await get<FolderContents>(`/api/folders/contents${query}`)
      setFolders(data.folders)
      setModules(data.modules)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }

  async function loadBreadcrumbs() {
    if (currentFolderId === null) {
      setBreadcrumbs([])
      return
    }
    try {
      const data = await get<BreadcrumbItem[]>(
        `/api/folders/${currentFolderId}/breadcrumbs`
      )
      setBreadcrumbs(data)
    } catch {
      setBreadcrumbs([])
    }
  }

  useEffect(() => {
    loadContents()
    loadBreadcrumbs()
  }, [currentFolderId])

  // --- Ordner erstellen ---
  async function createFolder() {
    try {
      setError(null)
      const payload: FolderCreate = { name: newFolderName, parent_id: currentFolderId }
      await post('/api/folders/', payload)
      setNewFolderName('')
      setShowFolderForm(false)
      await loadContents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    }
  }

  // --- Modul erstellen ---
  async function createModule() {
    try {
      setError(null)
      const response = await post<Module>('/api/modules/', newModule)
      // In aktuellen Ordner verschieben falls nicht Root
      if (currentFolderId !== null) {
        await put(`/api/folders/move-module/${response.id}`, {
          folder_id: currentFolderId,
        })
      }
      setNewModule({ name: '', description: '', color: '#00d4ff' })
      setShowModuleForm(false)
      await loadContents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    }
  }

  // --- Löschen ---
  async function deleteFolder(folderId: number, event: React.MouseEvent) {
    event.stopPropagation()
    try {
      await del(`/api/folders/${folderId}`)
      await loadContents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen')
    }
  }

  async function deleteModule(moduleId: number, event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    try {
      await del(`/api/modules/${moduleId}`)
      await loadContents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen')
    }
  }

  // --- Navigation ---
  function openFolder(folderId: number) {
    setCurrentFolderId(folderId)
    setShowFolderForm(false)
    setShowModuleForm(false)
  }

  function goToRoot() {
    setCurrentFolderId(null)
    setShowFolderForm(false)
    setShowModuleForm(false)
  }

  function goToBreadcrumb(folderId: number) {
    setCurrentFolderId(folderId)
    setShowFolderForm(false)
    setShowModuleForm(false)
  }

  // --- Drag & Drop Handler ---

  // Beim Start: Label merken für die DragOverlay-Vorschau
  function handleDragStart(event: DragStartEvent) {
    const { active } = event
    const id = String(active.id)
    // Label aus dem aktuellen Element finden
    if (id.startsWith('folder-')) {
      const fId = parseInt(id.replace('folder-', ''))
      const folder = folders.find((f) => f.id === fId)
      setDragLabel(folder ? `📁 ${folder.name}` : null)
    } else if (id.startsWith('module-')) {
      const mId = parseInt(id.replace('module-', ''))
      const mod = modules.find((m) => m.id === mId)
      setDragLabel(mod ? `📄 ${mod.name}` : null)
    }
  }

  // Beim Drop: Element in den Ziel-Ordner verschieben
  async function handleDragEnd(event: DragEndEvent) {
    setDragLabel(null)
    const { active, over } = event

    // Kein Ziel oder auf sich selbst gedroppt → nichts tun
    if (!over || active.id === over.id) return

    const draggedId = String(active.id)
    const targetId = String(over.id)

    // Ziel muss ein Ordner sein (drop-folder-X)
    if (!targetId.startsWith('drop-folder-')) return

    const targetFolderId = parseInt(targetId.replace('drop-folder-', ''))

    try {
      setError(null)

      if (draggedId.startsWith('folder-')) {
        // Ordner verschieben → parent_id ändern
        const folderId = parseInt(draggedId.replace('folder-', ''))
        // Nicht in sich selbst verschieben
        if (folderId === targetFolderId) return
        await put(`/api/folders/${folderId}`, { parent_id: targetFolderId })
      } else if (draggedId.startsWith('module-')) {
        // Modul verschieben → folder_id ändern
        const moduleId = parseInt(draggedId.replace('module-', ''))
        await put(`/api/folders/move-module/${moduleId}`, { folder_id: targetFolderId })
      }

      // Inhalt neu laden nach dem Verschieben
      await loadContents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verschieben fehlgeschlagen')
    }
  }

  // --- Render ---
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="hud-title text-glow text-2xl">Dashboard</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setShowFolderForm(!showFolderForm); setShowModuleForm(false) }}
            className="hud-btn"
          >
            {showFolderForm ? 'Abbrechen' : '+ Ordner'}
          </button>
          <button
            onClick={() => { setShowModuleForm(!showModuleForm); setShowFolderForm(false) }}
            className="hud-btn"
          >
            {showModuleForm ? 'Abbrechen' : '+ Modul'}
          </button>
        </div>
      </div>

      {/* Breadcrumb-Navigation */}
      <div className="flex items-center gap-2 mb-6 text-xs flex-wrap">
        <button
          onClick={goToRoot}
          className="transition-colors"
          style={{
            color: currentFolderId === null
              ? 'var(--color-primary)'
              : 'var(--color-text-muted)',
          }}
        >
          Dashboard
        </button>
        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.id} className="flex items-center gap-2">
            <span style={{ color: 'var(--color-border)' }}>/</span>
            <button
              onClick={() => goToBreadcrumb(crumb.id)}
              className="transition-colors"
              style={{
                color: index === breadcrumbs.length - 1
                  ? 'var(--color-primary)'
                  : 'var(--color-text-muted)',
              }}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </div>

      {/* Fehlermeldung */}
      {error && (
        <div
          className="px-4 py-3 rounded-lg mb-6 border"
          style={{
            background: 'rgba(255, 59, 92, 0.1)',
            borderColor: 'rgba(255, 59, 92, 0.3)',
            color: 'var(--color-danger)',
          }}
        >
          {error}
        </div>
      )}

      {/* Formular: Neuer Ordner */}
      {showFolderForm && (
        <div className="hud-card p-6 mb-6 animate-fade-in">
          <h2 className="hud-title text-sm mb-4" style={{ color: 'var(--color-primary)' }}>
            Neuer Ordner
          </h2>
          <div className="mb-4">
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Name
            </label>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="z.B. Frühjahrssemester 26"
              className="hud-input"
              onKeyDown={(e) => e.key === 'Enter' && newFolderName && createFolder()}
            />
          </div>
          <button
            onClick={createFolder}
            disabled={!newFolderName}
            className="hud-btn hud-btn-primary"
          >
            Ordner erstellen
          </button>
        </div>
      )}

      {/* Formular: Neues Modul */}
      {showModuleForm && (
        <div className="hud-card p-6 mb-6 animate-fade-in">
          <h2 className="hud-title text-sm mb-4" style={{ color: 'var(--color-primary)' }}>
            Neues Modul
          </h2>
          <div className="mb-4">
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Name
            </label>
            <input
              type="text"
              value={newModule.name}
              onChange={(e) => setNewModule({ ...newModule, name: e.target.value })}
              placeholder="z.B. Lineare Algebra"
              className="hud-input"
            />
          </div>
          <div className="mb-6">
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Beschreibung
            </label>
            <input
              type="text"
              value={newModule.description}
              onChange={(e) => setNewModule({ ...newModule, description: e.target.value })}
              placeholder="z.B. Mathe Semester 2"
              className="hud-input"
            />
          </div>
          <button
            onClick={createModule}
            disabled={!newModule.name}
            className="hud-btn hud-btn-primary"
          >
            Modul erstellen
          </button>
        </div>
      )}

      {/* Ladezustand */}
      {loading && (
        <p style={{ color: 'var(--color-text-muted)' }}>Wird geladen...</p>
      )}

      {/* Leerer Zustand */}
      {!loading && folders.length === 0 && modules.length === 0 && (
        <div className="text-center py-16">
          <p className="text-lg mb-2" style={{ color: 'var(--color-text-muted)' }}>
            {currentFolderId === null ? 'Noch nichts vorhanden.' : 'Ordner ist leer.'}
          </p>
          <p style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
            Erstelle einen Ordner oder ein Modul um loszulegen.
          </p>
        </div>
      )}

      {/* Drag & Drop Kontext — umschliesst alle draggable/droppable Elemente */}
      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Ordner-Karten — gleichzeitig draggable UND droppable */}
          {folders.map((folder) => (
            <DraggableCard key={`folder-${folder.id}`} id={`folder-${folder.id}`} type="folder">
              <DroppableFolder id={`drop-folder-${folder.id}`}>
                <div
                  onClick={() => openFolder(folder.id)}
                  className="hud-card p-5 cursor-pointer"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className="text-lg"
                      style={{
                        color: 'var(--color-primary)',
                        textShadow: '0 0 8px rgba(0, 212, 255, 0.5)',
                      }}
                    >
                      📁
                    </span>
                    <h3 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      {folder.name}
                    </h3>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {new Date(folder.created_at).toLocaleDateString('de-CH')}
                    </span>
                    <button
                      onClick={(e) => deleteFolder(folder.id, e)}
                      className="text-xs transition-colors"
                      style={{ color: 'rgba(255, 59, 92, 0.4)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-danger)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 59, 92, 0.4)')}
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              </DroppableFolder>
            </DraggableCard>
          ))}

          {/* Modul-Karten — nur draggable (nicht droppable) */}
          {modules.map((module) => (
            <DraggableCard key={`module-${module.id}`} id={`module-${module.id}`} type="module">
              <Link
                to={`/modules/${module.id}`}
                className="hud-card p-5 block"
                onClick={(e) => {
                  // Drag soll nicht navigieren — nur echte Klicks
                  if (dragLabel) e.preventDefault()
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className="text-lg"
                    style={{
                      color: 'var(--color-text-secondary)',
                      textShadow: '0 0 6px rgba(0, 212, 255, 0.3)',
                    }}
                  >
                    📄
                  </span>
                  <h3 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {module.name}
                  </h3>
                </div>
                <p className="text-sm mb-3 pl-8" style={{ color: 'var(--color-text-secondary)' }}>
                  {module.description}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {new Date(module.created_at).toLocaleDateString('de-CH')}
                  </span>
                  <button
                    onClick={(e) => deleteModule(module.id, e)}
                    className="text-xs transition-colors"
                    style={{ color: 'rgba(255, 59, 92, 0.4)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-danger)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 59, 92, 0.4)')}
                  >
                    Löschen
                  </button>
                </div>
              </Link>
            </DraggableCard>
          ))}
        </div>

        {/* DragOverlay — schwebendes Element während des Ziehens */}
        <DragOverlay>
          {dragLabel && (
            <div
              className="hud-card px-4 py-3 text-sm font-medium"
              style={{
                color: 'var(--color-primary)',
                boxShadow: '0 0 30px rgba(0, 212, 255, 0.4)',
                pointerEvents: 'none',
              }}
            >
              {dragLabel}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

export default Dashboard