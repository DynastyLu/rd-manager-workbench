import { useEffect } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'

type RichTextEditorProps = {
  value: Record<string, unknown>
  onChange: (content: Record<string, unknown>, plainText: string) => void
  readOnly?: boolean
  placeholder?: string
}

const EMPTY_DOCUMENT = { type: 'doc', content: [{ type: 'paragraph' }] }

export function RichTextEditor({
  value,
  onChange,
  readOnly = false,
  placeholder = '输入正文，支持 Markdown 快捷输入…',
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: Object.keys(value).length ? value : EMPTY_DOCUMENT,
    onUpdate: ({ editor: activeEditor }) => {
      onChange(activeEditor.getJSON() as Record<string, unknown>, activeEditor.getText())
    },
  })

  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  useEffect(() => {
    if (!editor || editor.isFocused) return
    const next = Object.keys(value).length ? value : EMPTY_DOCUMENT
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) {
      editor.commands.setContent(next)
    }
  }, [editor, value])

  if (!editor) return <div className="content-editor__loading">正在加载编辑器…</div>

  return (
    <div className="content-editor">
      {!readOnly ? (
        <div className="content-editor__toolbar" role="toolbar" aria-label="文档格式工具栏">
          <button type="button" aria-label="正文" data-active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()}>正文</button>
          <button type="button" aria-label="一级标题" data-active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</button>
          <button type="button" aria-label="二级标题" data-active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
          <span />
          <button type="button" aria-label="粗体" data-active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></button>
          <button type="button" aria-label="斜体" data-active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></button>
          <button type="button" aria-label="无序列表" data-active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>• 列表</button>
          <button type="button" aria-label="有序列表" data-active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. 列表</button>
          <button type="button" aria-label="待办列表" data-active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}>☑ 待办</button>
          <button type="button" aria-label="引用" data-active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>引用</button>
          <button type="button" aria-label="代码块" data-active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>&lt;/&gt;</button>
        </div>
      ) : null}
      <EditorContent editor={editor} className="content-editor__surface" />
    </div>
  )
}

export default RichTextEditor
