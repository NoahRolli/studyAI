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
    const { timeoutMs = 15000, contentSelector, enabled = true } = options
    if (!enabled || !term || !containerRef.current) return

    const container = containerRef.current
    let cancelled = false
    let done = false
    let observer: MutationObserver | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const getRoot = () =>
      contentSelector
        ? container.querySelector<HTMLElement>(contentSelector)
        : container

    // Versucht den Wrap. Liefert true wenn erfolgreich (Marks erzeugt),
    // false wenn der Content noch nicht da ist.
    const attempt = (): boolean => {
      if (cancelled || done) return false
      const root = getRoot()
      if (!root) return false
      if (!root.textContent || !root.textContent.toLowerCase().includes(term.toLowerCase())) {
        return false
      }
      const marks = wrapMatches(root, term)
      if (marks.length === 0) return false
      marksRef.current = marks
      setActive(true)
      marks[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
      done = true
      return true
    }

    // Erster Versuch sofort (haeufiger Fall: Content ist schon da)
    if (attempt()) {
      return () => {
        cancelled = true
        unwrapMarks(marksRef.current)
        marksRef.current = []
      }
    }

    // Sonst: MutationObserver setzt auf DOM-Aenderungen im Container.
    // Bei async geladenen Inhalten (z.B. Summaries via N HTTP-Requests)
    // feuert der Observer sobald neue Knoten erscheinen — viel robuster als
    // rAF-Polling mit hartem Timeout.
    observer = new MutationObserver(() => { attempt() })
    observer.observe(container, {
      childList: true, subtree: true, characterData: true,
    })

    // Safety-Net: nach timeoutMs aufgeben, falls der Content nie kommt
    // (z.B. falsche URL, Concept-Name passt nicht zum Wortlaut).
    timeoutId = setTimeout(() => {
      if (!done && observer) {
        observer.disconnect()
        observer = null
      }
    }, timeoutMs)

    return () => {
      cancelled = true
      if (observer) observer.disconnect()
      if (timeoutId) clearTimeout(timeoutId)
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
