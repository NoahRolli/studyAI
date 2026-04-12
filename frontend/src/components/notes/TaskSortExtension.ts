// TaskSortExtension — Sortiert erledigte Checkboxen nach oben
// Checked Items werden in der TaskList automatisch nach oben verschoben
// Offene Items bleiben unten zum Arbeiten
// ProseMirror Plugin: reagiert auf check-toggle Transaktionen

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

// Sortiert TaskItems innerhalb jeder TaskList: checked oben, unchecked unten
function sortTaskItems(tr: any) {
  const { doc } = tr
  let modified = false

  doc.descendants((node: any, pos: number) => {
    if (node.type.name !== 'taskList') return true
    if (node.childCount < 2) return true

    // Sammle alle TaskItems mit Positionen
    const items: { node: any; checked: boolean }[] = []
    node.forEach((child: any) => {
      if (child.type.name === 'taskItem') {
        items.push({ node: child, checked: child.attrs.checked === true })
      }
    })

    // Prüfen ob bereits sortiert (checked oben)
    let sorted = true
    let seenUnchecked = false
    for (const item of items) {
      if (!item.checked) seenUnchecked = true
      if (item.checked && seenUnchecked) { sorted = false; break }
    }
    if (sorted) return true

    // Sortieren: checked zuerst, Reihenfolge innerhalb beibehalten
    const checked = items.filter(i => i.checked)
    const unchecked = items.filter(i => !i.checked)
    const reordered = [...checked, ...unchecked]

    // TaskList ersetzen mit sortierten Items
    const newContent = reordered.map(i => i.node)
    const newList = node.type.create(node.attrs, newContent)
    tr.replaceWith(pos, pos + node.nodeSize, newList)
    modified = true

    return false
  })

  return modified
}

export const TaskSortExtension = Extension.create({
  name: 'taskSort',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('taskSort'),
        appendTransaction(_trs, oldState, newState) {
          if (oldState.doc.eq(newState.doc)) return null

          // Prüfen ob eine TaskList vorhanden ist
          let hasTaskList = false
          newState.doc.descendants((node: any) => {
            if (node.type.name === 'taskList') hasTaskList = true
            return !hasTaskList
          })
          if (!hasTaskList) return null

          const tr = newState.tr
          if (sortTaskItems(tr)) return tr
          return null
        },
      }),
    ]
  },
})

export default TaskSortExtension
