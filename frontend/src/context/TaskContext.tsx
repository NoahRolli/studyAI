// TaskContext — Globaler State fuer langläufige AI-Operationen
// Tasks laufen weiter wenn Pages unmounten (Tab-Wechsel)
// Jeder Task hat: id, label, status (running/done/error), startTime

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'

export interface Task {
  id: string
  label: string
  status: 'running' | 'done' | 'error'
  startTime: number
  error?: string
}

interface TaskContextType {
  tasks: Task[]
  hasRunning: boolean
  runTask: (id: string, label: string, fn: () => Promise<unknown>) => Promise<void>
  dismissTask: (id: string) => void
  clearDone: () => void
}

const Ctx = createContext<TaskContextType | null>(null)

export function TaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([])
  // Ref verhindert stale closures bei gleichzeitigen Tasks
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }, [])

  const runTask = useCallback(async (id: string, label: string, fn: () => Promise<unknown>) => {
    // Wenn Task mit gleicher ID schon läuft, ignorieren
    if (tasksRef.current.some(t => t.id === id && t.status === 'running')) return

    // Alten fertigen Task mit gleicher ID entfernen, neuen hinzufügen
    const newTask: Task = { id, label, status: 'running', startTime: Date.now() }
    setTasks(prev => [...prev.filter(t => t.id !== id), newTask])

    try {
      await fn()
      updateTask(id, { status: 'done' })
      // Nach 5s automatisch ausblenden
      setTimeout(() => {
        setTasks(prev => prev.filter(t => t.id !== id))
      }, 5000)
    } catch (err) {
      updateTask(id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Unbekannter Fehler',
      })
    }
  }, [updateTask])

  const dismissTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
  }, [])

  const clearDone = useCallback(() => {
    setTasks(prev => prev.filter(t => t.status === 'running'))
  }, [])

  const hasRunning = tasks.some(t => t.status === 'running')

  return (
    <Ctx.Provider value={{ tasks, hasRunning, runTask, dismissTask, clearDone }}>
      {children}
    </Ctx.Provider>
  )
}

export function useTasks() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTasks muss innerhalb TaskProvider sein')
  return ctx
}
