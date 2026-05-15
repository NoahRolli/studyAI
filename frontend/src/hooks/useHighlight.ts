// useHighlight — markiert alle Vorkommen von `?highlight=<term>` aus der URL
// im uebergebenen Container, scrollt zum ersten Treffer und liefert einen
// clear()-Callback fuer den X-Dismiss-Button.
//
// Async-Render-safe: wartet bis zu `timeoutMs` (default 2s) auf Content,
// retry'd via requestAnimationFrame bei jedem Frame.

import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

interface Options {
  timeoutMs?: number          // Max-Wartezeit auf Content
  contentSelector?: string    // Optional: nur in diesem Sub-Selector suchen
  enabled?: boolean           // Default: true. Disablen wenn Container noch nicht ready.
}

export function useHighlight(
  containerRef: React.RefObject<HTMLElement | null>,
  options: Options = {},
) {
  const [searchParams, setSearchParams] = useSearchParams()
  const term = searchParams.get('highlight')
  const [active, setActive] = useState(false)
  const marksRef = useRef<HTMLElement[]>([])

  const clear = useCallback(() => {
    unwrapMarks(marksRef.current)
    marksRef.current = []
    setActive(false)
    // Param aus URL entfernen, damit ein Refresh nicht neu highlightet
    const next = new URLSearchParams(searchParams)
    next.delete('highlight')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    const { timeoutMs = 2000, contentSelector, enabled = true } = options
    if (!enabled || !term || !containerRef.current) return

    const container = containerRef.current
    let cancelled = false
    let rafId = 0
    const start = Date.now()

    const attempt = () => {
      if (cancelled) return
      const root = contentSelector
        ? container.querySelector<HTMLElement>(contentSelector)
        : container
      if (!root) return retry()
      if (!root.textContent || !root.textContent.toLowerCase().includes(term.toLowerCase())) {
        return retry()
      }
      const marks = wrapMatches(root, term)
      marksRef.current = marks
      if (marks.length > 0) {
        setActive(true)
        marks[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }

    const retry = () => {
      if (Date.now() - start > timeoutMs) return
      rafId = requestAnimationFrame(attempt)
    }

    attempt()
    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      unwrapMarks(marksRef.current)
      marksRef.current = []
    }
  }, [term, containerRef, options.timeoutMs, options.contentSelector, options.enabled])

  return { active, term, clear }
}

// --- DOM-Helpers ---

function wrapMatches(root: HTMLElement, term: string): HTMLElement[] {
  const marks: HTMLElement[] = []
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(escaped, 'gi')

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (parent.closest('mark.pallas-highlight, script, style, textarea, input, [contenteditable="true"]')) {
        return NodeFilter.FILTER_REJECT
      }
      return node.textContent && node.textContent.length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT
    },
  })

  const textNodes: Text[] = []
  let n: Node | null
  while ((n = walker.nextNode())) textNodes.push(n as Text)

  for (const tn of textNodes) {
    const text = tn.textContent ?? ''
    re.lastIndex = 0
    if (!re.test(text)) continue
    re.lastIndex = 0

    const frag = document.createDocumentFragment()
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) {
        frag.appendChild(document.createTextNode(text.slice(last, m.index)))
      }
      const mark = document.createElement('mark')
      mark.className = 'pallas-highlight'
      mark.textContent = m[0]
      frag.appendChild(mark)
      marks.push(mark)
      last = m.index + m[0].length
    }
    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)))
    }
    tn.parentNode?.replaceChild(frag, tn)
  }
  return marks
}

function unwrapMarks(marks: HTMLElement[]) {
  for (const m of marks) {
    if (!m.parentNode) continue
    const txt = document.createTextNode(m.textContent ?? '')
    m.replaceWith(txt)
    // Adjacent Text-Nodes mergen — verhindert "split" Textsegmente
    if (txt.previousSibling?.nodeType === Node.TEXT_NODE) {
      txt.previousSibling.textContent! += txt.textContent ?? ''
      txt.remove()
    }
  }
}
