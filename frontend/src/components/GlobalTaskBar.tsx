// GlobalTaskBar — Zeigt laufende/fertige Tasks als animierte Leiste
// Fixed unten rechts, unabhaengig von der aktiven Page
// Klickbar: expandiert zu Detail-Ansicht mit Abbruch-Button

import { useState, useEffect } from 'react'
import { useTasks } from '../context/TaskContext'
import { useLanguage } from '../hooks/useLanguage'
import type { Task } from '../context/TaskContext'

function TaskItem({ task, onDismiss, onAbort }: {
  task: Task; onDismiss: () => void; onAbort: () => void
}) {
  const { language } = useLanguage()
  const [elapsed, setElapsed] = useState(0)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (task.status !== 'running') return
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - task.startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [task.status, task.startTime])

  const color = task.status === 'running' ? 'var(--color-primary)'
    : task.status === 'done' ? 'var(--color-success)'
    : 'var(--color-danger)'

  const timeStr = elapsed >= 60
    ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : `${elapsed}s`

  return (
    <div className="rounded-md backdrop-blur-sm animate-fade-in"
      style={{
        background: 'var(--color-bg-elevated)',
        border: `1px solid ${color}`,
        boxShadow: `0 0 12px ${color}40`,
      }}>
      {/* Hauptzeile — klickbar */}
      <button onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-2 text-xs w-full text-left">
        {task.status === 'running' ? (
          <span className="relative flex-shrink-0 w-2.5 h-2.5">
            <span className="absolute inset-0 rounded-full animate-ping opacity-60"
              style={{ background: color }} />
            <span className="absolute inset-0 rounded-full"
              style={{ background: color }} />
          </span>
        ) : (
          <span style={{ color, fontSize: '13px', lineHeight: 1 }}>
            {task.status === 'done' ? '\u2713' : '\u2717'}
          </span>
        )}
        <span style={{ color: 'var(--color-text-secondary)' }}>
          {task.label}
        </span>
        {task.status === 'running' && (
          <span className="tabular-nums"
            style={{ color: 'var(--color-text-muted)', minWidth: '3ch' }}>
            {timeStr}
          </span>
        )}
        <span className="ml-auto" style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {/* Expandierte Details */}
      {expanded && (
        <div className="px-3 pb-2 flex items-center gap-2 border-t"
          style={{ borderColor: `${color}40` }}>
          {task.status === 'running' && (
            <>
              <p className="text-xs flex-1"
                style={{ color: 'var(--color-text-muted)' }}>
                {task.detail ? (
                  <span style={{ color: 'var(--color-text-secondary)' }}>{task.detail}</span>
                ) : (
                  <span className="animate-pulse">
                    {language === 'de' ? `Laeuft seit ${timeStr}...` : `Running for ${timeStr}...`}
                  </span>
                )}
              </p>
              <button onClick={(e) => { e.stopPropagation(); onAbort() }}
                className="hud-btn-sm"
                style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>
                {language === 'de' ? 'Abbrechen' : 'Cancel'}
              </button>
            </>
          )}
          {task.status === 'error' && (
            <p className="text-xs truncate flex-1"
              style={{ color: 'var(--color-danger)' }}>
              {task.error}
            </p>
          )}
          {task.status !== 'running' && (
            <button onClick={(e) => { e.stopPropagation(); onDismiss() }}
              className="hud-btn-sm ml-auto"
              style={{ borderColor: 'var(--color-text-muted)', color: 'var(--color-text-muted)' }}>
              {language === 'de' ? 'Schliessen' : 'Dismiss'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function GlobalTaskBar() {
  const { tasks, dismissTask, abortTask } = useTasks()
  if (tasks.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs">
      {tasks.map(task => (
        <TaskItem key={task.id} task={task}
          onDismiss={() => dismissTask(task.id)}
          onAbort={() => abortTask(task.id)} />
      ))}
    </div>
  )
}
