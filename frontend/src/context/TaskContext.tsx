// TaskContext — Globaler State fuer langlaeufige AI-Operationen
// Tasks laufen weiter wenn Pages unmounten (Tab-Wechsel)
// Jeder Task hat: id, label, status, startTime, abortController

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
  runTask: (id: string, label: string, fn: (signal: AbortSignal) => Promise<unknown>) => Promise<void>
  abortTask: (id: string) => void
  dismissTask: (id: string) => void
  clearDone: () => void
}

const Ctx = createContext<TaskContextType | null>(null)

export function TaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  // AbortController pro Task-ID
  const abortMap = useRef<Map<string, AbortController>>(new Map())

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }, [])

  const runTask = useCallback(async (
    id: string, label: string,
    fn: (signal: AbortSignal) => Promise<unknown>,
  ) => {
    if (tasksRef.current.some(t => t.id === id && t.status === 'running')) return

    // AbortController erstellen
    const controller = new AbortController()
    abortMap.current.set(id, controller)

    const newTask: Task = { id, label, status: 'running', startTime: Date.now() }
    setTasks(prev => [...prev.filter(t => t.id !== id), newTask])

    try {
      await fn(controller.signal)
      updateTask(id, { status: 'done' })
      setTimeout(() => {
        setTasks(prev => prev.filter(t => t.id !== id))
      }, 5000)
    } catch (err) {
      if (controller.signal.aborted) {
        updateTask(id, { status: 'done', label: `${label} (abgebrochen)` })
        setTimeout(() => {
          setTasks(prev => prev.filter(t => t.id !== id))
        }, 3000)
      } else {
        updateTask(id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Unbekannter Fehler',
        })
      }
    } finally {
      abortMap.current.delete(id)
    }
  }, [updateTask])

  const abortTask = useCallback((id: string) => {
    const controller = abortMap.current.get(id)
    if (controller) controller.abort()
  }, [])

  const dismissTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    abortMap.current.delete(id)
  }, [])

  const clearDone = useCallback(() => {
    setTasks(prev => prev.filter(t => t.status === 'running'))
  }, [])

  const hasRunning = tasks.some(t => t.status === 'running')

  return (
    <Ctx.Provider value={{ tasks, hasRunning, runTask, abortTask, dismissTask, clearDone }}>
      {children}
    </Ctx.Provider>
  )
}

export function useTasks() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTasks muss innerhalb TaskProvider sein')
  return ctx
}
