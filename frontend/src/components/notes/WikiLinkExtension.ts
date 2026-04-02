// WikiLinkExtension — TipTap Extension für [[Wiki-Links]]
// Erkennt [[Notiz-Titel]] im Text und rendert sie als klickbare Links
// Verwendet InputRule für Live-Erkennung beim Tippen
// onClick-Handler wird vom Editor-Parent via Extension-Option übergeben

import { Mark, mergeAttributes } from '@tiptap/core'
import { InputRule } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

// Regex: erkennt [[beliebiger Text]] im Eingabefluss
const WIKI_LINK_INPUT_REGEX = /\[\[([^\]]+)\]\]$/

// Regex: erkennt [[beliebiger Text]] im bestehenden Content (Paste)
const WIKI_LINK_PASTE_REGEX = /\[\[([^\]]+)\]\]/g

/**
 * WikiLink Mark — rendert [[Text]] als klickbaren Link
 * Optionen:
 *   onWikiLinkClick: (title: string) => void — Callback beim Klick
 */
const WikiLink = Mark.create({
  name: 'wikiLink',

  // Attribute: Der Titel der verlinkten Notiz
  addAttributes() {
    return {
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-wiki-title'),
        renderHTML: (attrs) => ({ 'data-wiki-title': attrs.title }),
      },
    }
  },

  // HTML-Parsing: data-wiki-link Elemente erkennen
  parseHTML() {
    return [{ tag: 'span[data-wiki-link]' }]
  },

  // HTML-Rendering: Als Span mit Styling-Klasse
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-wiki-link': '',
        class: 'wiki-link',
      }),
      0,
    ]
  },

  // InputRule: [[Text]] beim Tippen automatisch in WikiLink umwandeln
  addInputRules() {
    return [
      new InputRule({
        find: WIKI_LINK_INPUT_REGEX,
        handler: ({ state, range, match }) => {
          const title = match[1]
          const { tr } = state
          // Altes [[Text]] durch markierten Text ersetzen
          tr.replaceWith(
            range.from,
            range.to,
            state.schema.text(title, [
              state.schema.marks.wikiLink.create({ title }),
            ])
          )
        },
      }),
    ]
  },

  // PasteRule: [[Text]] im eingefügten Content erkennen
  addPasteRules() {
    return []
  },

  // Klick-Handler via ProseMirror Plugin
  addProseMirrorPlugins() {
    const extensionThis = this
    return [
      new Plugin({
        key: new PluginKey('wikiLinkClick'),
        props: {
          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement
            // Prüfen ob auf einen WikiLink geklickt wurde
            if (target.hasAttribute('data-wiki-link')) {
              const title = target.getAttribute('data-wiki-title')
              if (title) {
                const onClick = extensionThis.options.onWikiLinkClick
                if (typeof onClick === 'function') {
                  onClick(title)
                  return true
                }
              }
            }
            return false
          },
        },
      }),
    ]
  },
})

export default WikiLink
export { WIKI_LINK_PASTE_REGEX }
