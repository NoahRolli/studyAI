// SummaryEditor — TipTap Editor für Zusammenfassungen
// Leichtgewichtig: Bold, Italic, Headings, Listen
// Auto-Save nach 1.5s Inaktivität

import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { put } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'

interface Props {
  summaryId: number
  content: string
  onClose: () => void
  onSaved: () => void
}

export default function SummaryEditor({ summaryId, content, onClose, onSaved }: Props) {
  const { t } = useLanguage()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestHtml = useRef(content)

  // Speichern via API
  const saveContent = useCallback(async (html: string) => {
    try {
      setSaving(true)
      await put(`/api/summaries/${summaryId}`, { content: html })
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
      onSaved()
    } catch (err) {
      console.error('Summary speichern fehlgeschlagen:', err)
    } finally { setSaving(false) }
  }, [summaryId, onSaved])

  // TipTap Editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    ],
    content: content || '',
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      latestHtml.current = html
      // Auto-Save nach 1.5s
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => saveContent(html), 1500)
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm prose-invert max-w-none outline-none min-h-[120px]',
      },
    },
  })

  // Cleanup Timer
  useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [])

  if (!editor) return null

  return (
    <div className="mt-2">
      {/* Mini-Toolbar */}
      <div className="flex items-center gap-1 mb-2 pb-2"
        style={{ borderBottom: '1px solid var(--color-border)' }}>
        <button onClick={() => editor.chain().focus().toggleBold().run()}
          className={`px-2 py-0.5 rounded text-xs transition-colors ${
            editor.isActive('bold') ? 'bg-[var(--color-active-bg)] text-[var(--color-primary)]'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}`}>
          B
        </button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`px-2 py-0.5 rounded text-xs italic transition-colors ${
            editor.isActive('italic') ? 'bg-[var(--color-active-bg)] text-[var(--color-primary)]'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}`}>
          I
        </button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`px-2 py-0.5 rounded text-xs transition-colors ${
            editor.isActive('heading', { level: 2 }) ? 'bg-[var(--color-active-bg)] text-[var(--color-primary)]'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}`}>
          H2
        </button>
        <button onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`px-2 py-0.5 rounded text-xs transition-colors ${
            editor.isActive('bulletList') ? 'bg-[var(--color-active-bg)] text-[var(--color-primary)]'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}`}>
          List
        </button>
        <div className="ml-auto flex items-center gap-2">
          {saving && <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Saving...</span>}
          {saved && !saving && <span className="text-xs" style={{ color: 'var(--color-success)' }}>
            {t.notes.saved}</span>}
          <button onClick={onClose}
            className="text-xs px-2 py-0.5 rounded transition-colors
              text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
            {t.common.close}
          </button>
        </div>
      </div>
      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  )
}
