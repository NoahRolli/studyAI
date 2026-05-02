// DraggableCard — Wrapper-Komponente für Drag & Drop
// Macht jedes Element (Ordner oder Modul) draggable
// Nutzt @dnd-kit/core für die Drag-Logik
//
// Props:
// - id: Eindeutige ID für das Element (z.B. "folder-3", "module-7")
// - type: "folder" oder "module" — wird beim Drop ausgewertet
// - children: Der Inhalt der Karte (wird einfach durchgereicht)

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface DraggableCardProps {
  id: string
  type: 'folder' | 'module'
  children: React.ReactNode
  disabled?: boolean
}

function DraggableCard({ id, type, children, disabled = false }: DraggableCardProps) {
  // useSortable — macht das Element draggable UND animiert Nachbarelemente live
  // data enthaelt Typ-Info die beim Drop-Event ausgelesen wird
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { type },
    disabled,
  })

  // Transform als CSS — verschiebt das Element visuell beim Ziehen
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: disabled ? 'default' : 'grab',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  )
}

export default DraggableCard