// useMindmapDeepDive — Hook für AI-gestützte Knoten-Expansion
//
// Doppelklick auf einen Blatt-Knoten → Backend generiert Unterknoten
// Die neuen Knoten werden in den lokalen Baum eingefügt
// und das Layout wird neu berechnet
//
// Gibt expandNode-Callback + expanding-State zurück

import { useState, useCallback } from 'react'
import type { Node } from 'reactflow'
import { post } from './useAPI'
import type { MindmapTreeNode } from '../utils/mindmapStyles'

interface ExpandResponse {
  node_id: number
  children: MindmapTreeNode[]
}

// Kinder rekursiv in den Baum einfügen (mit echten DB-IDs vom Backend)
function insertChildren(
  treeNodes: MindmapTreeNode[],
  targetId: number,
  children: MindmapTreeNode[],
): MindmapTreeNode[] {
  return treeNodes.map((n) => {
    if (n.id === targetId) return { ...n, children }
    if (n.children.length > 0) {
      return { ...n, children: insertChildren(n.children, targetId, children) }
    }
    return n
  })
}

export function useMindmapDeepDive(
  treeData: MindmapTreeNode[],
  setTreeData: (tree: MindmapTreeNode[]) => void,
  setError: (msg: string | null) => void,
) {
  const [expanding, setExpanding] = useState(false)

  // Doppelklick-Handler: Knoten expandieren via AI
  const expandNode = useCallback(
    async (node: Node) => {
      // Knoten hat schon Kinder → nichts tun
      if (node.data.hasChildren) return

      // Keine Backend-ID → kann nicht expandiert werden
      if (!node.data.backendId) {
        setError('Knoten hat keine gültige ID für Deep Dive')
        return
      }

      try {
        setExpanding(true)
        setError(null)

        const data = await post<ExpandResponse>(
          `/api/mindmap/nodes/${node.data.backendId}/expand`,
        )

        // Kinder mit echten DB-IDs aufbereiten
        const childrenWithIds: MindmapTreeNode[] = data.children.map((c) => ({
          id: c.id,
          label: c.label || '',
          detail: c.detail || '',
          depth_level: c.depth_level ?? node.data.depth + 1,
          position_x: 0,
          position_y: 0,
          children: c.children || [],
        }))

        const updatedTree = insertChildren(
          treeData,
          node.data.backendId,
          childrenWithIds,
        )
        setTreeData(updatedTree)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Deep Dive fehlgeschlagen')
      } finally {
        setExpanding(false)
      }
    },
    [treeData, setTreeData, setError],
  )

  return { expanding, expandNode }
}