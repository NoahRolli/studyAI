// GlobalTaskBar — Zeigt laufende/fertige Tasks als animierte Leiste
// Fixed unten rechts, unabhaengig von der aktiven Page
// Live-Timer fuer laufende Tasks, Auto-Dismiss fuer fertige

import { useState, useEffect } from 'react'
import { useTasks } from '../context/TaskContext'
import type { Task } from '../context/TaskContext'

function TaskItem({ task, onDismiss }: { task: Task; onDismiss: () => void }) {
  const [elapsed, setElapsed] = useState(0)

  // Live-Timer: jede Sekunde aktualisieren solange Task laeuft
  useEffect(() => {
    if (task.status !== 'running') return
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - task.startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [task.status, task.startTime])

  // Farbe nach Status
  const color = task.status === 'running' ? 'var(--color-primary)'
    : task.status === 'done' ? 'var(--color-success)'
    : 'var(--color-danger)'

  // Minuten:Sekunden Format
  const timeStr = elapsed >= 60
    ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : `${elapsed}s`

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 text-xs rounded-md
        animate-fade-in backdrop-blur-sm"
      style={{
        background: 'var(--color-bg-elevated)',
        border: `1px solid ${color}`,
        boxShadow: `0 0 12px ${color}40`,
      }}
    >
      {/* Status-Indikator */}
      {task.status === 'running' ? (
        <span className="relative flex-shrink-0 w-2.5 h-2.5">
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-60"
            style={{ background: color }}
          />
          <span
            className="absolute inset-0 rounded-full"
            style={{ background: color }}
          />
        </span>
      ) : (
        <span style={{ color, fontSize: '13px', lineHeight: 1 }}>
          {task.status === 'done' ? '\u2713' : '\u2717'}
        </span>
      )}

      {/* Label */}
      <span style={{ color: 'var(--color-text-secondary)' }}>
        {task.label}
      </span>

      {/* Timer (nur bei laufenden Tasks) */}
      {task.status === 'running' && (
        <span
          className="tabular-nums"
          style={{ color: 'var(--color-text-muted)', minWidth: '3ch' }}
        >
          {timeStr}
        </span>
      )}

      {/* Fehler-Meldung */}
      {task.error && (
        <span className="truncate max-w-32" style={{ color: 'var(--color-danger)' }}>
          {task.error}
        </span>
      )}

      {/* Dismiss (nur fertige/fehlerhafte) */}
      {task.status !== 'running' && (
        <button
          onClick={onDismiss}
          className="ml-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]
            transition-colors"
        >
          \u2715
        </button>
      )}
    </div>
  )
}

export default function GlobalTaskBar() {
  const { tasks, dismissTask } = useTasks()

  if (tasks.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs">
      {tasks.map(task => (
        <TaskItem
          key={task.id}
          task={task}
          onDismiss={() => dismissTask(task.id)}
        />
      ))}
    </div>
  )
}
