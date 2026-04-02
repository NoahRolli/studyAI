// NoteEditor — TipTap Rich-Text Editor für Notizen
// Toolbar: Bold, Italic, Headings, Listen, Checkboxen, Code-Blöcke
// WikiLink Extension: [[Notiz-Titel]] wird als klickbarer Link gerendert
// Markdown-Shortcuts aktiv (z.B. **text** → bold, # → Heading)
// Auto-Save wird vom Parent via onChange getriggert

import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import WikiLink from './WikiLinkExtension'
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

function NoteEditor({
  title, content, saving, savedMsg,
  onTitleChange, onContentChange, onWikiLinkClick,
}: NoteEditorProps) {
  const { t } = useLanguage()

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
    ],
    content: content || '',
    // onChange → Parent benachrichtigen für Auto-Save
    onUpdate: ({ editor: ed }) => {
      onContentChange(ed.getHTML())
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
    }
  }, [content, editor])

  // WikiLink-Callback aktualisieren wenn sich die Referenz ändert
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

      {/* Toolbar — ausgelagerte Komponente */}
      <EditorToolbar editor={editor} />

      {/* Editor-Fläche */}
      <div className="flex-1 overflow-y-auto px-1">
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
