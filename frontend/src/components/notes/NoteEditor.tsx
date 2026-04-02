// NoteEditor — TipTap Rich-Text Editor für Notizen
// Toolbar: Bold, Italic, Headings, Listen, Checkboxen, Code-Blöcke
// Markdown-Shortcuts aktiv (z.B. **text** → bold, # → Heading)
// Auto-Save wird vom Parent via onChange getriggert

import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { useLanguage } from '../../hooks/useLanguage'

interface NoteEditorProps {
  title: string
  content: string
  saving: boolean
  savedMsg: boolean
  onTitleChange: (title: string) => void
  onContentChange: (content: string) => void
}

// Toolbar-Button Komponente (wiederverwendbar)
function TBtn({
  active, onClick, children, title,
}: {
  active?: boolean; onClick: () => void; children: React.ReactNode; title: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="px-2 py-1 rounded text-xs transition-all duration-200"
      style={{
        color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
        background: active ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
      }}
    >
      {children}
    </button>
  )
}

function NoteEditor({
  title, content, saving, savedMsg, onTitleChange, onContentChange,
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
      <div
        className="flex flex-wrap gap-0.5 px-1 py-1.5 mb-3 border-b"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <TBtn
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          B
        </TBtn>
        <TBtn
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          I
        </TBtn>
        <TBtn
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          S
        </TBtn>

        {/* Trennstrich */}
        <span
          className="mx-1 w-px self-stretch"
          style={{ background: 'var(--color-border)' }}
        />

        <TBtn
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
        >
          H1
        </TBtn>
        <TBtn
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          H2
        </TBtn>
        <TBtn
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
        >
          H3
        </TBtn>

        <span
          className="mx-1 w-px self-stretch"
          style={{ background: 'var(--color-border)' }}
        />

        <TBtn
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet List"
        >
          &#8226; List
        </TBtn>
        <TBtn
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered List"
        >
          1. List
        </TBtn>
        <TBtn
          active={editor.isActive('taskList')}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          title="Checklist"
        >
          &#9744; Check
        </TBtn>

        <span
          className="mx-1 w-px self-stretch"
          style={{ background: 'var(--color-border)' }}
        />

        <TBtn
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="Code Block"
        >
          {'</>'}
        </TBtn>
        <TBtn
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Quote"
        >
          &#8220;
        </TBtn>
        <TBtn
          active={false}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Divider"
        >
          &#8212;
        </TBtn>
      </div>

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
