// useDocumentSort — Generischer Sort-Hook fuer Documents/Folders/Modules
// Akzeptiert jede Liste mit optional configurierbaren Feldern
//
// Beispiel:
//   const { mode, setMode, sorted } = useDocumentSort(documents, {
//     dateField: 'uploaded_at',
//     nameField: (d) => d.display_name || d.filename,
//     typeField: 'file_type',
//   })

import { useState, useMemo } from 'react'

export type SortMode =
  | 'manual'
  | 'date-desc'
  | 'date-asc'
  | 'name-asc'
  | 'name-desc'
  | 'type-asc'

export interface SortConfig<T> {
  dateField: keyof T
  nameField: (item: T) => string
  typeField?: keyof T
  defaultMode?: SortMode
  allowManual?: boolean
}

export function useDocumentSort<T>(items: T[], config: SortConfig<T>) {
  const [mode, setMode] = useState<SortMode>(config.defaultMode ?? 'date-desc')

  const sorted = useMemo(() => {
    const arr = [...items]
    if (mode === 'manual') return arr
    arr.sort((a, b) => {
      switch (mode) {
        case 'date-desc':
          return new Date(b[config.dateField] as string).getTime() -
                 new Date(a[config.dateField] as string).getTime()
        case 'date-asc':
          return new Date(a[config.dateField] as string).getTime() -
                 new Date(b[config.dateField] as string).getTime()
        case 'name-asc':
          return config.nameField(a).localeCompare(config.nameField(b))
        case 'name-desc':
          return config.nameField(b).localeCompare(config.nameField(a))
        case 'type-asc':
          if (!config.typeField) return 0
          return String(a[config.typeField]).localeCompare(String(b[config.typeField]))
        default:
          return 0
      }
    })
    return arr
  }, [items, mode, config])

  return { mode, setMode, sorted, hasTypeField: !!config.typeField, hasManual: !!config.allowManual }
}
