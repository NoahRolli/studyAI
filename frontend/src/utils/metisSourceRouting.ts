// Mapping von ConceptSource → Route inkl. Highlight-Param.
// Eine einzige Stelle für Routing-Logik — wenn sich URL-Schema ändert, hier.

import type { ConceptSource } from '../types/metis'

export interface SourceRoute {
  path: string        // z.B. "/archiv/llm-chat/678"
  search?: string     // z.B. "?highlight=Pallas"
  hash?: string       // z.B. "#msg-14"
  newTab?: boolean    // Chat-Messages öffnen in neuem Tab
}

export function getSourceRoute(
  source: ConceptSource,
  highlightTerm?: string,
): SourceRoute | null {
  const hl = highlightTerm ? `?highlight=${encodeURIComponent(highlightTerm)}` : ''

  if (source.type === 'chat_message') {
    if (source.document_id == null || source.turn_index == null) return null
    return {
      path: `/archiv/llm-chat/${source.document_id}`,
      search: hl,
      hash: `#msg-${source.turn_index}`,
    }
  }

  if (source.type === 'note') {
    const sep = hl ? '&' : ''
    return { path: '/notes', search: `?open=${source.id}${sep}${hl.slice(1)}` }
  }

  if (source.type === 'summary' && source.module_id != null) {
    const sep = hl ? '&' : ''
    return {
      path: `/modules/${source.module_id}`,
      search: `?summary=${source.id}${sep}${hl.slice(1)}`,
    }
  }

  if (source.type === 'entry') {
    const sep = hl ? '&' : ''
    return { path: '/journal', search: `?entry=${source.id}${sep}${hl.slice(1)}` }
  }

  return null
}

// Helper: vollständige URL als String (für window.open oder navigate)
export function sourceRouteToUrl(r: SourceRoute): string {
  return `${r.path}${r.search ?? ''}${r.hash ?? ''}`
}
