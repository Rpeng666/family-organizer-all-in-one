'use client';

import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
    Bold,
    Italic,
    Strikethrough,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Quote,
    Maximize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
    content: string;
    onContentChange: (html: string) => void;
    disabled?: boolean;
    className?: string;
    placeholder?: string;
    onExpand?: () => void;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
    content,
    onContentChange,
    disabled,
    className,
    placeholder = 'Your response',
    onExpand,
}) => {
    const lastEmittedRef = useRef<string>(content || '');

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: { levels: [2, 3] },
                codeBlock: false,
                horizontalRule: false,
            }),
            Placeholder.configure({
                placeholder,
            }),
        ],
        content: content || '',
        editable: !disabled,
        editorProps: {
            attributes: {
                class: 'response-editor-content min-h-[120px] max-h-[400px] overflow-y-auto px-3 py-2 text-sm text-slate-900 focus:outline-none',
            },
        },
        onUpdate: ({ editor }) => {
            const html = editor.getHTML();
            lastEmittedRef.current = html;
            onContentChange(html);
        },
    });

    // Sync external content changes without resetting cursor
    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        if (content !== lastEmittedRef.current) {
            lastEmittedRef.current = content || '';
            editor.commands.setContent(content || '', { emitUpdate: false });
        }
    }, [content, editor]);

    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        editor.setEditable(!disabled);
    }, [disabled, editor]);

    if (!editor) return null;

    return (
        <div className={cn('response-editor rounded-lg border border-slate-200 bg-white overflow-hidden', className)}>
            <div className="flex items-center gap-0.5 border-b border-slate-100 bg-slate-50/80 px-1.5 py-1">
                <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} icon={<Bold className="h-3.5 w-3.5" />} title="Bold" />
                <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} icon={<Italic className="h-3.5 w-3.5" />} title="Italic" />
                <ToolbarButton active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} icon={<Strikethrough className="h-3.5 w-3.5" />} title="Strikethrough" />
                <Separator />
                <ToolbarButton active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} icon={<Heading2 className="h-3.5 w-3.5" />} title="Heading 2" />
                <ToolbarButton active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} icon={<Heading3 className="h-3.5 w-3.5" />} title="Heading 3" />
                <Separator />
                <ToolbarButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} icon={<List className="h-3.5 w-3.5" />} title="Bullet list" />
                <ToolbarButton active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} icon={<ListOrdered className="h-3.5 w-3.5" />} title="Ordered list" />
                <ToolbarButton active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} icon={<Quote className="h-3.5 w-3.5" />} title="Blockquote" />
                <div className="flex-1" />
                {onExpand && (
                    <ToolbarButton onClick={onExpand} icon={<Maximize2 className="h-3.5 w-3.5" />} title="Expand editor" />
                )}
            </div>
            <EditorContent editor={editor} />
        </div>
    );
};

function ToolbarButton({ active, onClick, icon, title }: { active?: boolean; onClick: () => void; icon: React.ReactNode; title: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={cn(
                'rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800',
                active && 'bg-slate-200 text-slate-800'
            )}
        >
            {icon}
        </button>
    );
}

function Separator() {
    return <div className="mx-0.5 h-4 w-px bg-slate-200" />;
}
