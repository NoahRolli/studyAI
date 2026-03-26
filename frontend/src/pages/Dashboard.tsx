// Dashboard — Ordner-Hierarchie mit Drag & Drop
// Zeigt den Inhalt der aktuellen Ebene: Ordner + Module
// Ordner sind klickbar → navigiert eine Ebene tiefer
// Elemente können per Drag & Drop in Ordner verschoben werden
// Breadcrumbs oben zeigen den aktuellen Pfad
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { get, post, put, del } from '../hooks/useAPI'
import { useLanguage } from '../hooks/useLanguage'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
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
  const { t } = useLanguage()

  // --- State ---
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null)
  const [folders, setFolders] = useState<Folder[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showFolderForm, setShowFolderForm] = useState(false)
  const [showModuleForm, setShowModuleForm] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newModule, setNewModule] = useState<ModuleCreate>({
    name: '',
    description: '',
    color: '#00d4ff',
  })
  const [dragLabel, setDragLabel] = useState<string | null>(null)

  // Drag & Drop Sensor — erst nach 8px Bewegung aktivieren
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

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
      setError(err instanceof Error ? err.message : t.common.error)
    } finally {
      setLoading(false)
    }
  }

  async function loadBreadcrumbs() {
    if (currentFolderId === null) { setBreadcrumbs([]); return }
    try {
      const data = await get<BreadcrumbItem[]>(
        `/api/folders/${currentFolderId}/breadcrumbs`
      )
      setBreadcrumbs(data)
    } catch { setBreadcrumbs([]) }
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
      setError(err instanceof Error ? err.message : t.common.error)
    }
  }

  // --- Modul erstellen ---
  async function createModule() {
    try {
      setError(null)
      const response = await post<Module>('/api/modules/', newModule)
      if (currentFolderId !== null) {
        await put(`/api/folders/move-module/${response.id}`, {
          folder_id: currentFolderId,
        })
      }
      setNewModule({ name: '', description: '', color: '#00d4ff' })
      setShowModuleForm(false)
      await loadContents()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    }
  }

  // --- Löschen ---
  async function deleteFolder(folderId: number, event: React.MouseEvent) {
    event.stopPropagation()
    try {
      await del(`/api/folders/${folderId}`)
      await loadContents()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    }
  }

  async function deleteModule(moduleId: number, event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    try {
      await del(`/api/modules/${moduleId}`)
      await loadContents()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
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
  function handleDragStart(event: DragStartEvent) {
    const { active } = event
    const id = String(active.id)
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

  async function handleDragEnd(event: DragEndEvent) {
    setDragLabel(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const draggedId = String(active.id)
    const targetId = String(over.id)
    if (!targetId.startsWith('drop-folder-')) return
    const targetFolderId = parseInt(targetId.replace('drop-folder-', ''))
    try {
      setError(null)
      if (draggedId.startsWith('folder-')) {
        const folderId = parseInt(draggedId.replace('folder-', ''))
        if (folderId === targetFolderId) return
        await put(`/api/folders/${folderId}`, { parent_id: targetFolderId })
      } else if (draggedId.startsWith('module-')) {
        const moduleId = parseInt(draggedId.replace('module-', ''))
        await put(`/api/folders/move-module/${moduleId}`, { folder_id: targetFolderId })
      }
      await loadContents()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.dashboard.moveFailed)
    }
  }

  // --- Render ---
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="hud-title text-glow text-2xl">{t.dashboard.title}</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setShowFolderForm(!showFolderForm); setShowModuleForm(false) }}
            className="hud-btn"
          >
            {showFolderForm ? t.common.cancel : t.dashboard.newFolder}
          </button>
          <button
            onClick={() => { setShowModuleForm(!showModuleForm); setShowFolderForm(false) }}
            className="hud-btn"
          >
            {showModuleForm ? t.common.cancel : t.dashboard.newModule}
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
          {t.sidebar.dashboard}
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
            {t.dashboard.folderFormTitle}
          </h2>
          <div className="mb-4">
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
              {t.dashboard.folderName}
            </label>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={t.dashboard.folderPlaceholder}
              className="hud-input"
              onKeyDown={(e) => e.key === 'Enter' && newFolderName && createFolder()}
            />
          </div>
          <button
            onClick={createFolder}
            disabled={!newFolderName}
            className="hud-btn hud-btn-primary"
          >
            {t.dashboard.createFolder}
          </button>
        </div>
      )}

      {/* Formular: Neues Modul */}
      {showModuleForm && (
        <div className="hud-card p-6 mb-6 animate-fade-in">
          <h2 className="hud-title text-sm mb-4" style={{ color: 'var(--color-primary)' }}>
            {t.dashboard.moduleFormTitle}
          </h2>
          <div className="mb-4">
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
              {t.dashboard.moduleName}
            </label>
            <input
              type="text"
              value={newModule.name}
              onChange={(e) => setNewModule({ ...newModule, name: e.target.value })}
              placeholder={t.dashboard.modulePlaceholder}
              className="hud-input"
            />
          </div>
          <div className="mb-6">
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
              {t.dashboard.moduleDescription}
            </label>
            <input
              type="text"
              value={newModule.description}
              onChange={(e) => setNewModule({ ...newModule, description: e.target.value })}
              placeholder={t.dashboard.moduleDescPlaceholder}
              className="hud-input"
            />
          </div>
          <button
            onClick={createModule}
            disabled={!newModule.name}
            className="hud-btn hud-btn-primary"
          >
            {t.dashboard.createModule}
          </button>
        </div>
      )}

      {/* Ladezustand */}
      {loading && (
        <p style={{ color: 'var(--color-text-muted)' }}>{t.common.loading}</p>
      )}

      {/* Leerer Zustand */}
      {!loading && folders.length === 0 && modules.length === 0 && (
        <div className="text-center py-16">
          <p className="text-lg mb-2" style={{ color: 'var(--color-text-muted)' }}>
            {currentFolderId === null ? t.dashboard.emptyRoot : t.dashboard.emptyFolder}
          </p>
          <p style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
            {t.dashboard.emptyHint}
          </p>
        </div>
      )}

      {/* Drag & Drop Kontext */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Ordner-Karten */}
          {folders.map((folder) => (
            <DraggableCard key={`folder-${folder.id}`} id={`folder-${folder.id}`} type="folder">
              <DroppableFolder id={`drop-folder-${folder.id}`}>
                <div onClick={() => openFolder(folder.id)} className="hud-card p-5 cursor-pointer">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-lg" style={{ color: 'var(--color-primary)', textShadow: '0 0 8px rgba(0, 212, 255, 0.5)' }}>📁</span>
                    <h3 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>{folder.name}</h3>
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
                      {t.common.delete}
                    </button>
                  </div>
                </div>
              </DroppableFolder>
            </DraggableCard>
          ))}

          {/* Modul-Karten */}
          {modules.map((module) => (
            <DraggableCard key={`module-${module.id}`} id={`module-${module.id}`} type="module">
              <Link to={`/modules/${module.id}`} className="hud-card p-5 block">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-lg" style={{ color: 'var(--color-text-secondary)', textShadow: '0 0 6px rgba(0, 212, 255, 0.3)' }}>📄</span>
                  <h3 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>{module.name}</h3>
                </div>
                <p className="text-sm mb-3 pl-8" style={{ color: 'var(--color-text-secondary)' }}>{module.description}</p>
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
                    {t.common.delete}
                  </button>
                </div>
              </Link>
            </DraggableCard>
          ))}
        </div>

        {/* DragOverlay */}
        <DragOverlay>
          {dragLabel && (
            <div
              className="hud-card px-4 py-3 text-sm font-medium"
              style={{ color: 'var(--color-primary)', boxShadow: '0 0 30px rgba(0, 212, 255, 0.4)', pointerEvents: 'none' }}
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