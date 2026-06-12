// components/task-series/SlashCommand.tsx
'use client';

import React, { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import { getTaskSeriesSlashCommandItems } from './taskSeriesCommands';

// --- The Command List Component (UI) ---
const CommandList = forwardRef((props: any, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = useCallback(
        (index: number) => {
            const item = props.items[index];
            if (item) {
                props.command(item);
            }
        },
        [props]
    );

    useEffect(() => {
        setSelectedIndex(0);
    }, [props.items]);

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (event.key === 'ArrowUp') {
                setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
                return true;
            }
            if (event.key === 'ArrowDown') {
                setSelectedIndex((selectedIndex + 1) % props.items.length);
                return true;
            }
            if (event.key === 'Enter') {
                selectItem(selectedIndex);
                return true;
            }
            return false;
        },
    }));

    if (!props.items.length) {
        return null;
    }

    return (
        <div className="z-50 h-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md w-72 overflow-hidden">
            {props.items.map((item: any, index: number) => (
                <button
                    key={item.id}
                    className={`flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-sm outline-none select-none ${
                        index === selectedIndex ? 'bg-accent text-accent-foreground' : ''
                    }`}
                    onClick={() => selectItem(index)}
                >
                    <div className="flex min-w-0 items-center gap-2">
                        <div className="flex items-center justify-center border rounded w-5 h-5 bg-background">
                            <item.icon size={14} />
                        </div>
                        <span className="truncate">{item.title}</span>
                    </div>
                    {item.shortcutLabel ? <span className="shrink-0 text-xs font-medium text-muted-foreground">{item.shortcutLabel}</span> : null}
                </button>
            ))}
        </div>
    );
});

CommandList.displayName = 'CommandList';

// --- The Extension Wrapper ---
export const SlashCommand = Extension.create({
    name: 'slashCommand',

    addOptions() {
        return {
            suggestion: {
                char: '/',
                command: ({ editor, range, props }: any) => {
                    props.command({ editor, range });
                },
            },
        };
    },

    addProseMirrorPlugins() {
        return [
            Suggestion({
                editor: this.editor,
                ...this.options.suggestion,
            }),
        ];
    },
});

// --- Configuration for the Editor ---
export const slashCommandSuggestion = {
    items: getTaskSeriesSlashCommandItems,
    render: () => {
        let component: any;
        let popup: any;

        return {
            onStart: (props: any) => {
                component = new ReactRenderer(CommandList, {
                    props,
                    editor: props.editor,
                });

                if (!props.clientRect) {
                    return;
                }

                popup = tippy('body', {
                    getReferenceClientRect: props.clientRect,
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'bottom-start',
                });
            },
            onUpdate: (props: any) => {
                component.updateProps(props);
                if (!props.clientRect) {
                    return;
                }
                popup[0].setProps({
                    getReferenceClientRect: props.clientRect,
                });
            },
            onKeyDown: (props: any) => {
                if (props.event.key === 'Escape') {
                    popup[0].hide();
                    return true;
                }
                return component.ref?.onKeyDown(props);
            },
            onExit: () => {
                popup[0].destroy();
                component.destroy();
            },
        };
    },
};
