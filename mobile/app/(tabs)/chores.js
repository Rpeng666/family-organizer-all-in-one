import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { id, tx } from '@instantdb/react-native';
import { router } from 'expo-router';
import {
  HOUSEHOLD_SCHEDULE_SETTINGS_NAME,
  calculateDailyXP,
  formatDateKeyUTC,
  getFamilyDayDateUTC,
  getAssignedMembersForChoreOnDate,
  getCompletedChoreCompletionsForDate,
  getMemberCompletionForDate,
  parseSharedScheduleSettings,
  sortChoresForDisplay,
} from '@family-organizer/shared-core';
import { AvatarPhotoImage } from '../../src/components/AvatarPhotoImage';
import { useAppSession } from '../../src/providers/AppProviders';
import { E, SP, R } from '../../src/theme/E';

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

function formatPossessive(name) {
  if (!name) return 'Chores';
  return name.endsWith('s') ? `${name}' chores` : `${name}'s chores`;
}

function createInitials(name) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return '?';

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('');
}

function memberRef(member) {
  if (!member) return null;
  if (Array.isArray(member)) return member[0] || null;
  return member;
}

function completionMemberId(completion) {
  const completedBy = memberRef(completion?.completedBy);
  return completedBy?.id || null;
}

function completionKey(choreId, memberId, dateKey) {
  return `${choreId}:${memberId}:${dateKey}`;
}

export default function ChoresTab() {
  const {
    db,
    currentUser,
    familyMembers,
    isAuthenticated,
    instantReady,
  } = useAppSession();
  const currentUserIdRef = useRef('');
  const [selectedDate, setSelectedDate] = useState(() => getFamilyDayDateUTC(new Date()));
  const [viewedMemberId, setViewedMemberId] = useState('');
  const [memberDropdownVisible, setMemberDropdownVisible] = useState(false);
  const [dateDropdownVisible, setDateDropdownVisible] = useState(false);
  const [viewSettingsVisible, setViewSettingsVisible] = useState(false);
  const [pendingCompletionKeys, setPendingCompletionKeys] = useState(() => new Set());
  const [isMarkingVisibleDone, setIsMarkingVisibleDone] = useState(false);

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
      if (previous && familyMembers.some((member) => member.id === previous)) {
        return previous;
      }
      return currentUser.id;
    });
  }, [currentUser?.id, familyMembers]);

  const selectedDateKey = useMemo(() => formatDateKeyUTC(selectedDate), [selectedDate]);

  const dateStrip = useMemo(() => {
    return Array.from({ length: 7 }).map((_, index) => {
      const offset = index - 3;
      const d = new Date(selectedDate.getTime() + offset * 86400000);
      return d;
    });
  }, [selectedDate]);

  const choresQuery = db.useQuery(
    isAuthenticated && instantReady
      ? {
          chores: {
            assignees: {},
            assignments: {
              familyMember: {},
            },
            completions: {
              completedBy: {},
              markedBy: {},
            },
            taskSeries: {},
          },
          routineMarkerStatuses: {},
          settings: {
            $: {
              where: {
                name: HOUSEHOLD_SCHEDULE_SETTINGS_NAME,
              },
            },
          },
        }
      : null
  );

  const chores = useMemo(() => choresQuery.data?.chores || [], [choresQuery.data?.chores]);
  const routineMarkerStatuses = useMemo(
    () => choresQuery.data?.routineMarkerStatuses || [],
    [choresQuery.data?.routineMarkerStatuses]
  );
  const scheduleSettings = useMemo(
    () => parseSharedScheduleSettings(choresQuery.data?.settings?.[0]?.value || null),
    [choresQuery.data?.settings]
  );

  const familyMemberNameById = useMemo(
    () =>
      familyMembers.reduce((acc, member) => {
        acc[member.id] = member.name;
        return acc;
      }, {}),
    [familyMembers]
  );

  const viewedMember = useMemo(
    () => familyMembers.find((member) => member.id === viewedMemberId) || currentUser || familyMembers[0] || null,
    [currentUser, familyMembers, viewedMemberId]
  );

  const dailyXpByMember = useMemo(() => calculateDailyXP(chores, familyMembers, selectedDate), [chores, familyMembers, selectedDate]);
  const viewedXp = dailyXpByMember[viewedMember?.id] || { current: 0, possible: 0 };

  const visibleChores = useMemo(() => {
    const visibleRows = chores
      .map((chore) => {
        if (!viewedMember?.id) return null;

        const assignedMembers = getAssignedMembersForChoreOnDate(chore, selectedDate);
        if (assignedMembers.length === 0) return null;
        if (!assignedMembers.some((member) => member.id === viewedMember.id)) return null;

        const completionsOnDate = getCompletedChoreCompletionsForDate(chore, selectedDate);
        const firstCompletedByOther = completionsOnDate.find((completion) => completionMemberId(completion));
        const completedById = completionMemberId(firstCompletedByOther);
        const toggleMembers = assignedMembers.filter((member) => member.id === viewedMember.id);

        return {
          chore,
          assignedMembers,
          toggleMembers: toggleMembers.length > 0 ? toggleMembers : assignedMembers,
          completionsOnDate,
          upForGrabsCompletedById: completedById,
        };
      })
      .filter(Boolean);

    const sortedRows = sortChoresForDisplay(
      visibleRows.map((row) => row.chore),
      {
        date: selectedDate,
        routineMarkerStatuses,
        chores,
        scheduleSettings,
      }
    );

    const timingById = new Map(sortedRows.map((entry) => [entry.chore.id, entry.timing]));

    return visibleRows
      .slice()
      .sort((left, right) => {
        const leftIndex = sortedRows.findIndex((entry) => entry.chore.id === left.chore.id);
        const rightIndex = sortedRows.findIndex((entry) => entry.chore.id === right.chore.id);
        return leftIndex - rightIndex;
      })
      .map((row) => ({
        ...row,
        timing: timingById.get(row.chore.id) || null,
      }));
  }, [chores, routineMarkerStatuses, scheduleSettings, selectedDate, viewedMember?.id]);

  const viewedMemberName = viewedMember?.name || 'Family member';
  const headerTitle = formatPossessive(viewedMemberName);
  const remainingChoreCount = useMemo(() => {
    if (!viewedMember?.id) return 0;

    return visibleChores.reduce((count, row) => {
      const completion = getMemberCompletionForDate(row.chore, viewedMember.id, selectedDate);
      const blockedByUpForGrabs =
        !!row.chore?.isUpForGrabs &&
        !!row.upForGrabsCompletedById &&
        row.upForGrabsCompletedById !== viewedMember.id &&
        !completion?.completed;

      return completion?.completed || blockedByUpForGrabs ? count : count + 1;
    }, 0);
  }, [selectedDate, viewedMember?.id, visibleChores]);
  const completedChoreCount = Math.max(0, visibleChores.length - remainingChoreCount);
  const summaryLine = useMemo(() => {
    if (!viewedMember?.id) return `Choose a family member to view chores for ${formatMonthDay(selectedDate)}.`;
    if (visibleChores.length === 0) return `No chores due for ${formatMonthDay(selectedDate)}.`;
    return `${remainingChoreCount} left · ${completedChoreCount} done · ${visibleChores.length} scheduled`;
  }, [completedChoreCount, remainingChoreCount, selectedDate, viewedMember?.id, visibleChores.length]);

  const todayDateKey = formatDateKeyUTC(getFamilyDayDateUTC(new Date(), scheduleSettings));

  const defaultViewSetting = true;
  const showChoreDescriptions = currentUser?.viewShowChoreDescriptions ?? defaultViewSetting;
  const showTaskDetails = currentUser?.viewShowTaskDetails ?? defaultViewSetting;

  async function toggleViewSetting(setting, value) {
    if (!currentUser?.id) {
      Alert.alert('Login required', 'Choose a family member before changing view options.');
      return;
    }

    try {
      await db.transact([tx.familyMembers[currentUser.id].update({ [setting]: value })]);
    } catch (error) {
      Alert.alert('Unable to save view setting', error?.message || 'Please try again.');
    }
  }

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
        const completedByOther = completionsOnDate.find((completion) => {
          const completerId = completionMemberId(completion);
          return completerId && completerId !== familyMemberId;
        });
        if (completedByOther && !existingCompletion) {
          const completerName = familyMemberNameById[completionMemberId(completedByOther)] || 'another member';
          Alert.alert('Already completed', `${chore.title || 'This chore'} was already completed by ${completerName}.`);
          return;
        }
      }

      if (existingCompletion) {
        const willComplete = !existingCompletion.completed;
        await db.transact([
          tx.choreCompletions[existingCompletion.id].update({
            completed: willComplete,
            dateCompleted: willComplete ? new Date().toISOString() : null,
          }),
        ]);
        return;
      }

      const completionId = id();
      const transactions = [
        tx.choreCompletions[completionId].update({
          dateDue: selectedDateKey,
          dateCompleted: new Date().toISOString(),
          completed: true,
          allowanceAwarded: false,
        }),
        tx.chores[chore.id].link({ completions: completionId }),
        tx.familyMembers[familyMemberId].link({ completedChores: completionId }),
      ];

      if (currentUser?.id) {
        transactions.push(tx.familyMembers[currentUser.id].link({ markedCompletions: completionId }));
      }

      await db.transact(transactions);
    } catch (error) {
      Alert.alert('Unable to update chore', error?.message || 'Please try again.');
    } finally {
      setPendingCompletionKeys((prev) => {
        const next = new Set(prev);
        next.delete(pendingKey);
        return next;
      });
    }
  }

  function getMarkVisibleDoneTargets() {
    const targets = [];

    for (const item of visibleChores) {
      const { chore, toggleMembers, upForGrabsCompletedById } = item;
      let claimedUpForGrabs = Boolean(chore.isUpForGrabs && upForGrabsCompletedById);

      for (const member of toggleMembers) {
        const completion = getMemberCompletionForDate(chore, member.id, selectedDate);
        const pendingKey = completionKey(chore.id, member.id, selectedDateKey);
        const isBusy = pendingCompletionKeys.has(pendingKey);
        const isDone = !!completion?.completed;
        const blockedByUpForGrabs = Boolean(chore.isUpForGrabs && claimedUpForGrabs && !isDone);

        if (isDone || isBusy || blockedByUpForGrabs) continue;

        targets.push({ chore, memberId: member.id });
        if (chore.isUpForGrabs) {
          claimedUpForGrabs = true;
          break;
        }
      }
    }

    return targets;
  }

  function handleMarkVisibleDonePress() {
    if (isMarkingVisibleDone) return;

    const targets = getMarkVisibleDoneTargets();
    if (targets.length === 0) {
      Alert.alert('Nothing to mark', 'All visible chores are already done or currently updating.');
      return;
    }

    Alert.alert(
      'Mark visible chores done?',
      `This will mark ${targets.length} visible chore${targets.length === 1 ? '' : 's'} complete for ${formatMonthDay(selectedDate)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Done',
          onPress: () => {
            void (async () => {
              setIsMarkingVisibleDone(true);
              try {
                for (const target of targets) {
                  await handleToggleCompletion(target.chore, target.memberId);
                }
              } finally {
                setIsMarkingVisibleDone(false);
              }
            })();
          },
        },
      ]
    );
  }

  return (
    <>
      <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="dark-content" backgroundColor={E.bg} />
        <View style={s.root}>
          {/* Top bar */}
          <View style={s.topBar}>
            <Pressable
              testID="chores-member-switcher"
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

            {/* XP / remaining stats */}
            <View style={s.statsRow}>
              <View style={s.statDivider} />
              <View style={s.statBlock}>
                <Text style={s.statNum}>{viewedXp.current}<Text style={s.statNumSub}>/{viewedXp.possible}</Text></Text>
                <Text style={s.statLabel}>XP</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statBlock}>
                <Text style={s.statNum}>{remainingChoreCount}</Text>
                <Text style={s.statLabel}>Left</Text>
              </View>
            </View>

            {/* Settings button — three dots as stacked lines */}
            <Pressable
              testID="chores-view-settings-button"
              accessibilityRole="button"
              accessibilityLabel="Open chores view settings"
              onPress={() => setViewSettingsVisible(true)}
              style={s.utilBtn}
            >
              <View style={s.utilDot} />
              <View style={s.utilDot} />
              <View style={s.utilDot} />
            </Pressable>
          </View>

          {/* Date picker row */}
          <Pressable
            testID="chores-date-picker"
            accessibilityRole="button"
            accessibilityLabel={`Selected date: ${formatWeekdayDate(selectedDate)}. Tap to change.`}
            onPress={() => setDateDropdownVisible(true)}
            style={s.datePill}
          >
            <Text style={s.datePillText}>{formatWeekdayDate(selectedDate)}</Text>
            <View style={s.datePillChevron} />
          </Pressable>

          {/* Summary */}
          <View style={s.summaryRow}>
            <Text style={s.summaryText}>{summaryLine}</Text>
          </View>

          {/* Chores list */}
          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={s.panel}>
              <View style={s.panelHead}>
                <Text style={s.panelTitle}>Due Chores</Text>
                <View style={s.panelHeadRight}>
                  <Text style={s.metaText}>
                    {choresQuery.isLoading ? 'Loading…' : `${visibleChores.length} of ${chores.length}`}
                  </Text>
                  <Pressable
                    testID="chores-mark-visible-done-button"
                    accessibilityRole="button"
                    accessibilityLabel="Mark all visible chores done"
                    onPress={handleMarkVisibleDonePress}
                    disabled={isMarkingVisibleDone || visibleChores.length === 0}
                    style={[s.markAllBtn, (isMarkingVisibleDone || visibleChores.length === 0) && s.markAllBtnDisabled]}
                  >
                    <Text style={s.markAllBtnText}>
                      {isMarkingVisibleDone ? 'Working…' : 'Mark All Done'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {choresQuery.error ? (
                <Text style={s.errorText}>{choresQuery.error.message || 'Failed to load chores'}</Text>
              ) : visibleChores.length === 0 ? (
                <Text style={s.emptyText}>No chores due for this date.</Text>
              ) : (
                <View style={s.cards}>
                  {visibleChores.map(({ chore, toggleMembers, completionsOnDate, upForGrabsCompletedById, timing }, index) => {
                    const previousTiming = index > 0 ? visibleChores[index - 1]?.timing : null;
                    const showSectionHeader = !previousTiming || previousTiming?.sectionKey !== timing?.sectionKey;
                    const upForGrabsCompletedByName =
                      upForGrabsCompletedById ? familyMemberNameById[upForGrabsCompletedById] || 'another member' : null;

                    return (
                      <React.Fragment key={chore.id}>
                        {showSectionHeader ? (
                          <View style={[s.sectionChip, timing?.isActiveNow && s.sectionChipActive]}>
                            <Text style={[s.sectionChipText, timing?.isActiveNow && s.sectionChipTextActive]}>
                              {timing?.sectionLabel || 'Anytime'}{timing?.isActiveNow ? ' · Now' : ''}
                            </Text>
                          </View>
                        ) : null}

                        <View style={s.choreCard}>
                          <View style={s.choreHead}>
                            <View style={{ flex: 1 }}>
                              <Text style={s.choreTitle}>{chore.title || 'Untitled chore'}</Text>
                              {!!chore.description && showChoreDescriptions ? (
                                <Text style={s.choreDesc}>{chore.description}</Text>
                              ) : null}
                            </View>
                            <View style={s.tagRow}>
                              {timing?.label && timing?.mode !== 'anytime' ? (
                                <Text style={[s.tag, s.tagBlue]}>{timing.label}</Text>
                              ) : null}
                              {chore.isUpForGrabs ? (
                                <Text style={[s.tag, s.tagWarm]}>Up for grabs</Text>
                              ) : null}
                              {chore.rewardType !== 'fixed' && Number.isFinite(Number(chore.weight)) ? (
                                <Text style={[s.tag, s.tagXp]}>
                                  XP {Number(chore.weight) > 0 ? '+' : ''}{Number(chore.weight || 0)}
                                </Text>
                              ) : null}
                              {chore.rewardType === 'fixed' ? (
                                <Text style={[s.tag, s.tagNeutral]}>Fixed</Text>
                              ) : null}
                              {chore.isJoint ? (
                                <Text style={[s.tag, s.tagNeutral]}>Joint</Text>
                              ) : null}
                            </View>
                          </View>

                          {chore.isUpForGrabs && upForGrabsCompletedByName ? (
                            <Text style={s.helperText}>Completed today by {upForGrabsCompletedByName}</Text>
                          ) : null}

                          {chore.taskSeries?.length > 0 ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`View tasks for ${chore.title}`}
                              onPress={() =>
                                router.push({
                                  pathname: '/(tabs)/tasks',
                                  params: {
                                    scrollToSeriesId: chore.taskSeries[0].id,
                                    memberId: viewedMember?.id || '',
                                  },
                                })
                              }
                              style={s.taskChip}
                            >
                              <View style={s.taskChipLine} />
                              <Text style={s.taskChipText}>
                                {chore.taskSeries.length === 1 ? 'View Tasks' : `${chore.taskSeries.length} Task Series`}
                              </Text>
                              <Text style={s.taskChipArrow}>›</Text>
                            </Pressable>
                          ) : null}

                          <View style={s.toggleList}>
                            {toggleMembers.map((member) => {
                              const completion = getMemberCompletionForDate(chore, member.id, selectedDate);
                              const isDone = !!completion?.completed;
                              const isBusy = pendingCompletionKeys.has(completionKey(chore.id, member.id, selectedDateKey));
                              const blockedByUpForGrabs =
                                !!chore.isUpForGrabs &&
                                !!upForGrabsCompletedById &&
                                upForGrabsCompletedById !== member.id &&
                                !isDone;

                              return (
                                <View key={`${chore.id}:${member.id}`} style={s.toggleRow}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={s.toggleMeta}>
                                      {blockedByUpForGrabs
                                        ? 'Already claimed'
                                        : isDone
                                        ? `Done · ${
                                            completion?.dateCompleted
                                              ? new Date(completion.dateCompleted).toLocaleTimeString([], {
                                                  hour: 'numeric',
                                                  minute: '2-digit',
                                                })
                                              : 'today'
                                          }`
                                        : 'Not done yet'}
                                    </Text>
                                  </View>
                                  <Pressable
                                    testID={`chore-toggle-${chore.id}-${member.id}`}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${isDone ? 'Mark not done' : 'Mark done'} for ${viewedMemberName} on ${chore.title || 'chore'}`}
                                    disabled={isBusy || blockedByUpForGrabs}
                                    onPress={() => handleToggleCompletion(chore, member.id)}
                                    style={[
                                      s.toggleBtn,
                                      isDone && s.toggleBtnDone,
                                      blockedByUpForGrabs && s.toggleBtnDisabled,
                                      isBusy && s.toggleBtnBusy,
                                    ]}
                                  >
                                    <Text style={[
                                      s.toggleBtnText,
                                      isDone && s.toggleBtnTextDone,
                                      blockedByUpForGrabs && s.toggleBtnTextDisabled,
                                    ]}>
                                      {isBusy ? '…' : isDone ? 'Done' : 'Mark'}
                                    </Text>
                                  </Pressable>
                                </View>
                              );
                            })}
                          </View>

                          {completionsOnDate.length > 0 ? (
                            <Text style={s.completionNote}>
                              {completionsOnDate.length} completion{completionsOnDate.length === 1 ? '' : 's'} recorded
                            </Text>
                          ) : null}
                        </View>
                      </React.Fragment>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>

      {/* Member picker sheet */}
      <Modal visible={memberDropdownVisible} transparent animationType="fade" onRequestClose={() => setMemberDropdownVisible(false)}>
        <Pressable style={s.overlay} onPress={() => setMemberDropdownVisible(false)}>
          <View style={s.sheet}>
            <Text style={s.sheetHeading}>View someone's chores</Text>
            {familyMembers.map((member) => {
              const selected = member.id === viewedMember?.id;
              return (
                <Pressable
                  key={`chores-member-pick-${member.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${member.name}'s chores`}
                  onPress={() => {
                    setViewedMemberId(member.id);
                    setMemberDropdownVisible(false);
                  }}
                  style={[s.memberRow, selected && s.memberRowSelected]}
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
                  <Text style={[s.memberName, selected && s.memberNameSelected]}>{member.name}</Text>
                  {selected ? <View style={s.selectedDot} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {/* Date picker sheet */}
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
                    testID={`chores-date-chip-${dateKey}`}
                    accessibilityRole="button"
                    accessibilityLabel={`View chores for ${formatLongDate(date)}`}
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

      {/* View settings sheet */}
      <Modal visible={viewSettingsVisible} transparent animationType="fade" onRequestClose={() => setViewSettingsVisible(false)}>
        <Pressable style={s.overlay} onPress={() => setViewSettingsVisible(false)}>
          <View style={s.sheet}>
            <Text style={s.sheetHeading}>View settings</Text>
            {currentUser ? null : <Text style={s.sheetMeta}>Login required to save settings</Text>}
            <View style={s.viewOptList}>
              <Pressable
                testID="chores-view-toggle-descriptions"
                accessibilityRole="switch"
                accessibilityState={{ checked: !!showChoreDescriptions, disabled: !currentUser }}
                accessibilityLabel="Toggle chore descriptions"
                disabled={!currentUser}
                onPress={() => toggleViewSetting('viewShowChoreDescriptions', !showChoreDescriptions)}
                style={[s.viewOptRow, showChoreDescriptions && s.viewOptRowOn, !currentUser && s.viewOptRowDisabled]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.viewOptTitle}>Chore descriptions</Text>
                  <Text style={s.viewOptMeta}>
                    {showChoreDescriptions ? 'Showing notes under chore titles' : 'Hide descriptions for a cleaner list'}
                  </Text>
                </View>
                <View style={[s.toggle, showChoreDescriptions && s.toggleOn]}>
                  <View style={[s.toggleKnob, showChoreDescriptions && s.toggleKnobOn]} />
                </View>
              </Pressable>

              <Pressable
                testID="chores-view-toggle-task-details"
                accessibilityRole="switch"
                accessibilityState={{ checked: !!showTaskDetails, disabled: !currentUser }}
                accessibilityLabel="Toggle task details"
                disabled={!currentUser}
                onPress={() => toggleViewSetting('viewShowTaskDetails', !showTaskDetails)}
                style={[s.viewOptRow, showTaskDetails && s.viewOptRowOn, !currentUser && s.viewOptRowDisabled]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.viewOptTitle}>Task details</Text>
                  <Text style={s.viewOptMeta}>Expand inline task detail in the checklist view.</Text>
                </View>
                <View style={[s.toggle, showTaskDetails && s.toggleOn]}>
                  <View style={[s.toggleKnob, showTaskDetails && s.toggleKnobOn]} />
                </View>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: E.bg },
  root:   { flex: 1, backgroundColor: E.bg },

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
  topBarMember:           { flexDirection: 'row', alignItems: 'center', gap: SP.sm, flex: 1, minWidth: 0 },
  topBarAvatar:           { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: E.border },
  topBarAvatarFallback:   { width: 38, height: 38, borderRadius: 19, backgroundColor: E.bgDeep, borderWidth: 1, borderColor: E.border, alignItems: 'center', justifyContent: 'center' },
  topBarAvatarFallbackText: { fontFamily: 'serif', fontSize: 14, fontWeight: '700', color: E.ink },
  topBarTitle:            { fontFamily: 'serif', fontSize: 18, fontWeight: '700', color: E.ink, flexShrink: 1 },

  // Stats
  statsRow:    { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  statDivider: { width: 1, height: 28, backgroundColor: E.borderLight },
  statBlock:   { alignItems: 'center', gap: 1 },
  statNum:     { fontFamily: 'serif', fontSize: 16, fontWeight: '700', color: E.ink },
  statNumSub:  { fontFamily: 'serif', fontSize: 12, fontWeight: '400', color: E.inkMuted },
  statLabel:   { fontSize: 9, color: E.inkMuted, letterSpacing: 0.6, textTransform: 'uppercase' },

  // Settings button (three stacked dots)
  utilBtn:  { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', gap: 3 },
  utilDot:  { width: 3, height: 3, borderRadius: 1.5, backgroundColor: E.inkMuted },

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

  // Summary
  summaryRow:  { paddingHorizontal: SP.md, paddingTop: SP.sm, paddingBottom: SP.xs },
  summaryText: { fontSize: 12, color: E.inkMuted, fontWeight: '300', lineHeight: 17 },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: SP.md, paddingTop: SP.md, paddingBottom: 80, gap: SP.md },

  // Panel
  panel:       { backgroundColor: E.surface, borderRadius: R.lg, borderWidth: 1, borderColor: E.border, padding: SP.md, gap: SP.md },
  panelHead:   { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SP.sm },
  panelHeadRight: { alignItems: 'flex-end', gap: 6 },
  panelTitle:  { fontFamily: 'serif', fontSize: 15, fontWeight: '700', color: E.ink },
  metaText:    { fontSize: 11, color: E.inkMuted, fontWeight: '300' },

  // Mark all button
  markAllBtn:         { borderWidth: 1, borderColor: E.border, borderRadius: R.pill, backgroundColor: E.bgDeep, paddingHorizontal: 10, paddingVertical: 5 },
  markAllBtnDisabled: { opacity: 0.4 },
  markAllBtnText:     { fontSize: 11, fontWeight: '600', color: E.inkSub, letterSpacing: 0.2 },

  emptyText: { fontSize: 13, color: E.inkMuted, fontWeight: '300', paddingVertical: SP.sm },
  errorText: { fontSize: 13, color: E.danger, fontWeight: '500' },
  cards:     { gap: SP.md },

  // Section chip (timing header)
  sectionChip:         { alignSelf: 'flex-start', borderRadius: R.pill, backgroundColor: E.bgDeep, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: E.border },
  sectionChipActive:   { backgroundColor: E.okBg, borderColor: E.okBorder },
  sectionChipText:     { fontSize: 10, fontWeight: '600', color: E.inkMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionChipTextActive: { color: E.ok },

  // Chore card
  choreCard: { backgroundColor: E.bg, borderRadius: R.md, borderWidth: 1, borderColor: E.border, padding: SP.md, gap: SP.sm },
  choreHead: { flexDirection: 'row', alignItems: 'flex-start', gap: SP.sm },
  choreTitle: { fontFamily: 'serif', fontSize: 16, fontWeight: '700', color: E.ink },
  choreDesc:  { fontSize: 13, color: E.inkMuted, fontWeight: '300', marginTop: 3, lineHeight: 18 },

  // Tags (inline text style)
  tagRow:    { flexDirection: 'row', gap: SP.xs, flexWrap: 'wrap', marginTop: 4 },
  tag:       { fontSize: 10, fontWeight: '600', letterSpacing: 0.3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: R.pill, borderWidth: 1, overflow: 'hidden' },
  tagBlue:   { color: E.accent, borderColor: E.accentDeep, backgroundColor: E.bgDeep },
  tagWarm:   { color: E.warn, borderColor: E.warnBorder, backgroundColor: E.warnBg },
  tagXp:     { color: E.inkSub, borderColor: E.border, backgroundColor: E.bgDeep },
  tagNeutral:{ color: E.inkMuted, borderColor: E.borderLight, backgroundColor: E.bgDeep },

  helperText: { fontSize: 12, color: E.inkMuted, fontWeight: '300' },

  // Task series chip
  taskChip:      { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep },
  taskChipLine:  { width: 2, height: 14, borderRadius: 1, backgroundColor: E.accent },
  taskChipText:  { fontSize: 12, fontWeight: '500', color: E.inkSub },
  taskChipArrow: { fontSize: 16, color: E.border, lineHeight: 18 },

  // Toggle list
  toggleList: { gap: SP.sm },
  toggleRow:  { flexDirection: 'row', alignItems: 'center', gap: SP.md, borderWidth: 1, borderColor: E.borderLight, borderRadius: R.sm, backgroundColor: E.surface, paddingHorizontal: SP.sm, paddingVertical: SP.sm },
  toggleMeta: { fontSize: 12, color: E.inkMuted, fontWeight: '300' },

  toggleBtn:             { minWidth: 58, alignItems: 'center', justifyContent: 'center', borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, paddingHorizontal: 12, paddingVertical: 8 },
  toggleBtnDone:         { borderColor: E.okBorder, backgroundColor: E.okBg },
  toggleBtnDisabled:     { opacity: 0.4 },
  toggleBtnBusy:         { opacity: 0.6 },
  toggleBtnText:         { fontSize: 12, fontWeight: '600', color: E.inkSub },
  toggleBtnTextDone:     { color: E.ok },
  toggleBtnTextDisabled: { color: E.inkMuted },

  completionNote: { fontSize: 11, color: E.inkMuted, fontWeight: '300' },

  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(17,17,17,0.2)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: E.bg, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, borderTopWidth: 1, borderColor: E.border, paddingHorizontal: SP.md, paddingTop: SP.lg, paddingBottom: 48, gap: SP.sm },
  sheetHeading: { fontSize: 11, fontWeight: '600', color: E.inkMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: SP.xs },
  sheetMeta:    { fontSize: 12, color: E.inkMuted, fontWeight: '300' },

  // Member rows
  memberRow:            { flexDirection: 'row', alignItems: 'center', gap: SP.sm, paddingVertical: 10, paddingHorizontal: SP.sm, borderRadius: R.md },
  memberRowSelected:    { backgroundColor: E.bgDeep },
  memberAvatar:         { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: E.border },
  memberAvatarFallback: { width: 36, height: 36, borderRadius: 18, backgroundColor: E.bgDeep, borderWidth: 1, borderColor: E.border, alignItems: 'center', justifyContent: 'center' },
  memberAvatarFallbackText: { fontFamily: 'serif', fontSize: 13, fontWeight: '700', color: E.ink },
  memberName:           { flex: 1, fontFamily: 'serif', fontSize: 16, fontWeight: '700', color: E.ink },
  memberNameSelected:   { color: E.ink },
  selectedDot:          { width: 8, height: 8, borderRadius: 4, backgroundColor: E.ink },

  // Date carousel
  dateCarouselContent:  { gap: SP.sm, paddingVertical: SP.xs },
  datePillCard:         { minWidth: 74, paddingHorizontal: SP.sm, paddingVertical: SP.sm, borderRadius: R.md, backgroundColor: E.bgDeep, borderWidth: 1, borderColor: E.border, alignItems: 'center', gap: 2, position: 'relative' },
  datePillCardSelected: { backgroundColor: E.ink, borderColor: E.ink },
  datePillDay:          { fontSize: 10, fontWeight: '600', color: E.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  datePillDate:         { fontFamily: 'serif', fontSize: 14, fontWeight: '700', color: E.ink },
  datePillTextSelected: { color: E.white },
  todayDot:             { position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: E.accent },

  // View settings
  viewOptList:      { gap: SP.sm },
  viewOptRow:       { flexDirection: 'row', alignItems: 'center', gap: SP.sm, borderWidth: 1, borderColor: E.border, borderRadius: R.md, backgroundColor: E.surface, paddingHorizontal: SP.sm, paddingVertical: SP.sm },
  viewOptRowOn:     { borderColor: E.okBorder, backgroundColor: E.okBg },
  viewOptRowDisabled: { opacity: 0.5 },
  viewOptTitle:     { fontFamily: 'serif', fontSize: 14, fontWeight: '700', color: E.ink },
  viewOptMeta:      { fontSize: 12, color: E.inkMuted, fontWeight: '300', marginTop: 2 },

  toggle:      { width: 44, height: 26, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, justifyContent: 'center', paddingHorizontal: 2 },
  toggleOn:    { borderColor: E.okBorder, backgroundColor: E.ok },
  toggleKnob:  { width: 20, height: 20, borderRadius: R.pill, backgroundColor: E.white, borderWidth: 1, borderColor: E.border },
  toggleKnobOn: { alignSelf: 'flex-end', borderColor: E.okBorder },
});
