import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

const Q_GAP = 10;
const CHORE_ROW_H = 50;
const TASK_ROW_H = 68;
const TASK_PARENT_ROW_H = 38;
const TASK_SERIES_HDR_H = 38;
const MSG_ROW_H = 56;
const CAL_ROW_H = 56;
const Q_HEADER_H = 42;
const Q_EMPTY_H = 44;
const Q_SECTION_LABEL_H = 30;
const CHAR_PX = 8;
const CARD_PAD = 80;
const GRID_PAD = 20;
const MIN_COL_FRAC = 0.3;

export { Q_GAP };

function calcSplitFrac(leftChars, rightChars, availW) {
  const leftDesired = leftChars * CHAR_PX + CARD_PAD;
  const rightDesired = rightChars * CHAR_PX + CARD_PAD;
  if (leftDesired + rightDesired <= availW) {
    const leftMin = leftDesired / availW;
    const rightMin = rightDesired / availW;
    return Math.max(leftMin, Math.min(1 - rightMin, 0.5));
  }
  if (leftDesired > availW * 0.5 && rightDesired > availW * 0.5) return 0.5;
  if (leftDesired > availW * 0.5) {
    const maxSplit = 1 - rightDesired / availW;
    return Math.max(MIN_COL_FRAC, Math.min(1 - MIN_COL_FRAC, maxSplit));
  }
  const minSplit = leftDesired / availW;
  return Math.max(MIN_COL_FRAC, Math.min(1 - MIN_COL_FRAC, minSplit));
}

export function useDashboardLayout({ gridH, choreRows, incompleteChores, completedChores, taskSeriesCards, unreadThreads, calendarEvents }) {
  const { width: screenWidth } = useWindowDimensions();
  const availW = screenWidth - GRID_PAD;

  const choresEstH = useMemo(() => {
    if (choreRows.length === 0) return Q_HEADER_H + Q_EMPTY_H;
    let h = Q_HEADER_H + incompleteChores.length * CHORE_ROW_H;
    if (completedChores.length > 0) h += Q_SECTION_LABEL_H + completedChores.length * CHORE_ROW_H;
    return h;
  }, [choreRows.length, incompleteChores.length, completedChores.length]);

  const tasksEstH = useMemo(() => {
    if (taskSeriesCards.length === 0) return Q_HEADER_H + Q_EMPTY_H;
    let h = Q_HEADER_H;
    for (const card of taskSeriesCards) {
      h += TASK_SERIES_HDR_H;
      const parentIds = new Set();
      for (const t of card.scheduledTasks) {
        const p = Array.isArray(t.parentTask) ? t.parentTask[0] : t.parentTask;
        if (p && !parentIds.has(p.id)) { parentIds.add(p.id); h += TASK_PARENT_ROW_H; }
        h += TASK_ROW_H;
      }
    }
    return h;
  }, [taskSeriesCards]);

  const msgsEstH = useMemo(() => {
    if (unreadThreads.length === 0) return Q_HEADER_H + Q_EMPTY_H;
    return Q_HEADER_H + unreadThreads.length * MSG_ROW_H;
  }, [unreadThreads.length]);

  const calEstH = useMemo(() => {
    if (calendarEvents.length === 0) return Q_HEADER_H + Q_EMPTY_H;
    return Q_HEADER_H + calendarEvents.length * CAL_ROW_H;
  }, [calendarEvents.length]);

  const msgsMinH = Q_HEADER_H + (unreadThreads.length === 0 ? Q_EMPTY_H : Math.min(2, unreadThreads.length) * MSG_ROW_H);
  const calMinH = Q_HEADER_H + (calendarEvents.length === 0 ? Q_EMPTY_H : Math.min(2, calendarEvents.length) * CAL_ROW_H);

  const layoutCalc = useMemo(() => {
    if (!gridH) return { mode: 'row', topH: 0, leftBottomH: 0, rightBottomH: 0 };

    const rowTopH = Math.max(choresEstH, tasksEstH);
    const rowBottomH = Math.max(gridH - rowTopH - Q_GAP, Math.max(msgsMinH, calMinH));
    const rowTopClamped = gridH - rowBottomH - Q_GAP;
    const rowMsgsVisible = Math.floor(Math.max(0, rowBottomH - Q_HEADER_H) / MSG_ROW_H);
    const rowCalVisible = Math.floor(Math.max(0, rowBottomH - Q_HEADER_H) / CAL_ROW_H);
    const rowChoresVisible = Math.floor(Math.max(0, rowTopClamped - Q_HEADER_H) / CHORE_ROW_H);
    const rowTasksVisible = Math.floor(Math.max(0, rowTopClamped - Q_HEADER_H) / TASK_ROW_H);

    const colLeftBottomH = Math.max(msgsMinH, gridH - choresEstH - Q_GAP);
    const colRightBottomH = Math.max(calMinH, gridH - tasksEstH - Q_GAP);
    const colLeftTopH = gridH - colLeftBottomH - Q_GAP;
    const colRightTopH = gridH - colRightBottomH - Q_GAP;
    const colChoresVisible = Math.floor(Math.max(0, colLeftTopH - Q_HEADER_H) / CHORE_ROW_H);
    const colTasksVisible = Math.floor(Math.max(0, colRightTopH - Q_HEADER_H) / TASK_ROW_H);
    const colMsgsVisible = Math.floor(Math.max(0, colLeftBottomH - Q_HEADER_H) / MSG_ROW_H);
    const colCalVisible = Math.floor(Math.max(0, colRightBottomH - Q_HEADER_H) / CAL_ROW_H);

    const P = 3;
    const rowScore = P * (rowChoresVisible + rowTasksVisible) + rowMsgsVisible + rowCalVisible;
    const colScore = P * (colChoresVisible + colTasksVisible) + colMsgsVisible + colCalVisible;

    if (colScore > rowScore) {
      let leftBotH = colLeftBottomH;
      let rightBotH = colRightBottomH;
      const shorter = Math.min(leftBotH, rightBotH);
      const shorterIsLeft = leftBotH <= rightBotH;
      const shorterContent = shorterIsLeft ? msgsEstH : calEstH;
      if (shorterContent <= shorter) {
        const longerContent = shorterIsLeft ? calEstH : msgsEstH;
        if (longerContent <= shorter) {
          leftBotH = shorter;
          rightBotH = shorter;
        }
      }
      return {
        mode: 'column',
        leftTopH: gridH - leftBotH - Q_GAP,
        rightTopH: gridH - rightBotH - Q_GAP,
        leftBottomH: leftBotH,
        rightBottomH: rightBotH,
      };
    }

    const topH = Math.min(rowTopH, rowTopClamped);
    const bottomH = gridH - topH - Q_GAP;
    return {
      mode: 'row',
      topH,
      bottomH,
      leftTopH: topH,
      rightTopH: topH,
      leftBottomH: bottomH,
      rightBottomH: bottomH,
    };
  }, [gridH, choresEstH, tasksEstH, msgsEstH, calEstH, msgsMinH, calMinH]);

  const topSplitFrac = useMemo(() => {
    const maxChoreLen = choreRows.reduce((m, r) => Math.max(m, (r.chore.title || '').length), 0);
    const maxTaskLen = taskSeriesCards.reduce((m, c) =>
      c.scheduledTasks.reduce((m2, t) => Math.max(m2, (t.text || '').length), m), 0);
    return calcSplitFrac(maxChoreLen, maxTaskLen, availW);
  }, [choreRows, taskSeriesCards, availW]);

  const bottomSplitFrac = useMemo(() => {
    if (layoutCalc.mode === 'column' && layoutCalc.leftBottomH !== layoutCalc.rightBottomH) {
      return topSplitFrac;
    }
    const maxMsgLen = unreadThreads.reduce((m, t) => Math.max(m, (t.displayName || '').length), 0);
    const maxCalLen = calendarEvents.reduce((m, e) => Math.max(m, (e.title || '').length), 0);
    return calcSplitFrac(maxMsgLen, maxCalLen, availW);
  }, [unreadThreads, calendarEvents, availW, layoutCalc.mode, layoutCalc.leftBottomH, layoutCalc.rightBottomH, topSplitFrac]);

  return { layoutCalc, topSplitFrac, bottomSplitFrac, availW };
}
