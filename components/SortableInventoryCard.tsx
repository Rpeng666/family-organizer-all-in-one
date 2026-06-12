import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { GripVertical } from 'lucide-react';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { DropIndicator } from '@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/box';
import { type Edge, attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import invariant from 'tiny-invariant';

type DropIndicatorEdge = Edge | null;

interface SortableInventoryCardProps {
    itemId: string;
    index: number;
    canDrag: boolean;
    dragLabel: string;
    onOpen?: () => void;
    children: React.ReactNode;
}

export default function SortableInventoryCard({ itemId, index, canDrag, dragLabel, onOpen, children }: SortableInventoryCardProps) {
    const itemRef = useRef<HTMLDivElement>(null);
    const handleRef = useRef<HTMLButtonElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dropIndicatorEdge, setDropIndicatorEdge] = useState<DropIndicatorEdge>(null);

    useEffect(() => {
        if (!canDrag) return;

        invariant(itemRef.current);
        invariant(handleRef.current);

        const element = itemRef.current;
        const dragHandle = handleRef.current;

        const cleanupDraggable = draggable({
            element,
            dragHandle,
            getInitialData: () => ({ id: itemId, index }),
            onDragStart: () => setIsDragging(true),
            onDrop: () => setIsDragging(false),
        });

        const cleanupDropTarget = dropTargetForElements({
            element,
            getIsSticky: () => true,
            getData: ({ input, element }) => {
                const data = { id: itemId, index };
                return attachClosestEdge(data, {
                    input,
                    element,
                    allowedEdges: ['top', 'bottom'],
                });
            },
            onDrag({ self }) {
                setDropIndicatorEdge(extractClosestEdge(self.data) as DropIndicatorEdge);
            },
            onDragLeave() {
                setDropIndicatorEdge(null);
            },
            onDrop() {
                setDropIndicatorEdge(null);
            },
        });

        return () => {
            cleanupDraggable();
            cleanupDropTarget();
        };
    }, [canDrag, index, itemId]);

    return (
        <div ref={itemRef} className="relative" style={{ opacity: isDragging ? 0.45 : 1 }}>
            {dropIndicatorEdge === 'top' ? <DropIndicator edge="top" /> : null}
            <div className="flex items-stretch gap-2">
                {canDrag ? (
                    <Button ref={handleRef} type="button" variant="ghost" size="icon" className="mt-2 cursor-grab" aria-label={dragLabel}>
                        <GripVertical className="h-4 w-4" />
                    </Button>
                ) : null}
                <div className="min-w-0 flex-1">
                    {onOpen ? (
                        <button type="button" onClick={onOpen} className="w-full text-left">
                            {children}
                        </button>
                    ) : (
                        children
                    )}
                </div>
            </div>
            {dropIndicatorEdge === 'bottom' ? <DropIndicator edge="bottom" /> : null}
        </div>
    );
}
