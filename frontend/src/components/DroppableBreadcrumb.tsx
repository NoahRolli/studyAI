// DroppableBreadcrumb — Drop-Zone fuer Breadcrumb-Buttons
// Erlaubt Folders/Modules per Drag in eine hoehere Ebene zu verschieben
// (incl. Root). Visuelles Feedback wie DroppableFolder.
//
// Props:
//   id: drop-breadcrumb-root oder drop-breadcrumb-{folderId}
//   children: der Button mit dem Crumb-Namen

import { useDroppable } from '@dnd-kit/core'

interface DroppableBreadcrumbProps {
  id: string
  children: React.ReactNode
}

function DroppableBreadcrumb({ id, children }: DroppableBreadcrumbProps) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <span
      ref={setNodeRef}
      style={{
        padding: '2px 6px',
        borderRadius: '4px',
        backgroundColor: isOver ? 'var(--color-active-bg)' : 'transparent',
        boxShadow: isOver ? '0 0 12px var(--color-highlight-strong)' : 'none',
        transition: 'all 0.15s ease',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {children}
    </span>
  )
}

export default DroppableBreadcrumb
