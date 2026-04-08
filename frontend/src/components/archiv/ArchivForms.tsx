// ArchivForms — Formulare für Ordner + Modul erstellen
// Extrahiert aus Archiv für Dateigrößen-Limit

import { useState } from 'react'
import { useLanguage } from '../../hooks/useLanguage'
import type { ModuleCreate } from '../../types/models'

interface Props {
  showFolderForm: boolean
  showModuleForm: boolean
  onCreateFolder: (name: string) => Promise<void>
  onCreateModule: (data: ModuleCreate) => Promise<void>
}

export default function ArchivForms({
  showFolderForm, showModuleForm, onCreateFolder, onCreateModule,
}: Props) {
  const { t } = useLanguage()
  const [folderName, setFolderName] = useState('')
  const [newModule, setNewModule] = useState<ModuleCreate>({
    name: '', description: '', color: '#00d4ff',
  })

  async function handleCreateFolder() {
    if (!folderName) return
    await onCreateFolder(folderName)
    setFolderName('')
  }

  async function handleCreateModule() {
    if (!newModule.name) return
    await onCreateModule(newModule)
    setNewModule({ name: '', description: '', color: '#00d4ff' })
  }

  return (
    <>
      {showFolderForm && (
        <div className="hud-card p-6 mb-6 animate-fade-in">
          <h2 className="hud-title text-sm mb-4" style={{ color: 'var(--color-primary)' }}>
            {t.archiv.folderFormTitle}
          </h2>
          <div className="mb-4">
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
              {t.archiv.folderName}
            </label>
            <input type="text" value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder={t.archiv.folderPlaceholder}
              className="hud-input"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()} />
          </div>
          <button onClick={handleCreateFolder} disabled={!folderName}
            className="hud-btn hud-btn-primary">
            {t.archiv.createFolder}
          </button>
        </div>
      )}

      {showModuleForm && (
        <div className="hud-card p-6 mb-6 animate-fade-in">
          <h2 className="hud-title text-sm mb-4" style={{ color: 'var(--color-primary)' }}>
            {t.archiv.moduleFormTitle}
          </h2>
          <div className="mb-4">
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
              {t.archiv.moduleName}
            </label>
            <input type="text" value={newModule.name}
              onChange={(e) => setNewModule({ ...newModule, name: e.target.value })}
              placeholder={t.archiv.modulePlaceholder} className="hud-input" />
          </div>
          <div className="mb-6">
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
              {t.archiv.moduleDescription}
            </label>
            <input type="text" value={newModule.description}
              onChange={(e) => setNewModule({ ...newModule, description: e.target.value })}
              placeholder={t.archiv.moduleDescPlaceholder} className="hud-input" />
          </div>
          <button onClick={handleCreateModule} disabled={!newModule.name}
            className="hud-btn hud-btn-primary">
            {t.archiv.createModule}
          </button>
        </div>
      )}
    </>
  )
}
