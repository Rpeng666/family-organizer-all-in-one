export type FocusPanelItem =
    | { kind: 'rich_text'; fieldId: string; label: string; taskId: string; content: string; onContentChange: (html: string) => void }
    | { kind: 'attachment'; url: string; name: string; type: string; label: string }
    | { kind: 'notes'; text: string; label: string };

export type FocusPanelState =
    | { mode: 'closed' }
    | { mode: 'focus'; item: FocusPanelItem }
    | { mode: 'split'; left: FocusPanelItem; right: FocusPanelItem | null };

export interface FocusableItem {
    kind: FocusPanelItem['kind'];
    id: string;
    label: string;
    description?: string;
    thumbnailUrl?: string;
}
