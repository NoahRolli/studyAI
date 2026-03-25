// DraggableCard — Wrapper-Komponente für Drag & Drop
// Macht jedes Element (Ordner oder Modul) draggable
// Nutzt @dnd-kit/core für die Drag-Logik
//
// Props:
// - id: Eindeutige ID für das Element (z.B. "folder-3", "module-7")
// - type: "folder" oder "module" — wird beim Drop ausgewertet
// - children: Der Inhalt der Karte (wird einfach durchgereicht)

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

interface DraggableCardProps {
  id: string
  type: 'folder' | 'module'
  children: React.ReactNode
}

function DraggableCard({ id, type, children }: DraggableCardProps) {
  // useDraggable — macht das Element greifbar
  // data enthält Typ-Info die beim Drop-Event ausgelesen wird
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { type },
  })

  // Transform als CSS — verschiebt das Element visuell beim Ziehen
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
    transition: isDragging ? 'none' : 'opacity 0.2s ease',
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  )
}

export default DraggableCard