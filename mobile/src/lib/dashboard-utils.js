import { formatDateKeyUTC, localDateToUTC } from '@family-organizer/shared-core';

const DAY_RANGE = 7;

export { DAY_RANGE };

export function firstRef(value) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

export function memberRef(member) {
  if (!member) return null;
  if (Array.isArray(member)) return member[0] || null;
  return member;
}

export function completionMemberId(completion) {
  const completedBy = memberRef(completion?.completedBy);
  return completedBy?.id || null;
}

export function completionKey(choreId, memberId, dateKey) {
  return `${choreId}:${memberId}:${dateKey}`;
}

export function formatDayLabel(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

export function formatMonthDay(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatLongDate(date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatWeekdayDate(date) {
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
  const monthDay = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${weekday}, ${monthDay}`;
}

export function formatPossessiveLabel(name, noun) {
  if (!name) return noun === 'day' ? 'Today' : noun;
  return name.endsWith('s') ? `${name}' ${noun}` : `${name}'s ${noun}`;
}

export function buildDateStrip(selectedDate) {
  return Array.from({ length: DAY_RANGE }).map((_, index) => {
    const offset = index - Math.floor(DAY_RANGE / 2);
    return new Date(selectedDate.getTime() + offset * 86400000);
  });
}

export function buildDashboardCalendarWhere(date) {
  const baseYear = date.getFullYear();
  const baseMonth = date.getMonth() + 1;
  const nextMonthDate = new Date(baseYear, date.getMonth() + 1, 1);
  const nextYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth() + 1;
  const conditions = [{ year: baseYear, month: baseMonth }];
  if (nextYear !== baseYear || nextMonth !== baseMonth) {
    conditions.push({ year: nextYear, month: nextMonth });
  }
  return conditions;
}

export function normalizeBalances(envelope) {
  if (envelope?.balances && typeof envelope.balances === 'object' && !Array.isArray(envelope.balances)) {
    return Object.fromEntries(
      Object.entries(envelope.balances)
        .map(([code, amount]) => [String(code).toUpperCase(), Number(amount) || 0])
        .filter(([, amount]) => amount !== 0)
    );
  }
  if (envelope?.currency && envelope?.amount != null) {
    return { [String(envelope.currency).toUpperCase()]: Number(envelope.amount) || 0 };
  }
  return {};
}

export function addBalancesInto(target, source) {
  for (const [code, amount] of Object.entries(source || {})) {
    target[code] = (target[code] || 0) + (Number(amount) || 0);
  }
  return target;
}

export function buildUnitMap(unitDefinitions) {
  return new Map((unitDefinitions || []).map((definition) => [String(definition.code || '').toUpperCase(), definition]));
}

export function formatAmount(code, amount, unitMap) {
  const upper = String(code || '').toUpperCase();
  const unit = unitMap.get(upper);

  if (unit) {
    const symbol = unit.symbol || upper;
    const isMonetary = !!unit.isMonetary;
    const decimals = unit.decimalPlaces ?? (isMonetary ? 2 : 0);
    const placement = unit.symbolPlacement ?? (isMonetary ? 'before' : 'after');
    const spacingValue = unit.symbolSpacing ?? placement === 'after';
    const formatted = Number(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    if (placement === 'before') {
      return spacingValue ? `${symbol} ${formatted}` : `${symbol}${formatted}`;
    }
    return spacingValue ? `${formatted} ${symbol}` : `${formatted}${symbol}`;
  }

  try {
    if (upper.length === 3) {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: upper }).format(Number(amount || 0));
    }
  } catch {
    // Fall through to generic formatting.
  }

  return `${Number(amount || 0).toLocaleString()} ${upper}`.trim();
}

export function formatBalancesInline(balances, unitMap) {
  const entries = Object.entries(balances || {}).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return 'Empty';
  return entries.map(([code, amount]) => formatAmount(code, amount, unitMap)).join(' · ');
}

export function createInitials(name) {
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

export function formatTaskStateLabel(state) {
  switch (state) {
    case 'in_progress': return 'In progress';
    case 'needs_review': return 'Needs review';
    case 'blocked': return 'Blocked';
    case 'skipped': return 'Skipped';
    case 'done': return 'Done';
    default: return 'Not started';
  }
}

export function formatDateKey(date) {
  return formatDateKeyUTC(date);
}

export function getTodayDateKey() {
  return formatDateKeyUTC(localDateToUTC(new Date()));
}
