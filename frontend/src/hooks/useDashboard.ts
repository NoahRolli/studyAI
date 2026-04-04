// useDashboard — State + Logik für Dashboard
// Lädt Ordner + Module, CRUD, DnD-Reihenfolge, Pin, Rename

import { useState, useEffect, useCallback } from 'react'
import { get, post, put, del } from './useAPI'
import { useLanguage } from './useLanguage'
import type {
  Module, ModuleCreate, Folder, FolderCreate,
  FolderContents, BreadcrumbItem,
} from '../types/models'

export function useDashboard() {
  const { t } = useLanguage()
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null)
  const [folders, setFolders] = useState<Folder[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // --- Daten laden ---
  const loadContents = useCallback(async () => {
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
  }, [currentFolderId, t])

  const loadBreadcrumbs = useCallback(async () => {
    if (currentFolderId === null) { setBreadcrumbs([]); return }
    try {
      const data = await get<BreadcrumbItem[]>(`/api/folders/${currentFolderId}/breadcrumbs`)
      setBreadcrumbs(data)
    } catch { setBreadcrumbs([]) }
  }, [currentFolderId])

  useEffect(() => {
    loadContents()
    loadBreadcrumbs()
  }, [loadContents, loadBreadcrumbs])

  // --- CRUD ---
  async function createFolder(name: string) {
    const payload: FolderCreate = { name, parent_id: currentFolderId }
    await post('/api/folders/', payload)
    await loadContents()
  }

  async function createModule(data: ModuleCreate) {
    const response = await post<Module>('/api/modules/', data)
    if (currentFolderId !== null) {
      await put(`/api/folders/move-module/${response.id}`, { folder_id: currentFolderId })
    }
    await loadContents()
  }

  async function deleteFolder(folderId: number) {
    await del(`/api/folders/${folderId}`)
    await loadContents()
  }

  async function deleteModule(moduleId: number) {
    await del(`/api/modules/${moduleId}`)
    await loadContents()
  }

  // --- Pin ---
  async function togglePinFolder(folderId: number) {
    await put(`/api/folders/${folderId}/pin`, {})
    await loadContents()
  }

  async function togglePinModule(moduleId: number) {
    await put(`/api/modules/${moduleId}/pin`, {})
    await loadContents()
  }

  // --- Rename ---
  async function renameFolder(folderId: number, name: string) {
    await put(`/api/folders/${folderId}`, { name })
    await loadContents()
  }

  async function renameModule(moduleId: number, name: string) {
    await put(`/api/modules/${moduleId}`, { name })
    await loadContents()
  }

  // --- Sort Order persistieren ---
  async function saveSortOrder(newFolders: Folder[], newModules: Module[]) {
    const folderOrder = newFolders.map((f, i) => ({ id: f.id, sort_order: i }))
    const moduleOrder = newModules.map((m, i) => ({ id: m.id, sort_order: i }))
    setFolders(newFolders)
    setModules(newModules)
    await put('/api/folders/sort-order/update', {
      folders: folderOrder, modules: moduleOrder,
    })
  }

  // --- DnD: Element in Ordner verschieben ---
  async function moveToFolder(draggedId: string, targetFolderId: number) {
    if (draggedId.startsWith('folder-')) {
      const folderId = parseInt(draggedId.replace('folder-', ''))
      if (folderId === targetFolderId) return
      await put(`/api/folders/${folderId}`, { parent_id: targetFolderId })
    } else if (draggedId.startsWith('module-')) {
      const moduleId = parseInt(draggedId.replace('module-', ''))
      await put(`/api/folders/move-module/${moduleId}`, { folder_id: targetFolderId })
    }
    await loadContents()
  }

  // --- Navigation ---
  function openFolder(folderId: number) { setCurrentFolderId(folderId) }
  function goToRoot() { setCurrentFolderId(null) }
  function goToBreadcrumb(folderId: number) { setCurrentFolderId(folderId) }

  return {
    currentFolderId, folders, modules, breadcrumbs,
    loading, error, setError,
    createFolder, createModule, deleteFolder, deleteModule,
    togglePinFolder, togglePinModule,
    renameFolder, renameModule,
    saveSortOrder, moveToFolder,
    openFolder, goToRoot, goToBreadcrumb,
  }
}
