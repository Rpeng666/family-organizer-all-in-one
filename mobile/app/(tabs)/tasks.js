import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tx } from '@instantdb/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  formatDateKeyUTC,
  getFamilyDayDateUTC,
} from '@family-organizer/shared-core';
import { AvatarPhotoImage } from '../../src/components/AvatarPhotoImage';
import { useAppSession } from '../../src/providers/AppProviders';
import { openTaskSeriesChecklist, openTaskHistory, openTaskSeriesDiscussion } from '../../src/features/task-series/navigation';
import {
  getTaskWorkflowState,
  getTaskStatusLabel,
  isActionableTask,
  isTaskDone,
} from '../../../lib/task-progress';
import {
  areTodayTasksFinished,
  buildPullForwardTransactions,
  buildUndoPullForwardTransactions,
  canPullForward,
  computeLiveProjectedEndDate,
  computePlannedEndDate,
  computeScheduleDrift,
  countCompletedTaskDayBlocks,
  countTaskDayBlocks,
  getNextPullableDate,
} from '../../../lib/task-series-schedule';
import { getTasksForDate } from '../../../lib/task-scheduler';
import { E, SP, R } from '../../src/theme/E';

function firstRef(value) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function createInitials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
}

function formatPossessive(name) {
  if (!name) return 'Tasks';
  return name.endsWith('s') ? `${name}' tasks` : `${name}'s tasks`;
}

function formatDayLabel(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

function formatMonthDay(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatLongDate(date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatWeekdayDate(date) {
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
  const monthDay = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${weekday}, ${monthDay}`;
}

function toDateKey(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function formatTaskDateLabel(value) {
  if (!value) return '';
  const parsed = new Date(`${toDateKey(value)}T00:00:00Z`);
  return parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

const FILTER_OPTIONS = [
  { key: 'active_now', label: 'Active' },
  { key: 'future', label: 'Future' },
  { key: 'finished', label: 'Finished' },
  { key: 'all', label: 'All' },
];

function buildMemberOverviewItems(seriesList, memberId, forDate) {
  const today = forDate || new Date();
  const todayKey = toDateKey(today);

  return seriesList
    .filter((series) => {
      const owner = firstRef(series.familyMember);
      return owner?.id === memberId;
    })
    .map((series) => {
      const tasks = (series.tasks || []).slice().sort((left, right) => (left.order || 0) - (right.order || 0));
      const activity = firstRef(series.scheduledActivity);
      const actionableTasks = tasks.filter((task) => isActionableTask(task, tasks));
      const totalTasks = actionableTasks.length;
      const completedTasks = actionableTasks.filter((task) => isTaskDone(task)).length;
      const totalBlocks = countTaskDayBlocks(tasks);
      const completedBlocks = countCompletedTaskDayBlocks(tasks);
      const pullForwardCount = Number(series.pullForwardCount || 0);
      const schedule =
        activity?.startDate || activity?.rrule
          ? {
              startDate: toDateKey(activity?.startDate || todayKey),
              rruleString: activity?.rrule || null,
              seriesStartDate: series.startDate ? toDateKey(series.startDate) : null,
              exdates: Array.isArray(activity?.exdates) ? activity.exdates : [],
            }
          : null;
      const todayTasks = schedule
        ? getTasksForDate(
            tasks,
            schedule.rruleString,
            schedule.startDate,
            today,
            schedule.seriesStartDate,
            schedule.exdates,
            pullForwardCount
          )
        : [];
      const canPull = canPullForward(series.workAheadAllowed, tasks, pullForwardCount);
      const nextPullDate = schedule && canPull ? getNextPullableDate(schedule, tasks, pullForwardCount) : null;
      const plannedEnd = series.plannedEndDate
        ? toDateKey(series.plannedEndDate)
        : schedule
        ? computePlannedEndDate(schedule, totalBlocks)
        : null;
      const liveEnd = schedule
        ? computeLiveProjectedEndDate(schedule, totalBlocks, completedBlocks, pullForwardCount)
        : null;
      const drift = schedule ? computeScheduleDrift(plannedEnd, liveEnd, schedule) : { status: 'on_target', days: 0, label: 'On target' };
      const effectiveStartDate = series.startDate ? new Date(series.startDate) : activity?.startDate ? new Date(activity.startDate) : null;
      const allDone = totalTasks > 0 && completedTasks === totalTasks;
      const isFuture = effectiveStartDate && effectiveStartDate > today;
      const hasDependency = !!series.dependsOnSeriesId;
      let status = 'active_now';
      if (allDone) status = 'finished';
      else if (isFuture || hasDependency) status = 'future';

      const todayTasksFinished = areTodayTasksFinished(todayTasks);

      return {
        series,
        totalTasks,
        completedTasks,
        totalBlocks,
        completedBlocks,
        pullForwardCount,
        drift,
        todayTasks,
        todayTasksFinished,
        canPull,
        nextPullDate,
        status,
      };
    })
    .sort((left, right) => {
      const statusOrder = { active_now: 0, future: 1, finished: 2 };
      const diff = (statusOrder[left.status] || 0) - (statusOrder[right.status] || 0);
      if (diff !== 0) return diff;
      return (right.completedTasks / Math.max(right.totalTasks, 1)) - (left.completedTasks / Math.max(left.totalTasks, 1));
    });
}

function StatusPill({ label, tone = 'neutral' }) {
  const toneStyle =
    tone === 'success' ? { color: E.ok, borderColor: E.okBorder, bg: E.okBg }
    : tone === 'warning' ? { color: E.warn, borderColor: E.warnBorder, bg: E.warnBg }
    : tone === 'danger'  ? { color: E.danger, borderColor: E.dangerBorder, bg: E.dangerBg }
    : tone === 'accent'  ? { color: E.accentDeep, borderColor: E.border, bg: E.bgDeep }
    : { color: E.inkMuted, borderColor: E.border, bg: E.bgDeep };

  return (
    <View style={{ borderRadius: R.pill, borderWidth: 1, borderColor: toneStyle.borderColor, backgroundColor: toneStyle.bg, paddingHorizontal: SP.sm, paddingVertical: 4 }}>
      <Text style={{ color: toneStyle.color, fontSize: 11, fontWeight: '600', letterSpacing: 0.2 }}>{label}</Text>
    </View>
  );
}

export default function TasksTab() {
  const {
    db,
    currentUser,
    familyMembers,
    isAuthenticated,
    instantReady,
  } = useAppSession();

  const params = useLocalSearchParams();
  const scrollToSeriesId = firstParam(params.scrollToSeriesId) || '';
  const scrollToTaskId = firstParam(params.scrollToTaskId) || '';
  const requestedMemberId = firstParam(params.memberId) || '';

  const currentUserIdRef = useRef('');
  const [viewedMemberId, setViewedMemberId] = useState('');
  const [memberDropdownVisible, setMemberDropdownVisible] = useState(false);
  const [filter, setFilter] = useState('active_now');
  const [filterDropdownVisible, setFilterDropdownVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => getFamilyDayDateUTC(new Date()));
  const [dateDropdownVisible, setDateDropdownVisible] = useState(false);
  const [undoState, setUndoState] = useState(null);
  const [highlightedSeriesId, setHighlightedSeriesId] = useState('');
  const scrollViewRef = useRef(null);
  const seriesLayoutsRef = useRef({});

  const selectedDateKey = useMemo(() => formatDateKeyUTC(selectedDate), [selectedDate]);
  const todayDateKey = useMemo(() => formatDateKeyUTC(getFamilyDayDateUTC(new Date())), []);

  const dateStrip = useMemo(() => {
    return Array.from({ length: 7 }).map((_, index) => {
      const offset = index - 3;
      const d = new Date(selectedDate.getTime() + offset * 86400000);
      return d;
    });
  }, [selectedDate]);

  // Handle member selection from current user or params
  useEffect(() => {
    if (requestedMemberId) {
      setViewedMemberId(requestedMemberId);
      return;
    }
    if (!currentUser?.id) {
      currentUserIdRef.current = '';
      setViewedMemberId('');
      return;
    }
    if (currentUserIdRef.current !== currentUser.id) {
      currentUserIdRef.current = currentUser.id;
      setViewedMemberId(currentUser.id);
      return;
    }
    setViewedMemberId((previous) => {
      if (previous && familyMembers.some((member) => member.id === previous)) {
        return previous;
      }
      return currentUser.id;
    });
  }, [currentUser?.id, familyMembers, requestedMemberId]);

  const query = db.useQuery(
    isAuthenticated && instantReady
      ? {
          taskSeries: {
            tasks: {
              parentTask: {},
              attachments: {},
              responseFields: {},
              updates: {
                actor: {},
                affectedPerson: {},
                attachments: {},
                responseFieldValues: { field: {} },
                gradeType: {},
                replyTo: {},
                replies: {
                  actor: {},
                  affectedPerson: {},
                  attachments: {},
                  gradeType: {},
                },
              },
            },
            familyMember: {},
            scheduledActivity: {},
          },
          familyMembers: {},
        }
      : null
  );

  const allMembers = useMemo(
    () => query.data?.familyMembers || familyMembers || [],
    [query.data?.familyMembers, familyMembers]
  );
  const viewedMember = useMemo(
    () => allMembers.find((m) => m.id === viewedMemberId) || null,
    [allMembers, viewedMemberId]
  );
  const viewedMemberName = viewedMember?.name || currentUser?.name || 'Member';
  const headerTitle = formatPossessive(viewedMemberName);

  const overviewItems = useMemo(
    () => buildMemberOverviewItems(query.data?.taskSeries || [], viewedMemberId, selectedDate),
    [query.data?.taskSeries, viewedMemberId, selectedDate]
  );
  const filteredItems = useMemo(
    () => filter === 'all' ? overviewItems : overviewItems.filter((item) => item.status === filter),
    [overviewItems, filter]
  );

  // Stats
  const activeSeriesCount = overviewItems.filter((item) => item.status === 'active_now').length;
  const activeTotalTasks = overviewItems
    .filter((item) => item.status === 'active_now')
    .reduce((sum, item) => sum + item.todayTasks.length, 0);

  // Handle scroll-to-series deep link
  useEffect(() => {
    if (!scrollToSeriesId || filteredItems.length === 0) return;

    // Make sure the target series is visible in current filter
    const targetInFiltered = filteredItems.some((item) => item.series.id === scrollToSeriesId);
    if (!targetInFiltered) {
      // Switch to 'all' filter to show the target
      setFilter('all');
    }

    setHighlightedSeriesId(scrollToSeriesId);
    const timer = setTimeout(() => setHighlightedSeriesId(''), 2500);

    // Scroll to the series card after layout
    const scrollTimer = setTimeout(() => {
      const yOffset = seriesLayoutsRef.current[scrollToSeriesId];
      if (yOffset != null && scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: yOffset - 80, animated: true });
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      clearTimeout(scrollTimer);
    };
  }, [scrollToSeriesId, filteredItems.length]);

  async function handlePullForward(item) {
    if (!item.nextPullDate) return;
    const result = buildPullForwardTransactions({
      tx,
      seriesId: item.series.id,
      currentPullForwardCount: item.pullForwardCount,
      actorFamilyMemberId: currentUser?.id || null,
      choreId: firstRef(item.series.scheduledActivity)?.id || null,
      originalScheduledDate: item.nextPullDate,
    });

    await db.transact(result.transactions);
    setUndoState({
      seriesId: item.series.id,
      historyEventId: result.historyEventId,
      pullForwardCount: item.pullForwardCount + 1,
    });
  }

  async function handleUndo() {
    if (!undoState) return;
    const txs = buildUndoPullForwardTransactions({
      tx,
      seriesId: undoState.seriesId,
      currentPullForwardCount: undoState.pullForwardCount,
      historyEventId: undoState.historyEventId,
    });
    await db.transact(txs);
    setUndoState(null);
  }

  const handleSeriesLayout = useCallback((seriesId, event) => {
    seriesLayoutsRef.current[seriesId] = event.nativeEvent.layout.y;
  }, []);

  return (
    <>
      <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="dark-content" backgroundColor={E.bg} />
        <View style={s.root}>
          {/* Top bar */}
          <View style={s.topBar}>
            <Pressable
              testID="tasks-member-switcher"
              accessibilityRole="button"
              accessibilityLabel={`Viewing ${viewedMemberName}. Tap to choose a family member.`}
              onPress={() => setMemberDropdownVisible(true)}
              style={s.topBarMember}
            >
              <AvatarPhotoImage
                photoUrls={viewedMember?.photoUrls}
                preferredSize="320"
                style={s.topBarAvatar}
                fallback={
                  <View style={s.topBarAvatarFallback}>
                    <Text style={s.topBarAvatarFallbackText}>{createInitials(viewedMemberName)}</Text>
                  </View>
                }
              />
              <Text style={s.topBarTitle} numberOfLines={1}>{headerTitle}</Text>
            </Pressable>

            <View style={s.statsRow}>
              <View style={s.statDivider} />
              <View style={s.statBlock}>
                <Text style={s.statNum}>{activeSeriesCount}</Text>
                <Text style={s.statLabel}>Series</Text>
              </View>
              {activeTotalTasks > 0 ? (
                <>
                  <View style={s.statDivider} />
                  <View style={s.statBlock}>
                    <Text style={s.statNum}>{activeTotalTasks}</Text>
                    <Text style={s.statLabel}>Due</Text>
                  </View>
                </>
              ) : null}
            </View>

            <Pressable
              testID="tasks-filter-button"
              accessibilityRole="button"
              accessibilityLabel={`Filter: ${FILTER_OPTIONS.find((o) => o.key === filter)?.label || 'Active'}. Tap to change.`}
              onPress={() => setFilterDropdownVisible(true)}
              style={s.filterBtn}
            >
              <Text style={s.filterBtnText}>{FILTER_OPTIONS.find((o) => o.key === filter)?.label || 'Active'}</Text>
              <View style={s.filterChevron} />
            </Pressable>
          </View>

          {/* Date pill */}
          <Pressable
            testID="tasks-date-picker"
            accessibilityRole="button"
            accessibilityLabel={`Selected date: ${formatWeekdayDate(selectedDate)}. Tap to change.`}
            onPress={() => setDateDropdownVisible(true)}
            style={s.datePill}
          >
            <Text style={s.datePillText}>{formatWeekdayDate(selectedDate)}</Text>
            <View style={s.datePillChevron} />
          </Pressable>

          {/* Content */}
          <ScrollView
            ref={scrollViewRef}
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {undoState ? (
              <View style={s.card}>
                <Text style={s.cardBody}>Tasks pulled forward.</Text>
                <Pressable testID="tasks-tab-undo-pull" onPress={() => void handleUndo()} style={[s.actionBtn, s.actionBtnPrimary]}>
                  <Text style={[s.actionBtnText, s.actionBtnTextPrimary]}>Undo</Text>
                </Pressable>
              </View>
            ) : null}

            {query.isLoading ? (
              <View style={s.card}>
                <Text style={s.cardBody}>Loading task series\u2026</Text>
              </View>
            ) : filteredItems.length === 0 ? (
              <View style={s.card}>
                <Text style={s.cardBody}>No task series match this filter.</Text>
              </View>
            ) : (
              filteredItems.map((item) => {
                const isHighlighted = highlightedSeriesId === item.series.id;
                return (
                  <View
                    key={item.series.id}
                    onLayout={(e) => handleSeriesLayout(item.series.id, e)}
                    style={[s.card, isHighlighted && s.cardHighlighted]}
                  >
                    <View style={s.between}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.seriesTitle}>{item.series.name || 'Untitled series'}</Text>
                        <Text style={s.cardBody}>
                          {firstRef(item.series.scheduledActivity)?.title || 'Task series'}
                          {item.nextPullDate ? ` \u00b7 Next ${formatTaskDateLabel(item.nextPullDate)}` : ''}
                        </Text>
                      </View>
                      <StatusPill
                        label={item.drift.label}
                        tone={item.drift.status === 'behind' ? 'warning' : item.drift.status === 'ahead' ? 'accent' : 'success'}
                      />
                    </View>

                    <View style={s.between}>
                      <Text style={s.tinyLabel}>Tasks {item.completedTasks}/{item.totalTasks}</Text>
                      <Text style={s.tinyLabel}>Days {item.completedBlocks}/{item.totalBlocks}</Text>
                    </View>
                    <View style={s.progressTrack}>
                      <View style={[s.progressFill, { width: `${Math.max(4, item.totalTasks ? (item.completedTasks / item.totalTasks) * 100 : 4)}%` }]} />
                    </View>

                    {item.todayTasks.length ? (
                      <View style={{ gap: SP.sm }}>
                        <Text style={s.eyebrow}>
                          {selectedDateKey === todayDateKey ? 'Current Tasks' : `Tasks for ${formatMonthDay(selectedDate)}`}
                        </Text>
                        {item.todayTasks.map((task) => (
                          <Pressable
                            key={task.id}
                            onPress={() =>
                              router.push({
                                pathname: '/task-series/task',
                                params: {
                                  taskId: task.id,
                                  seriesId: item.series.id,
                                  choreId: firstRef(item.series.scheduledActivity)?.id || '',
                                  date: selectedDateKey,
                                },
                              })
                            }
                            style={[s.taskRow, scrollToTaskId === task.id && s.taskRowHighlighted]}
                          >
                            <View style={s.between}>
                              <Text style={s.taskTitle} numberOfLines={2}>{task.text}</Text>
                              <Text style={s.taskMeta}>{getTaskStatusLabel(getTaskWorkflowState(task))}</Text>
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}

                    <View style={s.taskActionRow}>
                      <Pressable
                        testID={`tasks-tab-open-checklist-${item.series.id}`}
                        onPress={() =>
                          openTaskSeriesChecklist({
                            seriesId: item.series.id,
                            choreId: firstRef(item.series.scheduledActivity)?.id || '',
                            date: selectedDateKey,
                            memberId: viewedMemberId,
                          })
                        }
                        style={s.actionBtn}
                      >
                        <Text style={s.actionBtnText}>Open Checklist</Text>
                      </Pressable>
                      <Pressable
                        testID={`tasks-tab-open-history-${item.series.id}`}
                        onPress={() => openTaskHistory({ seriesId: item.series.id, title: item.series.name || 'Task Series History' })}
                        style={s.actionBtn}
                      >
                        <Text style={s.actionBtnText}>History</Text>
                      </Pressable>
                      <Pressable
                        testID={`tasks-tab-open-discussion-${item.series.id}`}
                        onPress={() => void openTaskSeriesDiscussion({ seriesId: item.series.id, seriesName: item.series.name })}
                        style={s.actionBtn}
                      >
                        <Text style={s.actionBtnText}>Discussion</Text>
                      </Pressable>
                      {item.todayTasksFinished && item.canPull && item.nextPullDate ? (
                        <Pressable onPress={() => void handlePullForward(item)} style={[s.actionBtn, s.actionBtnPrimary]}>
                          <Text style={[s.actionBtnText, s.actionBtnTextPrimary]}>Pull Forward</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </SafeAreaView>

      {/* Member switcher */}
      <Modal visible={memberDropdownVisible} transparent animationType="fade" onRequestClose={() => setMemberDropdownVisible(false)}>
        <Pressable style={s.overlay} onPress={() => setMemberDropdownVisible(false)}>
          <View style={s.sheet}>
            <Text style={s.sheetHeading}>Choose a family member</Text>
            {allMembers.map((member) => {
              const isSelected = member.id === viewedMemberId;
              return (
                <Pressable
                  key={member.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setViewedMemberId(member.id);
                    setMemberDropdownVisible(false);
                  }}
                  style={[s.memberRow, isSelected && s.memberRowSelected]}
                >
                  <AvatarPhotoImage
                    photoUrls={member.photoUrls}
                    preferredSize="64"
                    style={s.memberAvatar}
                    fallback={
                      <View style={s.memberAvatarFallback}>
                        <Text style={s.memberAvatarFallbackText}>{createInitials(member.name)}</Text>
                      </View>
                    }
                  />
                  <Text style={[s.memberName, isSelected && s.memberNameSelected]}>{member.name}</Text>
                  {isSelected ? <View style={s.selectedDot} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {/* Filter picker */}
      <Modal visible={filterDropdownVisible} transparent animationType="fade" onRequestClose={() => setFilterDropdownVisible(false)}>
        <Pressable style={s.overlay} onPress={() => setFilterDropdownVisible(false)}>
          <View style={s.sheet}>
            <Text style={s.sheetHeading}>Filter task series</Text>
            {FILTER_OPTIONS.map(({ key, label }) => {
              const isSelected = filter === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  onPress={() => {
                    setFilter(key);
                    setFilterDropdownVisible(false);
                  }}
                  style={[s.memberRow, isSelected && s.memberRowSelected]}
                >
                  <Text style={[s.memberName, isSelected && s.memberNameSelected]}>{label}</Text>
                  {isSelected ? <View style={s.selectedDot} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {/* Date picker */}
      <Modal visible={dateDropdownVisible} transparent animationType="fade" onRequestClose={() => setDateDropdownVisible(false)}>
        <Pressable style={s.overlay} onPress={() => setDateDropdownVisible(false)}>
          <View style={s.sheet}>
            <Text style={s.sheetHeading}>Choose a date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dateCarouselContent}>
              {dateStrip.map((date) => {
                const dateKey = formatDateKeyUTC(date);
                const isSelected = dateKey === selectedDateKey;
                const isToday = dateKey === todayDateKey;
                return (
                  <Pressable
                    key={date.toISOString()}
                    testID={`tasks-date-chip-${dateKey}`}
                    accessibilityRole="button"
                    accessibilityLabel={`View tasks for ${formatLongDate(date)}`}
                    style={[s.datePillCard, isSelected && s.datePillCardSelected]}
                    onPress={() => {
                      setSelectedDate(date);
                      setDateDropdownVisible(false);
                    }}
                  >
                    <Text style={[s.datePillDay, isSelected && s.datePillTextSelected]}>{formatDayLabel(date)}</Text>
                    <Text style={[s.datePillDate, isSelected && s.datePillTextSelected]}>{formatMonthDay(date)}</Text>
                    {!isSelected && isToday ? <View style={s.todayDot} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: E.bg },
  root: { flex: 1, backgroundColor: E.bg },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SP.md,
    paddingTop: SP.sm,
    paddingBottom: SP.sm,
    backgroundColor: E.bg,
    borderBottomWidth: 1,
    borderBottomColor: E.borderLight,
    gap: SP.sm,
  },
  topBarMember:             { flexDirection: 'row', alignItems: 'center', gap: SP.sm, flex: 1, minWidth: 0 },
  topBarAvatar:             { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: E.border },
  topBarAvatarFallback:     { width: 38, height: 38, borderRadius: 19, backgroundColor: E.bgDeep, borderWidth: 1, borderColor: E.border, alignItems: 'center', justifyContent: 'center' },
  topBarAvatarFallbackText: { fontFamily: 'serif', fontSize: 14, fontWeight: '700', color: E.ink },
  topBarTitle:              { fontFamily: 'serif', fontSize: 18, fontWeight: '700', color: E.ink, flexShrink: 1 },

  // Stats
  statsRow:    { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  statDivider: { width: 1, height: 28, backgroundColor: E.borderLight },
  statBlock:   { alignItems: 'center', gap: 1 },
  statNum:     { fontFamily: 'serif', fontSize: 16, fontWeight: '700', color: E.ink },
  statLabel:   { fontSize: 9, color: E.inkMuted, letterSpacing: 0.6, textTransform: 'uppercase' },

  // Filter button
  filterBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: SP.sm, paddingVertical: 7, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep },
  filterBtnText:  { fontSize: 12, fontWeight: '500', color: E.inkSub },
  filterChevron:  { width: 5, height: 5, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: E.inkMuted, transform: [{ rotate: '45deg' }], marginTop: -2 },

  // Date pill
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: SP.md,
    marginTop: SP.sm,
    paddingHorizontal: SP.sm,
    paddingVertical: 8,
    backgroundColor: E.bgDeep,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: E.border,
    alignSelf: 'flex-start',
  },
  datePillText:    { fontSize: 13, color: E.inkSub, fontWeight: '500' },
  datePillChevron: { width: 6, height: 6, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: E.inkMuted, transform: [{ rotate: '45deg' }], marginTop: -2 },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: SP.md, paddingTop: SP.md, paddingBottom: 80, gap: SP.md },

  // Series card
  card:            { borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.md, gap: SP.md },
  cardHighlighted: { borderColor: E.accent, backgroundColor: E.bgDeep },
  seriesTitle:     { fontFamily: 'serif', fontSize: 16, fontWeight: '700', color: E.ink },
  cardBody:        { fontSize: 13, color: E.inkMuted, fontWeight: '300', lineHeight: 18 },

  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP.sm },

  tinyLabel: { fontSize: 10, color: E.inkMuted, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  eyebrow:   { fontSize: 10, color: E.inkMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },

  progressTrack: { height: 6, borderRadius: R.pill, backgroundColor: E.bgDeep, borderWidth: 1, borderColor: E.borderLight, overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: R.pill, backgroundColor: E.accent },

  // Task rows
  taskRow:            { borderRadius: R.md, borderWidth: 1, borderColor: E.borderLight, backgroundColor: E.bg, padding: SP.sm, gap: SP.xs },
  taskRowHighlighted: { borderColor: E.accent, backgroundColor: E.bgDeep },
  taskTitle:          { fontFamily: 'serif', fontSize: 14, fontWeight: '700', color: E.ink, flex: 1 },
  taskMeta:           { fontSize: 11, color: E.inkMuted, fontWeight: '300', lineHeight: 16 },

  // Action buttons
  taskActionRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },
  actionBtn:             { minHeight: 36, paddingHorizontal: SP.sm, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep },
  actionBtnPrimary:      { backgroundColor: E.ink, borderColor: E.ink },
  actionBtnText:         { fontSize: 12, fontWeight: '500', color: E.inkSub },
  actionBtnTextPrimary:  { color: E.white },

  // Modals
  overlay:      { flex: 1, backgroundColor: 'rgba(17,17,17,0.2)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: E.bg, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, borderTopWidth: 1, borderColor: E.border, paddingHorizontal: SP.md, paddingTop: SP.lg, paddingBottom: 48, gap: SP.sm },
  sheetHeading: { fontSize: 11, fontWeight: '600', color: E.inkMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: SP.xs },

  memberRow:                { flexDirection: 'row', alignItems: 'center', gap: SP.sm, paddingVertical: 10, paddingHorizontal: SP.sm, borderRadius: R.md },
  memberRowSelected:        { backgroundColor: E.bgDeep },
  memberAvatar:             { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: E.border },
  memberAvatarFallback:     { width: 36, height: 36, borderRadius: 18, backgroundColor: E.bgDeep, borderWidth: 1, borderColor: E.border, alignItems: 'center', justifyContent: 'center' },
  memberAvatarFallbackText: { fontFamily: 'serif', fontSize: 13, fontWeight: '700', color: E.ink },
  memberName:               { flex: 1, fontFamily: 'serif', fontSize: 16, fontWeight: '700', color: E.ink },
  memberNameSelected:       { color: E.ink },
  selectedDot:              { width: 8, height: 8, borderRadius: 4, backgroundColor: E.ink },

  // Date carousel
  dateCarouselContent:  { gap: SP.sm, paddingVertical: SP.xs },
  datePillCard:         { minWidth: 74, paddingHorizontal: SP.sm, paddingVertical: SP.sm, borderRadius: R.md, backgroundColor: E.bgDeep, borderWidth: 1, borderColor: E.border, alignItems: 'center', gap: 2, position: 'relative' },
  datePillCardSelected: { backgroundColor: E.ink, borderColor: E.ink },
  datePillDay:          { fontSize: 10, fontWeight: '600', color: E.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  datePillDate:         { fontFamily: 'serif', fontSize: 14, fontWeight: '700', color: E.ink },
  datePillTextSelected: { color: E.white },
  todayDot:             { position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: E.accent },
});
