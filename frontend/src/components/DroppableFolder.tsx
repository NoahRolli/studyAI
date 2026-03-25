// DroppableFolder — Drop-Zone für Ordner
// Wenn ein Element (Ordner oder Modul) auf diesen Ordner gezogen wird,
// leuchtet er auf (Cyan-Glow) als visuelles Feedback
//
// Props:
// - id: Ordner-ID als String (z.B. "folder-3")
// - children: Der Ordner-Inhalt (Name, Datum etc.)

import { useDroppable } from '@dnd-kit/core'

interface DroppableFolderProps {
  id: string
  children: React.ReactNode
}

function DroppableFolder({ id, children }: DroppableFolderProps) {
  // useDroppable — macht das Element zur Drop-Zone
  // isOver === true wenn gerade ein Element drüber gezogen wird
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{
        // Glow-Effekt wenn ein Element drüber gezogen wird
        boxShadow: isOver ? '0 0 25px rgba(0, 212, 255, 0.5), inset 0 0 15px rgba(0, 212, 255, 0.1)' : 'none',
        borderColor: isOver ? 'rgba(0, 212, 255, 0.6)' : undefined,
        transition: 'all 0.2s ease',
      }}
    >
      {children}
    </div>
  )
}

export default DroppableFolder