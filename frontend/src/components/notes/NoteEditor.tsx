// NoteEditor — TipTap Rich-Text Editor für Notizen
// Toolbar: Bold, Italic, Headings, Listen, Checkboxen, Code-Blöcke
// WikiLink Extension: [[Notiz-Titel]] wird als klickbarer Link gerendert
// TaskSort Extension: Erledigte Checkboxen sortieren nach oben
// Collapse-Toggle: Erledigte Items ein-/ausklappbar
// Auto-Save wird vom Parent via onChange getriggert

import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import WikiLink from './WikiLinkExtension'
import TaskSortExtension from './TaskSortExtension'
import { useLanguage } from '../../hooks/useLanguage'
import EditorToolbar from './EditorToolbar'

interface NoteEditorProps {
  title: string
  content: string
  saving: boolean
  savedMsg: boolean
  onTitleChange: (title: string) => void
  onContentChange: (content: string) => void
  onWikiLinkClick: (title: string) => void
}

// Zählt checked TaskItems im HTML-String
function countChecked(html: string): number {
  return (html.match(/data-checked="true"/g) || []).length
}

function NoteEditor({
  title, content, saving, savedMsg,
  onTitleChange, onContentChange, onWikiLinkClick,
}: NoteEditorProps) {
  const { t } = useLanguage()
  const [collapsed, setCollapsed] = useState(true)
  const [checkedCount, setCheckedCount] = useState(0)

  // TipTap Editor Instanz mit Extensions
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: '[[Link zu anderer Notiz]]...',
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false }),
      WikiLink.configure({ onWikiLinkClick }),
      TaskSortExtension,
    ],
    content: content || '',
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      onContentChange(html)
      setCheckedCount(countChecked(html))
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm prose-invert max-w-none outline-none min-h-[200px]',
      },
    },
  })

  // Content synchronisieren wenn andere Notiz gewählt wird
  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content || '')
      setCheckedCount(countChecked(content || ''))
    }
  }, [content, editor])

  // WikiLink-Callback aktualisieren
  useEffect(() => {
    if (editor) {
      editor.extensionManager.extensions.forEach((ext) => {
        if (ext.name === 'wikiLink') {
          ext.options.onWikiLinkClick = onWikiLinkClick
        }
      })
    }
  }, [editor, onWikiLinkClick])

  if (!editor) return null

  return (
    <>
      {/* Titel-Eingabe */}
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        className="bg-transparent border-none outline-none text-xl font-bold
          mb-2 px-1"
        style={{
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-heading)',
        }}
      />

      {/* Toolbar */}
      <EditorToolbar editor={editor} />

      {/* Erledigte Tasks Toggle */}
      {checkedCount > 0 && (
        <button
          onClick={() => setCollapsed(prev => !prev)}
          className="flex items-center gap-2 px-2 py-1 mb-2 text-xs rounded
            transition-all duration-200 hover:bg-[rgba(0,212,255,0.05)]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <span style={{
            display: 'inline-block',
            transition: 'transform 0.2s',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            fontSize: '0.6rem',
          }}>
            &#9660;
          </span>
          {checkedCount} erledigt
        </button>
      )}

      {/* Editor-Fläche mit optionalem Collapse */}
      <div className={`flex-1 overflow-y-auto px-1 ${
        collapsed && checkedCount > 0 ? 'task-checked-collapsed' : ''
      }`}>
        <EditorContent editor={editor} />
      </div>

      {/* Status-Zeile */}
      <div
        className="flex items-center justify-end pt-2 mt-2 border-t text-xs"
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-muted)',
        }}
      >
        {saving && 'Saving...'}
        {savedMsg && !saving && t.notes.saved}
      </div>
    </>
  )
}

export default NoteEditor
