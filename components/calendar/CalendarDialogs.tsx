'use client';

import React from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import CalendarAgendaView from '@/components/CalendarAgendaView';
import CalendarEventDetailDialog from '@/components/CalendarEventDetailDialog';
import ChoreDetailDialog from '@/components/ChoreDetailDialog';
import AddEventForm, { type CalendarDraftSelection } from '@/components/AddEvent';
import { type CalendarItem } from '@/components/DraggableCalendarEvent';
import { type CalendarAgendaDisplaySettings, type CalendarLiveSearchState } from '@/lib/calendar-controls';
import { type CalendarAgendaSection } from '@/lib/calendar-search';
import { type RecurrenceEditScope } from '@/components/RecurrenceScopeDialog';

interface CalendarDialogsProps {
    // Search drawer
    showSearchResultsDrawer: boolean;
    searchState: CalendarLiveSearchState;
    setSearchState: React.Dispatch<React.SetStateAction<CalendarLiveSearchState>>;
    searchResultSections: CalendarAgendaSection[];
    agendaDisplay: CalendarAgendaDisplaySettings;
    selectedEventKey: string | null;
    normalizedLiveSearchQuery: string;
    handleCalendarResultDateClick: (dateKey: string) => void;
    handleCalendarResultClick: (event: React.MouseEvent<HTMLButtonElement>, item: CalendarItem) => void;
    handleSearchReachStart: () => void;
    handleSearchReachEnd: () => void;

    // Event detail
    selectedEvent: CalendarItem | null;
    eventDetailOpen: boolean;
    handleEventDetailClose: () => void;
    handleEventDetailEdit: () => void;

    // Chore detail
    chores: Array<{ id: string; title?: string | null; [key: string]: unknown }>;
    familyMembers: Array<{ id: string; name?: string | null }>;
    choreDetailChoreId: string | null;
    choreDetailDate: Date | null;
    handleChoreDetailClose: (open: boolean) => void;
    handleChoreDetailEdit: () => void;

    // Add/edit event modal
    isModalOpen: boolean;
    handleCloseModal: () => void;
    selectedDate: Date | null;
    initialDraftSelection: CalendarDraftSelection | null;
    calendarItems: CalendarItem[];
    applyOptimisticCalendarItem: (item: CalendarItem) => () => void;

    // Delete confirm
    deleteConfirmOpen: boolean;
    setDeleteConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>;
    handleDeleteByScope: (scope: RecurrenceEditScope) => Promise<void>;
}

export function CalendarDialogs({
    showSearchResultsDrawer,
    searchState,
    setSearchState,
    searchResultSections,
    agendaDisplay,
    selectedEventKey,
    normalizedLiveSearchQuery,
    handleCalendarResultDateClick,
    handleCalendarResultClick,
    handleSearchReachStart,
    handleSearchReachEnd,
    selectedEvent,
    eventDetailOpen,
    handleEventDetailClose,
    handleEventDetailEdit,
    chores,
    familyMembers,
    choreDetailChoreId,
    choreDetailDate,
    handleChoreDetailClose,
    handleChoreDetailEdit,
    isModalOpen,
    handleCloseModal,
    selectedDate,
    initialDraftSelection,
    calendarItems,
    applyOptimisticCalendarItem,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    handleDeleteByScope,
}: CalendarDialogsProps) {
    return (
        <>
            <Dialog
                open={showSearchResultsDrawer}
                onOpenChange={(open) => {
                    setSearchState((current) => ({ ...current, isOpen: open }));
                }}
            >
                <DialogContent className="max-h-[82vh] overflow-hidden sm:max-w-3xl">
                    <DialogTitle>Search results</DialogTitle>
                    <div className="h-[70vh] min-h-0">
                        <CalendarAgendaView
                            sections={searchResultSections}
                            display={agendaDisplay}
                            selectedItemKey={selectedEventKey}
                            onDateClick={handleCalendarResultDateClick}
                            onItemClick={handleCalendarResultClick}
                            onReachStart={handleSearchReachStart}
                            onReachEnd={handleSearchReachEnd}
                            title={null}
                            emptyState={
                                normalizedLiveSearchQuery
                                    ? 'No search hits match the current filters.'
                                    : 'Type in search to see matching results.'
                            }
                            testId="calendar-search-results-drawer"
                            className="h-full min-h-0 border-0 shadow-none"
                        />
                    </div>
                </DialogContent>
            </Dialog>

            <CalendarEventDetailDialog
                event={selectedEvent}
                open={eventDetailOpen}
                onOpenChange={(open) => {
                    if (!open) handleEventDetailClose();
                }}
                onEdit={handleEventDetailEdit}
            />

            <ChoreDetailDialog
                chore={(chores as any[]).find((c) => c.id === choreDetailChoreId) ?? null}
                familyMembers={familyMembers}
                open={choreDetailChoreId !== null}
                onOpenChange={handleChoreDetailClose}
                onEdit={handleChoreDetailEdit}
                selectedDate={choreDetailDate ?? new Date()}
                selectedMember="All"
            />

            <Dialog
                open={isModalOpen}
                onOpenChange={(open) => {
                    if (open) return;
                    handleCloseModal();
                }}
            >
                <DialogContent>
                    <DialogTitle className="sr-only">
                        {selectedEvent ? 'Edit calendar event' : 'Add calendar event'}
                    </DialogTitle>
                    <AddEventForm
                        selectedDate={selectedDate}
                        selectedEvent={selectedEvent}
                        initialDraft={initialDraftSelection}
                        allCalendarItems={calendarItems}
                        onClose={handleCloseModal}
                        onOptimisticUpsert={applyOptimisticCalendarItem}
                    />
                </DialogContent>
            </Dialog>

            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Event?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete the selected event.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(event) => {
                                event.preventDefault();
                                setDeleteConfirmOpen(false);
                                void handleDeleteByScope('single');
                            }}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
