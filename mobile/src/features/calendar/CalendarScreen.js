import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { E, SP, R } from '../../theme/E';
import { useAppSession } from '../../providers/AppProviders';
import { clearPendingParentAction, getPendingParentAction } from '../../lib/session-prefs';
import { useParentActionGate } from '../../hooks/useParentActionGate';
import {
  NEPALI_MONTHS_COMMON_DEVANAGARI,
  buildMonthGrid,
  firstParam,
  formatMonthTitle,
  formatYmd,
  isImportedEvent,
  parseYmdLocal,
  startOfDay,
  startOfMonth,
  toDevanagariDigits,
  eventStartsAt,
} from './calendar-utils';
import { useCalendarData } from './useCalendarData';
import { useCalendarSettings } from './useCalendarSettings';
import { CalendarHeader } from './CalendarHeader';
import { CalendarMonthView } from './CalendarMonthView';
import { CalendarDayView } from './CalendarDayView';
import { CalendarAgendaView } from './CalendarAgendaView';
import { CalendarEventEditSheet } from './CalendarEventEditSheet';
import { CalendarEventDetailSheet } from './CalendarEventDetailSheet';
import { CalendarFilterSheet } from './CalendarFilterSheet';
import { CalendarSettingsSheet } from './CalendarSettingsSheet';
import { CalendarRecurrenceScopeSheet } from './CalendarRecurrenceScopeSheet';
import { CalendarDragProvider } from './CalendarDragProvider';
import { buildMoveEventTransactions, executeCalendarMutation } from './calendar-mutations';

const _NepaliDateMod = require('nepali-date-converter');
const NepaliDate = _NepaliDateMod.default || _NepaliDateMod;

function getBsPeriodLabel(date) {
  try {
    const nepali = new NepaliDate(date);
    const monthName = NEPALI_MONTHS_COMMON_DEVANAGARI[nepali.getMonth()] || '';
    const year = toDevanagariDigits(nepali.getYear());
    return `${monthName} ${year}`;
  } catch {
    return '';
  }
}

export function CalendarScreen() {
  const searchParams = useLocalSearchParams();
  const { requireParentAction } = useParentActionGate();
  const {
    db,
    isAuthenticated,
    instantReady,
    principalType,
    currentUser,
    recordParentActivity,
  } = useAppSession();

  const settings = useCalendarSettings();

  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current) return;
    deepLinkApplied.current = true;

    const paramView = firstParam(searchParams.view);
    if (paramView === 'month' || paramView === 'day' || paramView === 'agenda') {
      settings.setViewMode(paramView);
    }

    const paramDays = firstParam(searchParams.days);
    if (paramDays) {
      const n = parseInt(paramDays, 10);
      if (!isNaN(n) && n >= 1 && n <= 14) settings.setVisibleDayCount(n);
    }

    const paramDate = firstParam(searchParams.date);
    if (paramDate) {
      const parsed = parseYmdLocal(paramDate);
      if (parsed) {
        setSelectedDate(parsed);
        setViewMonth(startOfMonth(parsed));
      }
    }
  }, []);

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));

  const [editSheetVisible, setEditSheetVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);

  const [detailSheetVisible, setDetailSheetVisible] = useState(false);
  const [detailEvent, setDetailEvent] = useState(null);

  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [settingsSheetVisible, setSettingsSheetVisible] = useState(false);
  const [textQuery, setTextQuery] = useState('');

  const [scopeSheetVisible, setScopeSheetVisible] = useState(false);
  const [scopeSheetAction, setScopeSheetAction] = useState('Edit');
  const [pendingScopeCallback, setPendingScopeCallback] = useState(null);

  const [resumePendingAction, setResumePendingAction] = useState(null);
  const [handledResumeNonce, setHandledResumeNonce] = useState('');

  const canEditEvents = principalType === 'parent';
  const viewMode = settings.viewMode;

  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  const {
    calendarItems,
    eventsByDayKey,
    familyMembers,
    availableCalendarTags,
    isLoading,
    error,
  } = useCalendarData({
    db,
    isAuthenticated,
    instantReady,
    anchorDate: viewMonth,
    visibleDays: grid.days,
  });

  const selectedDayKey = formatYmd(selectedDate);
  const selectedDayEvents = eventsByDayKey.get(selectedDayKey) || [];

  const periodLabel = useMemo(() => formatMonthTitle(viewMonth), [viewMonth]);
  const periodLabelSecondary = useMemo(() => {
    if (!settings.showBs) return '';
    return getBsPeriodLabel(viewMonth);
  }, [viewMonth, settings.showBs]);

  const isTodayVisible = useMemo(() => {
    const today = startOfDay(new Date());
    return viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() === today.getMonth();
  }, [viewMonth]);

  const hasActiveFilters = settings.excludedMemberIds.length > 0 || settings.excludedTagIds.length > 0;

  function handleSelectDate(day) {
    setSelectedDate(startOfDay(day));
    recordParentActivity();
  }

  function handleViewModeChange(mode) {
    settings.setViewMode(mode);
    recordParentActivity();
  }

  function handleTodayPress() {
    recordParentActivity();
    const today = startOfDay(new Date());
    setViewMonth(startOfMonth(today));
    setSelectedDate(today);
  }

  function handlePrevMonth() {
    recordParentActivity();
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  function handleNextMonth() {
    recordParentActivity();
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  const openNewEventModal = useCallback((date) => {
    setEditingEvent(null);
    setEditSheetVisible(true);
  }, []);

  const openEditEventModal = useCallback((event) => {
    setEditingEvent(event);
    setEditSheetVisible(true);
  }, []);

  function closeEditSheet() {
    setEditSheetVisible(false);
    setEditingEvent(null);
  }

  async function handoffToParentLogin(actionId, actionLabel, payload = {}) {
    await requireParentAction({ actionId, actionLabel, payload, returnPath: '/calendar' });
  }

  async function handleAddEventPress(day) {
    recordParentActivity();
    if (!canEditEvents) {
      await handoffToParentLogin('calendar:add-selected-day', 'Add calendar event', {
        selectedDayKey: formatYmd(day || selectedDate || new Date()),
      });
      return;
    }
    openNewEventModal(day || selectedDate);
  }

  function handleOpenEventPress(event) {
    recordParentActivity();
    setDetailEvent(event);
    setDetailSheetVisible(true);
  }

  function closeDetailSheet() {
    setDetailSheetVisible(false);
    setDetailEvent(null);
  }

  async function handleEditFromDetail(event) {
    if (!canEditEvents) {
      await handoffToParentLogin('calendar:edit-event', 'Edit calendar event', { eventId: event.id, selectedDayKey });
      return;
    }
    openEditEventModal(event);
  }

  function handleEventSaved(startDate) {
    if (startDate) setSelectedDate(startDate);
  }

  function requestRecurrenceScope(actionLabel, callback) {
    setScopeSheetAction(actionLabel);
    setPendingScopeCallback(() => callback);
    setScopeSheetVisible(true);
  }

  function handleScopeSelected(scope) {
    if (pendingScopeCallback) pendingScopeCallback(scope);
    setPendingScopeCallback(null);
  }

  function closeScopeSheet() {
    setScopeSheetVisible(false);
    setPendingScopeCallback(null);
  }

  const handleDragDrop = useCallback(async ({ event, targetDayKey, targetMinute }) => {
    if (!canEditEvents || !db) return;
    recordParentActivity();

    const targetDate = parseYmdLocal(targetDayKey);
    if (!targetDate) return;

    const oldStart = eventStartsAt(event);
    if (!oldStart) return;

    let newStartDate;
    if (event.isAllDay) {
      newStartDate = targetDate;
    } else if (targetMinute != null) {
      newStartDate = new Date(targetDate);
      newStartDate.setHours(Math.floor(targetMinute / 60), targetMinute % 60, 0, 0);
    } else {
      newStartDate = new Date(targetDate);
      newStartDate.setHours(oldStart.getHours(), oldStart.getMinutes(), oldStart.getSeconds(), 0);
    }

    const isRecurring = !!(event.rrule || (event.recurrenceLines && event.recurrenceLines.length > 0));

    const doMove = async (scope) => {
      try {
        const { txOps } = buildMoveEventTransactions({
          event, newStartDate, newEndDate: null, scope,
          currentUserId: currentUser?.id || null,
        });
        await executeCalendarMutation(db, txOps);
      } catch (err) {
        // silent — event snaps back
      }
    };

    if (isRecurring) {
      requestRecurrenceScope('Move', (scope) => { void doMove(scope); });
    } else {
      await doMove(null);
    }
  }, [canEditEvents, db, currentUser?.id, recordParentActivity]);

  useEffect(() => {
    const shouldResume = firstParam(searchParams.resumeParentAction) === '1';
    const resumeNonce = String(firstParam(searchParams.resumeNonce) || '');
    if (!shouldResume || !resumeNonce || resumeNonce === handledResumeNonce) return;

    let cancelled = false;
    async function loadPendingAction() {
      const pending = await getPendingParentAction();
      if (cancelled) return;
      setHandledResumeNonce(resumeNonce);
      if (pending?.actionId?.startsWith('calendar:')) setResumePendingAction(pending);
    }

    void loadPendingAction();
    return () => { cancelled = true; };
  }, [handledResumeNonce, searchParams.resumeParentAction, searchParams.resumeNonce]);

  useEffect(() => {
    if (!resumePendingAction) return;
    if (!isAuthenticated || principalType !== 'parent') return;

    const actionId = resumePendingAction.actionId;
    const payload = resumePendingAction.payload || {};
    const clearResume = async () => {
      await clearPendingParentAction();
      setResumePendingAction(null);
    };

    if (actionId === 'calendar:add-selected-day') {
      const resumeDate = parseYmdLocal(payload.selectedDayKey) || selectedDate;
      setSelectedDate(startOfDay(resumeDate));
      setViewMonth(startOfMonth(resumeDate));
      openNewEventModal(resumeDate);
      void clearResume();
      return;
    }

    if (actionId === 'calendar:edit-event') {
      const eventId = payload.eventId;
      const event = calendarItems.find((item) => item.id === eventId);
      if (!event) {
        if (isLoading) return;
        const fallbackDate = parseYmdLocal(payload.selectedDayKey) || selectedDate;
        setSelectedDate(startOfDay(fallbackDate));
        setViewMonth(startOfMonth(fallbackDate));
        openNewEventModal(fallbackDate);
        void clearResume();
        return;
      }
      const eventStart = eventStartsAt(event) || selectedDate;
      setSelectedDate(startOfDay(eventStart));
      setViewMonth(startOfMonth(eventStart));
      openEditEventModal(event);
      void clearResume();
      return;
    }

    void clearResume();
  }, [calendarItems, isLoading, isAuthenticated, openEditEventModal, openNewEventModal, principalType, resumePendingAction, selectedDate]);

  function renderActiveView() {
    switch (viewMode) {
      case 'day':
        return (
          <CalendarDayView
            visibleDayCount={settings.visibleDayCount}
            dayRowCount={settings.dayRowCount}
            hourHeight={settings.dayHourHeight}
            anchorDate={selectedDate}
            onAnchorDateChange={(d) => { setSelectedDate(d); setViewMonth(startOfMonth(d)); }}
            calendarItems={calendarItems}
            onEventPress={handleOpenEventPress}
            onAddEventPress={handleAddEventPress}
            canEditEvents={canEditEvents}
          />
        );
      case 'agenda':
        return (
          <CalendarAgendaView
            anchorDate={selectedDate}
            calendarItems={calendarItems}
            onEventPress={handleOpenEventPress}
            onAddEventPress={handleAddEventPress}
            canEditEvents={canEditEvents}
          />
        );
      case 'month':
      default:
        return (
          <ScrollView
            style={s.monthScroll}
            contentContainerStyle={s.monthScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <CalendarMonthView
              grid={grid}
              viewMonth={viewMonth}
              selectedDate={selectedDate}
              selectedDayKey={selectedDayKey}
              eventsByDayKey={eventsByDayKey}
              selectedDayEvents={selectedDayEvents}
              canEditEvents={canEditEvents}
              isLoading={isLoading}
              error={error}
              currentUser={currentUser}
              onSelectDate={handleSelectDate}
              onAddEvent={handleAddEventPress}
              onOpenEvent={handleOpenEventPress}
              onPrevMonth={handlePrevMonth}
              onNextMonth={handleNextMonth}
            />
          </ScrollView>
        );
    }
  }

  return (
    <SafeAreaView style={s.safeArea}>
      <View style={s.container}>
        <CalendarHeader
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          periodLabel={periodLabel}
          periodLabelSecondary={periodLabelSecondary}
          showTodayButton={!isTodayVisible}
          onTodayPress={handleTodayPress}
          hasActiveFilters={hasActiveFilters}
          onFilterPress={() => setFilterSheetVisible(true)}
          onSettingsPress={() => setSettingsSheetVisible(true)}
        />

        <CalendarDragProvider enabled={canEditEvents} onDrop={handleDragDrop}>
          <View style={s.viewContainer}>
            {renderActiveView()}
          </View>
        </CalendarDragProvider>
      </View>

      <CalendarEventDetailSheet
        visible={detailSheetVisible}
        onClose={closeDetailSheet}
        event={detailEvent}
        canEditEvents={canEditEvents}
        onEditPress={handleEditFromDetail}
      />

      <CalendarEventEditSheet
        visible={editSheetVisible}
        onClose={closeEditSheet}
        editingEvent={editingEvent}
        selectedDate={selectedDate}
        canEditEvents={canEditEvents}
        db={db}
        currentUser={currentUser}
        recordParentActivity={recordParentActivity}
        availableCalendarTags={availableCalendarTags}
        onSaved={handleEventSaved}
      />

      <CalendarFilterSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
        familyMembers={familyMembers}
        availableCalendarTags={availableCalendarTags}
        excludedMemberIds={settings.excludedMemberIds}
        onExcludedMemberIdsChange={settings.setExcludedMemberIds}
        excludedTagIds={settings.excludedTagIds}
        onExcludedTagIdsChange={settings.setExcludedTagIds}
        textQuery={textQuery}
        onTextQueryChange={setTextQuery}
      />

      <CalendarSettingsSheet
        visible={settingsSheetVisible}
        onClose={() => setSettingsSheetVisible(false)}
        settings={settings}
      />

      <CalendarRecurrenceScopeSheet
        visible={scopeSheetVisible}
        onClose={closeScopeSheet}
        onSelect={handleScopeSelected}
        actionLabel={scopeSheetAction}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea:         { flex: 1, backgroundColor: E.bg },
  container:        { flex: 1 },
  viewContainer:    { flex: 1 },
  monthScroll:      { flex: 1 },
  monthScrollContent:{ paddingHorizontal: SP.sm, paddingBottom: SP.xl, gap: SP.md },
});
