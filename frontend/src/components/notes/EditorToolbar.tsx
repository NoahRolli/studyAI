// EditorToolbar — Toolbar für den TipTap Rich-Text Editor
// Ausgelagert aus NoteEditor um die 200-Zeilen-Grenze einzuhalten
// Buttons: Bold, Italic, Strike, H1-H3, Listen, Checkboxen, Code, Zitat, Trennlinie

import type { Editor } from '@tiptap/react'

interface EditorToolbarProps {
  editor: Editor
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

// Trennstrich zwischen Button-Gruppen
function Sep() {
  return (
    <span
      className="mx-1 w-px self-stretch"
      style={{ background: 'var(--color-border)' }}
    />
  )
}

function EditorToolbar({ editor }: EditorToolbarProps) {
  return (
    <div
      className="flex flex-wrap gap-0.5 px-1 py-1.5 mb-3 border-b"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {/* Text-Formatierung */}
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

      <Sep />

      {/* Headings */}
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

      <Sep />

      {/* Listen */}
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

      <Sep />

      {/* Code, Zitat, Trennlinie */}
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
  )
}

export default EditorToolbar
