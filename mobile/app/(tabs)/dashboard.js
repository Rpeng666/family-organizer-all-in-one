import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { id, tx } from '@instantdb/react-native';
import { router } from 'expo-router';
import {
  calculateDailyXP,
  formatDateKeyUTC,
  getAssignedMembersForChoreOnDate,
  getCompletedChoreCompletionsForDate,
  getMemberCompletionForDate,
  localDateToUTC,
} from '@family-organizer/shared-core';
import { AvatarPhotoImage } from '../../src/components/AvatarPhotoImage';
import { usePhotoUri } from '../../src/hooks/usePhotoUri';
import { getPhotoKey } from '../../src/lib/photo-urls';
import { findUnreadMembershipsForMember } from '../../src/lib/message-memberships';
import { useAppSession } from '../../src/providers/AppProviders';
import { E, SP, R } from '../../src/theme/E';
import { getTasksForDate } from '../../../lib/task-scheduler';
import {
  getLatestTaskUpdate,
  getTaskWorkflowState,
  isTaskDone,
  getTopLevelTaskUpdates,
  getTaskUpdateTime,
  isTaskUpdateReply,
  taskUpdateHasMeaningfulFeedbackContent,
} from '../../../lib/task-progress';
import {
  firstRef,
  completionKey,
  completionMemberId,
  memberRef,
  formatDayLabel,
  formatMonthDay,
  formatLongDate,
  formatWeekdayDate,
  formatPossessiveLabel,
  buildDateStrip,
  buildDashboardCalendarWhere,
  normalizeBalances,
  addBalancesInto,
  buildUnitMap,
  formatBalancesInline,
  createInitials,
  DAY_RANGE,
} from '../../src/lib/dashboard-utils';
import { useDashboardLayout, Q_GAP } from '../../src/hooks/useDashboardLayout';
import { ChoresQuadrant } from '../../src/components/dashboard/ChoresQuadrant';
import { TasksQuadrant } from '../../src/components/dashboard/TasksQuadrant';
import { MessagesQuadrant } from '../../src/components/dashboard/MessagesQuadrant';
import { CalendarQuadrant } from '../../src/components/dashboard/CalendarQuadrant';

export default function DashboardTab() {
  const { db, currentUser, familyMembers, isAuthenticated, instantReady } = useAppSession();
  const [selectedDate, setSelectedDate] = useState(() => localDateToUTC(new Date()));
  const [viewedMemberId, setViewedMemberId] = useState('');
  const [pendingCompletionKeys, setPendingCompletionKeys] = useState(() => new Set());
  const [taskSeriesQueryEnabled, setTaskSeriesQueryEnabled] = useState(false);
  const [memberDropdownVisible, setMemberDropdownVisible] = useState(false);
  const [dateDropdownVisible, setDateDropdownVisible] = useState(false);
  const [gridH, setGridH] = useState(0);
  const currentUserIdRef = useRef('');
  const dashboardCalendarWhere = useMemo(() => buildDashboardCalendarWhere(selectedDate), [selectedDate]);

  useEffect(() => {
    if (!isAuthenticated || !instantReady) {
      setTaskSeriesQueryEnabled(false);
      return undefined;
    }
    const timer = setTimeout(() => setTaskSeriesQueryEnabled(true), 0);
    return () => clearTimeout(timer);
  }, [isAuthenticated, instantReady]);

  const householdQuery = db.useQuery(
    isAuthenticated && instantReady
      ? { familyMembers: { $: { order: { order: 'asc' } }, allowanceEnvelopes: {} }, unitDefinitions: {} }
      : null
  );

  const choresQuery = db.useQuery(
    isAuthenticated && instantReady
      ? { chores: { assignees: {}, assignments: { familyMember: {} }, completions: { completedBy: {}, markedBy: {} } } }
      : null
  );

  const taskSeriesQuery = db.useQuery(
    isAuthenticated && instantReady && taskSeriesQueryEnabled
      ? {
          chores: {
            assignees: {},
            assignments: { familyMember: {} },
            taskSeries: {
              tasks: { parentTask: {}, attachments: {}, updates: { attachments: {}, actor: {} } },
              familyMember: {},
              scheduledActivity: {},
            },
          },
        }
      : null
  );

  const calendarSummaryQuery = db.useQuery(
    isAuthenticated && instantReady
      ? {
          calendarItems: {
            pertainsTo: {},
            $: { where: dashboardCalendarWhere.length <= 1 ? dashboardCalendarWhere[0] || {} : { or: dashboardCalendarWhere } },
          },
        }
      : null
  );

  const messageSummaryQuery = db.useQuery(
    isAuthenticated && instantReady ? { messageThreadMembers: {}, messageThreads: {} } : null
  );

  const taskSeriesByChoreId = useMemo(
    () => new Map((taskSeriesQuery.data?.chores || []).map((chore) => [chore.id, chore.taskSeries || []])),
    [taskSeriesQuery.data?.chores]
  );

  const members = useMemo(
    () => householdQuery.data?.familyMembers || familyMembers || [],
    [householdQuery.data?.familyMembers, familyMembers]
  );
  const unitDefinitions = useMemo(() => householdQuery.data?.unitDefinitions || [], [householdQuery.data?.unitDefinitions]);
  const chores = useMemo(
    () => (choresQuery.data?.chores || []).map((chore) => ({ ...chore, taskSeries: taskSeriesByChoreId.get(chore.id) || [] })),
    [choresQuery.data?.chores, taskSeriesByChoreId]
  );
  const unitMap = useMemo(() => buildUnitMap(unitDefinitions), [unitDefinitions]);
  const selectedDateKey = useMemo(() => formatDateKeyUTC(selectedDate), [selectedDate]);
  const dateStrip = useMemo(() => buildDateStrip(selectedDate), [selectedDate]);
  const todayDateKey = useMemo(() => formatDateKeyUTC(localDateToUTC(new Date())), []);

  useEffect(() => {
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
      if (previous && members.some((member) => member.id === previous)) return previous;
      return currentUser.id;
    });
  }, [currentUser?.id, members]);

  const viewedMember = useMemo(
    () => members.find((member) => member.id === viewedMemberId) || currentUser || members[0] || null,
    [currentUser, members, viewedMemberId]
  );

  const bgPhotoKey = getPhotoKey(viewedMember?.photoUrls, '1200');
  const bgPhotoUri = usePhotoUri(bgPhotoKey);

  const membersWithBalances = useMemo(() => {
    return members.map((member) => {
      const envelopes = (member.allowanceEnvelopes || []).map((envelope) => ({
        ...envelope,
        balancesNormalized: normalizeBalances(envelope),
      }));
      const totalBalances = envelopes.reduce((acc, envelope) => addBalancesInto(acc, envelope.balancesNormalized), {});
      return { ...member, envelopes, totalBalances };
    });
  }, [members]);

  const viewedFinanceMember = useMemo(
    () => membersWithBalances.find((member) => member.id === viewedMember?.id) || null,
    [membersWithBalances, viewedMember?.id]
  );

  const dailyXpByMember = useMemo(() => calculateDailyXP(chores, members, selectedDate), [chores, members, selectedDate]);
  const viewedXp = dailyXpByMember[viewedMember?.id] || { current: 0, possible: 0 };

  const familyMemberNameById = useMemo(
    () => members.reduce((acc, member) => { acc[member.id] = member.name; return acc; }, {}),
    [members]
  );

  const choreRows = useMemo(() => {
    if (!viewedMember?.id) return [];
    return chores
      .map((chore) => {
        const assignedMembers = getAssignedMembersForChoreOnDate(chore, selectedDate);
        if (assignedMembers.length === 0) return null;
        if (!assignedMembers.some((member) => member.id === viewedMember.id)) return null;
        const completionsOnDate = getCompletedChoreCompletionsForDate(chore, selectedDate);
        const firstCompletedByOther = completionsOnDate.find((completion) => completionMemberId(completion));
        const upForGrabsCompletedById = completionMemberId(firstCompletedByOther);
        const viewedCompletion = getMemberCompletionForDate(chore, viewedMember.id, selectedDate);
        return { chore, viewedCompletion, isDone: !!viewedCompletion?.completed, upForGrabsCompletedById };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (left.isDone !== right.isDone) return left.isDone ? 1 : -1;
        return (left.chore?.title || '').localeCompare(right.chore?.title || '');
      });
  }, [chores, selectedDate, viewedMember?.id]);

  const incompleteChores = useMemo(() => choreRows.filter((row) => !row.isDone), [choreRows]);
  const completedChores = useMemo(() => choreRows.filter((row) => row.isDone), [choreRows]);

  const taskSeriesCards = useMemo(() => {
    if (!viewedMember?.id) return [];
    const cards = [];
    for (const chore of chores) {
      const assignedMembers = getAssignedMembersForChoreOnDate(chore, selectedDate);
      if (!assignedMembers.some((member) => member.id === viewedMember.id)) continue;
      for (const series of chore.taskSeries || []) {
        const owner = firstRef(series.familyMember);
        if (owner?.id && owner.id !== viewedMember.id) continue;
        const allTasks = (series.tasks || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
        const scheduledTasks = getTasksForDate(
          allTasks, chore.rrule || null, chore.startDate, selectedDate, series.startDate || null, chore.exdates || null
        ).filter((task) => !task.isDayBreak);
        const bucketedCounts = {
          blocked: getBucketedTasks(allTasks, 'blocked').length,
          skipped: getBucketedTasks(allTasks, 'skipped').length,
          needs_review: getBucketedTasks(allTasks, 'needs_review').length,
          done: getBucketedTasks(allTasks, 'done').length,
        };
        const hasBucketedTasks = Object.values(bucketedCounts).some((count) => count > 0);
        if (!scheduledTasks.length && !hasBucketedTasks) continue;
        cards.push({
          id: series.id,
          series,
          chore,
          allTasks,
          scheduledTasks,
          incompleteCount: scheduledTasks.filter((task) => !isTaskDone(task)).length,
          bucketedCounts,
        });
      }
    }
    return cards.sort((a, b) => {
      const cc = (a.chore?.title || '').localeCompare(b.chore?.title || '');
      if (cc !== 0) return cc;
      return (a.series?.name || '').localeCompare(b.series?.name || '');
    });
  }, [chores, selectedDate, viewedMember?.id]);

  const calendarEvents = useMemo(() => {
    if (!viewedMember?.id) return [];
    const items = calendarSummaryQuery.data?.calendarItems || [];
    return items
      .map((item) => {
        const memberIds = (item.pertainsTo || []).map((m) => m.id).filter(Boolean);
        const isFamilyWide = memberIds.length === 0;
        if (!isFamilyWide && !memberIds.includes(viewedMember.id)) return null;
        const startsAt = item.isAllDay ? localDateToUTC(new Date(`${item.startDate}T00:00:00`)) : new Date(item.startDate);
        const endsAt = item.isAllDay ? localDateToUTC(new Date(`${item.endDate}T00:00:00`)) : new Date(item.endDate);
        if (endsAt.getTime() < selectedDate.getTime()) return null;
        const timeLabel = item.isAllDay
          ? `${startsAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · All day`
          : startsAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        return { id: item.id, title: item.title, timeLabel, startsAt, isFamilyWide };
      })
      .filter(Boolean)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .slice(0, 6);
  }, [calendarSummaryQuery.data?.calendarItems, viewedMember?.id, selectedDate]);

  const unreadThreads = useMemo(() => {
    if (!viewedMember?.id || !messageSummaryQuery.data?.messageThreads) return [];
    const threads = messageSummaryQuery.data.messageThreads;
    const unreadMemberships = findUnreadMembershipsForMember(
      messageSummaryQuery.data?.messageThreadMembers || [], viewedMember.id
    );
    if (unreadMemberships.length === 0) return [];
    const membershipsByThreadId = new Map(unreadMemberships.map((m) => [m.threadId, m]));
    const result = [];
    for (const thread of threads) {
      if (!thread.latestMessageAt) continue;
      const membership = membershipsByThreadId.get(thread.id);
      if (!membership || membership.isArchived) continue;
      if (thread.latestMessageAt > (membership.lastReadAt || '')) {
        let displayName = thread.title || 'Thread';
        if (thread.threadType === 'family') displayName = 'Family';
        else if (thread.threadType === 'parents_only') displayName = 'Parents';
        result.push({ id: thread.id, displayName, previewText: thread.latestMessagePreview || 'No messages yet', latestMessageAt: thread.latestMessageAt });
      }
    }
    return result.sort((a, b) => b.latestMessageAt.localeCompare(a.latestMessageAt));
  }, [messageSummaryQuery.data?.messageThreadMembers, messageSummaryQuery.data?.messageThreads, viewedMember?.id]);

  const choresLoading = choresQuery.isLoading && choreRows.length === 0;
  const taskSeriesLoading = taskSeriesQueryEnabled && taskSeriesQuery.isLoading && taskSeriesCards.length === 0;
  const activeTaskCount = useMemo(() => taskSeriesCards.reduce((sum, card) => sum + card.incompleteCount, 0), [taskSeriesCards]);

  const newFeedbackCount = useMemo(() => {
    let count = 0;
    for (const card of taskSeriesCards) {
      for (const task of card.allTasks) {
        const updates = task.updates || [];
        const topLevel = getTopLevelTaskUpdates({ updates });
        const feedbackReplies = updates.filter((u) => !u.isDraft && isTaskUpdateReply(u) && taskUpdateHasMeaningfulFeedbackContent(u));
        if (feedbackReplies.length === 0) continue;
        const latestFeedbackTime = Math.max(...feedbackReplies.map((r) => getTaskUpdateTime(r)));
        if (!topLevel.some((u) => getTaskUpdateTime(u) > latestFeedbackTime)) count++;
      }
    }
    return count;
  }, [taskSeriesCards]);

  const feedbackSeriesId = useMemo(() => {
    for (const card of taskSeriesCards) {
      for (const task of card.allTasks) {
        const updates = task.updates || [];
        const feedbackReplies = updates.filter((u) => !u.isDraft && isTaskUpdateReply(u) && taskUpdateHasMeaningfulFeedbackContent(u));
        if (feedbackReplies.length === 0) continue;
        const latestFeedbackTime = Math.max(...feedbackReplies.map((r) => getTaskUpdateTime(r)));
        const topLevel = getTopLevelTaskUpdates({ updates });
        if (!topLevel.some((u) => getTaskUpdateTime(u) > latestFeedbackTime)) {
          return { seriesId: card.series.id, choreId: card.chore?.id || '' };
        }
      }
    }
    return null;
  }, [taskSeriesCards]);

  const summaryLine = useMemo(() => {
    const pieces = [`${incompleteChores.length} chore${incompleteChores.length === 1 ? '' : 's'} left`, `${unreadThreads.length} message${unreadThreads.length === 1 ? '' : 's'} unread`];
    if (activeTaskCount > 0) pieces.push(`${activeTaskCount} task${activeTaskCount === 1 ? '' : 's'} to do`);
    if (newFeedbackCount > 0) pieces.push(`${newFeedbackCount} response${newFeedbackCount === 1 ? '' : 's'} with new feedback`);
    return pieces.join(' · ');
  }, [incompleteChores.length, unreadThreads.length, activeTaskCount, newFeedbackCount]);

  const { layoutCalc, topSplitFrac, bottomSplitFrac, availW } = useDashboardLayout({
    gridH,
    choreRows,
    incompleteChores,
    completedChores,
    taskSeriesCards,
    unreadThreads,
    calendarEvents,
  });

  async function handleToggleCompletion(chore, familyMemberId) {
    if (!currentUser?.id) {
      Alert.alert('Login required', 'Choose a family member before marking chores complete.');
      return;
    }
    const pendingKey = completionKey(chore.id, familyMemberId, selectedDateKey);
    setPendingCompletionKeys((prev) => new Set(prev).add(pendingKey));
    try {
      const existingCompletion = getMemberCompletionForDate(chore, familyMemberId, selectedDate);
      const completionsOnDate = getCompletedChoreCompletionsForDate(chore, selectedDate);
      if (chore.isUpForGrabs) {
        const completedByOther = completionsOnDate.find((c) => { const cid = completionMemberId(c); return cid && cid !== familyMemberId; });
        if (completedByOther && !existingCompletion) {
          const name = familyMemberNameById[completionMemberId(completedByOther)] || 'another member';
          Alert.alert('Already completed', `${chore.title || 'This chore'} was already completed by ${name}.`);
          return;
        }
      }
      if (existingCompletion) {
        const willComplete = !existingCompletion.completed;
        await db.transact([tx.choreCompletions[existingCompletion.id].update({ completed: willComplete, dateCompleted: willComplete ? new Date().toISOString() : null })]);
        return;
      }
      const completionId = id();
      const transactions = [
        tx.choreCompletions[completionId].update({ dateDue: selectedDateKey, dateCompleted: new Date().toISOString(), completed: true, allowanceAwarded: false }),
        tx.chores[chore.id].link({ completions: completionId }),
        tx.familyMembers[familyMemberId].link({ completedChores: completionId }),
      ];
      if (currentUser?.id) transactions.push(tx.familyMembers[currentUser.id].link({ markedCompletions: completionId }));
      await db.transact(transactions);
    } catch (error) {
      Alert.alert('Unable to update chore', error?.message || 'Please try again.');
    } finally {
      setPendingCompletionKeys((prev) => { const next = new Set(prev); next.delete(pendingKey); return next; });
    }
  }

  function handleStatPress(stat) {
    if (stat === 'chores') router.push('/chores');
    else if (stat === 'messages') router.push('/messages');
    else if (stat === 'tasks') router.push({ pathname: '/(tabs)/tasks', params: { memberId: viewedMember?.id || '' } });
    else if (stat === 'feedback' && feedbackSeriesId) {
      router.push({ pathname: '/task-series/series', params: { seriesId: feedbackSeriesId.seriesId, choreId: feedbackSeriesId.choreId, date: selectedDateKey, memberId: viewedMember?.id || '' } });
    } else if (stat === 'xp') router.push('/chores');
  }

  return (
    <>
      <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="dark-content" backgroundColor={E.bg} />
        <View style={s.root}>

          {/* Subtle photo ghost — low opacity, fades into paper */}
          {bgPhotoUri ? (
            <View style={s.bgWrap} pointerEvents="none">
              <Image source={{ uri: bgPhotoUri }} style={s.bgImg} resizeMode="cover" />
              <View style={s.bgFade} />
            </View>
          ) : null}

          {/* Top bar */}
          <View style={s.topBar}>
            <Pressable
              testID="dashboard-member-switcher"
              accessibilityRole="button"
              accessibilityLabel={`Viewing ${viewedMember?.name || 'family member'}. Tap to switch.`}
              onPress={() => setMemberDropdownVisible(true)}
              style={s.memberBtn}
            >
              <AvatarPhotoImage
                photoUrls={viewedMember?.photoUrls}
                preferredSize="320"
                style={s.avatar}
                fallback={
                  <View style={s.avatarFallback}>
                    <Text style={s.avatarLetter}>{createInitials(viewedMember?.name)}</Text>
                  </View>
                }
              />
              <Text style={s.memberName} numberOfLines={1}>
                {formatPossessiveLabel(viewedMember?.name, 'Day')}
              </Text>
            </Pressable>

            <Pressable
              testID="dashboard-date-picker"
              accessibilityRole="button"
              accessibilityLabel={`Selected date: ${formatWeekdayDate(selectedDate)}. Tap to change.`}
              onPress={() => setDateDropdownVisible(true)}
              style={s.datePill}
            >
              <Text style={s.dateText}>{formatWeekdayDate(selectedDate)}</Text>
            </Pressable>
          </View>

          {/* Stat row */}
          <View style={s.statRow}>
            <Pressable accessibilityRole="button" onPress={() => handleStatPress('xp')} style={s.stat}>
              <Text style={s.statNum}>{viewedXp.current}</Text>
              <Text style={s.statLabel}>/ {viewedXp.possible} xp</Text>
            </Pressable>
            <View style={s.statDiv} />
            <Pressable accessibilityRole="button" onPress={() => handleStatPress('chores')} style={s.stat}>
              <Text style={s.statNum}>{incompleteChores.length}</Text>
              <Text style={s.statLabel}>chores left</Text>
            </Pressable>
            <View style={s.statDiv} />
            <Pressable accessibilityRole="button" onPress={() => handleStatPress('messages')} style={s.stat}>
              <Text style={s.statNum}>{unreadThreads.length}</Text>
              <Text style={s.statLabel}>unread</Text>
            </Pressable>
            {activeTaskCount > 0 ? (
              <>
                <View style={s.statDiv} />
                <Pressable accessibilityRole="button" onPress={() => handleStatPress('tasks')} style={s.stat}>
                  <Text style={s.statNum}>{activeTaskCount}</Text>
                  <Text style={s.statLabel}>tasks</Text>
                </Pressable>
              </>
            ) : null}
            {newFeedbackCount > 0 ? (
              <>
                <View style={s.statDiv} />
                <Pressable accessibilityRole="button" onPress={() => handleStatPress('feedback')} style={s.stat}>
                  <Text style={[s.statNum, { color: E.accentDeep }]}>{newFeedbackCount}</Text>
                  <Text style={s.statLabel}>feedback</Text>
                </Pressable>
              </>
            ) : null}
            <View style={{ flex: 1 }} />
            <Pressable
              testID="dashboard-open-finance"
              accessibilityRole="button"
              onPress={() => viewedMember?.id && router.push({ pathname: '/finance', params: { memberId: viewedMember.id } })}
              style={s.financePill}
            >
              <Text style={s.financeText} numberOfLines={1}>
                {formatBalancesInline(viewedFinanceMember?.totalBalances || {}, unitMap)}
              </Text>
            </Pressable>
          </View>

          {/* Quadrant grid */}
          <View style={s.grid} onLayout={(e) => setGridH(e.nativeEvent.layout.height)}>
            {gridH > 0 ? (
              <>
                <ChoresQuadrant
                  incompleteChores={incompleteChores}
                  completedChores={completedChores}
                  choresLoading={choresLoading}
                  viewedMember={viewedMember}
                  selectedDateKey={selectedDateKey}
                  pendingCompletionKeys={pendingCompletionKeys}
                  onToggleCompletion={handleToggleCompletion}
                  style={{ position: 'absolute', top: 0, left: 0, width: availW * topSplitFrac - Q_GAP / 2, height: layoutCalc.leftTopH || gridH * 0.6 }}
                />
                <TasksQuadrant
                  taskSeriesCards={taskSeriesCards}
                  taskSeriesLoading={taskSeriesLoading}
                  activeTaskCount={activeTaskCount}
                  viewedMember={viewedMember}
                  style={{ position: 'absolute', top: 0, left: availW * topSplitFrac + Q_GAP / 2, width: availW * (1 - topSplitFrac) - Q_GAP / 2, height: layoutCalc.rightTopH || gridH * 0.6 }}
                />
                <MessagesQuadrant
                  unreadThreads={unreadThreads}
                  style={{ position: 'absolute', top: (layoutCalc.leftTopH || gridH * 0.6) + Q_GAP, left: 0, width: availW * bottomSplitFrac - Q_GAP / 2, height: layoutCalc.leftBottomH || gridH * 0.4 - Q_GAP }}
                />
                <CalendarQuadrant
                  calendarEvents={calendarEvents}
                  style={{ position: 'absolute', top: (layoutCalc.rightTopH || gridH * 0.6) + Q_GAP, left: availW * bottomSplitFrac + Q_GAP / 2, width: availW * (1 - bottomSplitFrac) - Q_GAP / 2, height: layoutCalc.rightBottomH || gridH * 0.4 - Q_GAP }}
                />
              </>
            ) : null}
          </View>
        </View>
      </SafeAreaView>

      {/* Member picker modal */}
      <Modal visible={memberDropdownVisible} transparent animationType="fade" onRequestClose={() => setMemberDropdownVisible(false)}>
        <Pressable style={s.overlay} onPress={() => setMemberDropdownVisible(false)}>
          <View style={s.sheet}>
            <Text style={s.sheetHeading}>View someone's day</Text>
            {members.map((member) => {
              const sel = member.id === viewedMember?.id;
              return (
                <Pressable
                  key={`mp-${member.id}`}
                  accessibilityRole="button"
                  onPress={() => { setViewedMemberId(member.id); setMemberDropdownVisible(false); }}
                  style={[s.sheetRow, sel && s.sheetRowSel]}
                >
                  <AvatarPhotoImage
                    photoUrls={member.photoUrls}
                    preferredSize="64"
                    style={s.sheetAvatar}
                    fallback={
                      <View style={s.sheetAvatarFallback}>
                        <Text style={s.sheetAvatarLetter}>{createInitials(member.name)}</Text>
                      </View>
                    }
                  />
                  <Text style={[s.sheetMemberName, sel && s.sheetMemberNameSel]}>{member.name}</Text>
                  {sel ? <View style={s.selDot} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {/* Date picker modal */}
      <Modal visible={dateDropdownVisible} transparent animationType="fade" onRequestClose={() => setDateDropdownVisible(false)}>
        <Pressable style={s.overlay} onPress={() => setDateDropdownVisible(false)}>
          <View style={s.sheet}>
            <Text style={s.sheetHeading}>Choose a date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dateStrip}>
              {dateStrip.map((date) => {
                const dk = formatDateKeyUTC(date);
                const isSel = dk === selectedDateKey;
                const isToday = dk === todayDateKey;
                return (
                  <Pressable
                    key={date.toISOString()}
                    testID={`dashboard-date-chip-${dk}`}
                    accessibilityRole="button"
                    accessibilityLabel={`View dashboard for ${formatLongDate(date)}`}
                    style={[s.datePillModal, isSel && s.datePillModalSel]}
                    onPress={() => { setSelectedDate(date); setDateDropdownVisible(false); }}
                  >
                    <Text style={[s.dateDay, isSel && s.dateSel]}>{formatDayLabel(date)}</Text>
                    <Text style={[s.dateNum, isSel && s.dateSel]}>{formatMonthDay(date)}</Text>
                    {!isSel && isToday ? <View style={s.todayDot} /> : null}
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
  safe:   { flex: 1, backgroundColor: E.bg },
  root:   { flex: 1, backgroundColor: E.bg },

  bgWrap: { position: 'absolute', bottom: -60, right: -40, width: '75%', height: '65%', opacity: 0.07 },
  bgImg:  { width: '100%', height: '100%' },
  bgFade: { ...StyleSheet.absoluteFillObject, backgroundColor: E.bg, opacity: 0.6 },

  // Top bar
  topBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SP.md, paddingTop: SP.sm, paddingBottom: 6 },
  memberBtn:    { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  avatar:       { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: E.border },
  avatarFallback: { width: 36, height: 36, borderRadius: 18, backgroundColor: E.bgDeep, borderWidth: 1, borderColor: E.border, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontFamily: 'serif', fontSize: 14, fontWeight: '700', color: E.ink },
  memberName:   { fontFamily: 'serif', fontSize: 18, fontWeight: '700', color: E.ink, flexShrink: 1 },
  datePill:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface },
  dateText:     { fontSize: 12, color: E.inkSub, fontWeight: '400' },

  // Stat row
  statRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP.md, paddingBottom: 10, gap: 0 },
  stat:       { alignItems: 'center', paddingHorizontal: 8 },
  statNum:    { fontFamily: 'serif', fontSize: 20, fontWeight: '700', color: E.ink, lineHeight: 24 },
  statLabel:  { fontSize: 9, color: E.inkMuted, letterSpacing: 0.4, marginTop: 1 },
  statDiv:    { width: 1, height: 24, backgroundColor: E.border, marginHorizontal: 2 },
  financePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, maxWidth: 140 },
  financeText: { fontSize: 12, color: E.inkSub, fontWeight: '400' },

  // Quadrant grid
  grid: { flex: 1, paddingHorizontal: SP.sm, paddingTop: 4, paddingBottom: SP.sm },

  // Modals
  overlay:  { flex: 1, backgroundColor: 'rgba(17,17,17,0.28)', justifyContent: 'flex-end', paddingHorizontal: SP.md, paddingBottom: SP.xl },
  sheet:    { backgroundColor: E.bg, borderRadius: R.lg, borderWidth: 1, borderColor: E.border, padding: SP.md, gap: 4 },
  sheetHeading: { fontSize: 10, letterSpacing: 1.6, color: E.inkMuted, textTransform: 'uppercase', marginBottom: 8 },
  sheetRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: R.md },
  sheetRowSel:  { backgroundColor: E.bgDeep },
  sheetAvatar:  { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: E.border },
  sheetAvatarFallback: { width: 32, height: 32, borderRadius: 16, backgroundColor: E.bgDeep, alignItems: 'center', justifyContent: 'center' },
  sheetAvatarLetter: { fontFamily: 'serif', fontSize: 13, fontWeight: '700', color: E.ink },
  sheetMemberName:    { flex: 1, fontSize: 15, fontWeight: '400', color: E.ink },
  sheetMemberNameSel: { fontWeight: '600' },
  selDot:      { width: 7, height: 7, borderRadius: 4, backgroundColor: E.accentDeep },
  dateStrip:   { gap: 8, paddingVertical: 4 },
  datePillModal: { minWidth: 64, paddingHorizontal: 10, paddingVertical: 10, borderRadius: R.md, borderWidth: 1, borderColor: E.border, alignItems: 'center', backgroundColor: E.surface, position: 'relative' },
  datePillModalSel: { backgroundColor: E.ink, borderColor: E.ink },
  dateDay:     { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color: E.inkMuted, fontWeight: '500' },
  dateNum:     { fontSize: 15, fontWeight: '600', color: E.ink, marginTop: 2, fontFamily: 'serif' },
  dateSel:     { color: E.white },
  todayDot:    { position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: E.accent },
});
