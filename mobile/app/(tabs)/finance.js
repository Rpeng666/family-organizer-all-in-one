import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { id, tx } from '@instantdb/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAppSession } from '../../src/providers/AppProviders';
import { clearPendingParentAction, getPendingParentAction } from '../../src/lib/session-prefs';
import { useParentActionGate } from '../../src/hooks/useParentActionGate';
import { E, SP, R } from '../../src/theme/E';

function firstRef(value) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

function coerceNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function upperCurrency(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeBalances(envelope) {
  if (envelope?.balances && typeof envelope.balances === 'object' && !Array.isArray(envelope.balances)) {
    return Object.fromEntries(
      Object.entries(envelope.balances)
        .map(([code, amount]) => [String(code).toUpperCase(), coerceNumber(amount)])
        .filter(([, amount]) => amount !== 0)
    );
  }

  if (envelope?.currency && envelope?.amount != null) {
    return { [String(envelope.currency).toUpperCase()]: coerceNumber(envelope.amount) };
  }

  return {};
}

function addBalancesInto(target, source) {
  for (const [code, amount] of Object.entries(source || {})) {
    target[code] = (target[code] || 0) + coerceNumber(amount);
  }
  return target;
}

function withoutZeroBalances(balances) {
  return Object.fromEntries(
    Object.entries(balances || {}).filter(([, amount]) => {
      const num = coerceNumber(amount);
      return num !== 0;
    })
  );
}

function sortBalanceEntries(balances) {
  return Object.entries(balances || {}).sort(([a], [b]) => a.localeCompare(b));
}

function buildUnitMap(unitDefinitions) {
  return new Map((unitDefinitions || []).map((def) => [String(def.code || '').toUpperCase(), def]));
}

function formatAmount(code, amount, unitMap) {
  const upper = String(code || '').toUpperCase();
  const unit = unitMap.get(upper);

  if (unit) {
    const symbol = unit.symbol || upper;
    const isMonetary = !!unit.isMonetary;
    const decimals = unit.decimalPlaces ?? (isMonetary ? 2 : 0);
    const placement = unit.symbolPlacement ?? (isMonetary ? 'before' : 'after');
    const spacing = unit.symbolSpacing ?? placement === 'after';
    const formatted = amount.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    if (placement === 'before') {
      return spacing ? `${symbol} ${formatted}` : `${symbol}${formatted}`;
    }
    return spacing ? `${formatted} ${symbol}` : `${formatted}${symbol}`;
  }

  try {
    if (upper.length === 3) {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: upper }).format(amount);
    }
  } catch {
    // fall through
  }

  const numeric = amount.toLocaleString(undefined, {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 6,
  });
  return `${numeric} ${upper}`.trim();
}

function formatBalancesInline(balances, unitMap) {
  const entries = sortBalanceEntries(balances);
  if (entries.length === 0) return 'Empty';
  return entries.map(([code, amount]) => formatAmount(code, amount, unitMap)).join(' · ');
}

function parseTxDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTimeShort(value) {
  const date = parseTxDate(value);
  if (!date) return 'Unknown time';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function txTypeLabel(type) {
  switch (type) {
    case 'transfer-in':
      return 'Transfer in';
    case 'transfer-out':
      return 'Transfer out';
    case 'withdrawal':
      return 'Withdrawal';
    case 'deposit':
      return 'Deposit';
    default:
      return type ? String(type).replace(/-/g, ' ') : 'Transaction';
  }
}

function txAmountTone(type, amount) {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'deposit' || normalized === 'transfer-in') return 'positive';
  if (normalized === 'withdrawal' || normalized === 'transfer-out') return 'negative';
  return amount >= 0 ? 'neutral' : 'negative';
}

function formatSignedTxAmount(tx, unitMap) {
  const amount = Math.abs(coerceNumber(tx.amount));
  const base = formatAmount(tx.currency || 'USD', amount, unitMap);
  const tone = txAmountTone(tx.transactionType, tx.amount);
  if (tone === 'positive') return `+${base}`;
  if (tone === 'negative') return `-${base}`;
  return base;
}

function getDefaultEnvelope(member) {
  if (!member?.envelopes?.length) return null;
  return member.envelopes.find((env) => env.isDefault) || member.envelopes[0] || null;
}

function getPreferredCurrency(member, envelope) {
  const envelopeBalances = sortBalanceEntries(envelope?.balancesNormalized || {});
  if (envelopeBalances.length > 0) return envelopeBalances[0][0];
  if (member?.allowanceCurrency) return upperCurrency(member.allowanceCurrency);
  return 'USD';
}

function buildAuditFields(authUserId, currentFamilyMemberId) {
  const fields = {};
  if (authUserId) fields.createdBy = authUserId;
  if (currentFamilyMemberId) fields.createdByFamilyMemberId = currentFamilyMemberId;
  return fields;
}

function summarizeAllowance(member, unitMap) {
  const hasAmount = member.allowanceAmount != null && member.allowanceCurrency;
  const amountLabel = hasAmount ? formatAmount(member.allowanceCurrency, coerceNumber(member.allowanceAmount), unitMap) : null;

  let cadence = 'Not configured';
  if (member.allowanceRrule) {
    const rule = String(member.allowanceRrule).toUpperCase();
    if (rule.includes('WEEKLY')) cadence = 'Weekly';
    else if (rule.includes('MONTHLY')) cadence = 'Monthly';
    else if (rule.includes('DAILY')) cadence = 'Daily';
    else cadence = 'Custom recurrence';
  }

  return {
    amountLabel,
    cadence,
    payoutDelayDays: member.allowancePayoutDelayDays ?? 0,
    startDateLabel: member.allowanceStartDate ? new Date(member.allowanceStartDate).toLocaleDateString() : null,
  };
}

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default function FinanceTab() {
  const searchParams = useLocalSearchParams();
  const { requireParentAction } = useParentActionGate();
  const {
    db,
    auth,
    isAuthenticated,
    instantReady,
    isOnline,
    connectionStatus,
    principalType,
    currentUser,
    recordParentActivity,
  } = useAppSession();

  const [selectedMemberId, setSelectedMemberId] = useState('all');
  const [financeModalKind, setFinanceModalKind] = useState(null);
  const [financeModalSubmitting, setFinanceModalSubmitting] = useState(false);
  const [financeModalError, setFinanceModalError] = useState('');
  const [envelopeNameInput, setEnvelopeNameInput] = useState('');
  const [envelopeDescriptionInput, setEnvelopeDescriptionInput] = useState('');
  const [envelopeIsDefaultInput, setEnvelopeIsDefaultInput] = useState(false);
  const [moneyEnvelopeIdInput, setMoneyEnvelopeIdInput] = useState('');
  const [moneyDestinationEnvelopeIdInput, setMoneyDestinationEnvelopeIdInput] = useState('');
  const [moneyAmountInput, setMoneyAmountInput] = useState('');
  const [moneyCurrencyInput, setMoneyCurrencyInput] = useState('USD');
  const [moneyDescriptionInput, setMoneyDescriptionInput] = useState('');
  const [resumePendingAction, setResumePendingAction] = useState(null);
  const [handledResumeNonce, setHandledResumeNonce] = useState('');
  const requestedMemberId = String(firstParam(searchParams.memberId) || '');

  const financeBaseQuery = db.useQuery(
    isAuthenticated && instantReady
      ? {
          familyMembers: {
            $: { order: { order: 'asc' } },
            allowanceEnvelopes: {},
          },
          unitDefinitions: {},
        }
      : null
  );

  const transactionsQuery = db.useQuery(
    isAuthenticated && instantReady
      ? {
          allowanceTransactions: {
            $: { order: { createdAt: 'desc' }, first: 40 },
            envelope: { familyMember: {} },
            sourceEnvelope: { familyMember: {} },
            destinationEnvelope: { familyMember: {} },
          },
        }
      : null
  );

  const familyMembers = useMemo(() => financeBaseQuery.data?.familyMembers || [], [financeBaseQuery.data?.familyMembers]);
  const unitDefinitions = useMemo(() => financeBaseQuery.data?.unitDefinitions || [], [financeBaseQuery.data?.unitDefinitions]);
  const transactions = useMemo(() => transactionsQuery.data?.allowanceTransactions || [], [transactionsQuery.data?.allowanceTransactions]);
  const unitMap = useMemo(() => buildUnitMap(unitDefinitions), [unitDefinitions]);
  const financeLoading = (financeBaseQuery.isLoading && familyMembers.length === 0) || (transactionsQuery.isLoading && transactions.length === 0);
  const financeError = financeBaseQuery.error || transactionsQuery.error;

  const membersWithFinance = useMemo(() => {
    return familyMembers.map((member) => {
      const envelopes = (member.allowanceEnvelopes || []).map((envelope) => ({
        ...envelope,
        balancesNormalized: normalizeBalances(envelope),
      }));

      const totalBalances = envelopes.reduce((acc, env) => addBalancesInto(acc, env.balancesNormalized), {});
      const envelopeIds = new Set(envelopes.map((env) => env.id));

      return {
        ...member,
        envelopes,
        envelopeIds,
        totalBalances,
      };
    });
  }, [familyMembers]);

  const selectedMember = useMemo(
    () => (selectedMemberId === 'all' ? null : membersWithFinance.find((member) => member.id === selectedMemberId) || null),
    [membersWithFinance, selectedMemberId]
  );
  const isParentPrincipal = principalType === 'parent';
  const isKidPrincipal = principalType === 'kid';
  const currentUserId = currentUser?.id || '';
  const isKidSelfServeUser = isKidPrincipal && currentUser?.role !== 'parent';
  const selectedMemberEnvelopes = useMemo(() => selectedMember?.envelopes || [], [selectedMember?.envelopes]);
  const selectedMoneyEnvelope = useMemo(
    () => selectedMemberEnvelopes.find((env) => env.id === moneyEnvelopeIdInput) || null,
    [moneyEnvelopeIdInput, selectedMemberEnvelopes]
  );
  const envelopeById = useMemo(() => {
    const map = new Map();
    membersWithFinance.forEach((member) => {
      member.envelopes.forEach((envelope) => {
        map.set(envelope.id, {
          ...envelope,
          ownerMember: member,
        });
      });
    });
    return map;
  }, [membersWithFinance]);
  const selectedMoneyDestinationEnvelope = useMemo(
    () => envelopeById.get(moneyDestinationEnvelopeIdInput) || null,
    [envelopeById, moneyDestinationEnvelopeIdInput]
  );
  const transferDestinationOptions = useMemo(
    () => Array.from(envelopeById.values()).filter((envelope) => envelope.id !== moneyEnvelopeIdInput),
    [envelopeById, moneyEnvelopeIdInput]
  );

  const visibleMembers = useMemo(
    () => (selectedMember ? [selectedMember] : membersWithFinance),
    [membersWithFinance, selectedMember]
  );

  const familyCombinedBalances = useMemo(
    () => visibleMembers.reduce((acc, member) => addBalancesInto(acc, member.totalBalances), {}),
    [visibleMembers]
  );

  const transactionRows = useMemo(() => {
    const allowedEnvelopeIds = selectedMember ? selectedMember.envelopeIds : null;
    const selectedId = selectedMember?.id || null;

    return transactions
      .filter((tx) => {
        if (!selectedMember) return true;

        const envelope = firstRef(tx.envelope);
        const sourceEnvelope = firstRef(tx.sourceEnvelope);
        const destinationEnvelope = firstRef(tx.destinationEnvelope);

        if (envelope?.id && allowedEnvelopeIds.has(envelope.id)) return true;
        if (sourceEnvelope?.id && allowedEnvelopeIds.has(sourceEnvelope.id)) return true;
        if (destinationEnvelope?.id && allowedEnvelopeIds.has(destinationEnvelope.id)) return true;
        if (tx.createdByFamilyMemberId && tx.createdByFamilyMemberId === selectedId) return true;
        return false;
      })
      .sort((a, b) => {
        const aTime = parseTxDate(a.createdAt)?.getTime() || 0;
        const bTime = parseTxDate(b.createdAt)?.getTime() || 0;
        return bTime - aTime;
      })
      .slice(0, 20)
      .map((tx) => {
        const envelope = firstRef(tx.envelope);
        const sourceEnvelope = firstRef(tx.sourceEnvelope);
        const destinationEnvelope = firstRef(tx.destinationEnvelope);
        const envelopeOwner = firstRef(envelope?.familyMember);
        const sourceOwner = firstRef(sourceEnvelope?.familyMember);
        const destinationOwner = firstRef(destinationEnvelope?.familyMember);
        const tone = txAmountTone(tx.transactionType, tx.amount);

        let counterparty = null;
        if (tx.transactionType === 'transfer-out' && destinationEnvelope?.name) {
          counterparty = `to ${destinationEnvelope.name}${destinationOwner?.name ? ` (${destinationOwner.name})` : ''}`;
        } else if (tx.transactionType === 'transfer-in' && sourceEnvelope?.name) {
          counterparty = `from ${sourceEnvelope.name}${sourceOwner?.name ? ` (${sourceOwner.name})` : ''}`;
        } else if (envelope?.name) {
          counterparty = `in ${envelope.name}${envelopeOwner?.name ? ` (${envelopeOwner.name})` : ''}`;
        }

        return {
          ...tx,
          tone,
          signedAmountLabel: formatSignedTxAmount(tx, unitMap),
          dateLabel: formatDateTimeShort(tx.createdAt),
          typeLabel: txTypeLabel(tx.transactionType),
          counterparty,
        };
      });
  }, [selectedMember, transactions, unitMap]);

  useEffect(() => {
    const shouldResume = firstParam(searchParams.resumeParentAction) === '1';
    const resumeNonce = String(firstParam(searchParams.resumeNonce) || '');
    if (!shouldResume || !resumeNonce || resumeNonce === handledResumeNonce) return;

    let cancelled = false;
    async function loadPendingAction() {
      const pending = await getPendingParentAction();
      if (cancelled) return;
      setHandledResumeNonce(resumeNonce);
      if (pending?.actionId?.startsWith('finance:')) {
        setResumePendingAction(pending);
      }
    }

    void loadPendingAction();
    return () => {
      cancelled = true;
    };
  }, [handledResumeNonce, searchParams.resumeNonce, searchParams.resumeParentAction]);

  useEffect(() => {
    if (!requestedMemberId || financeBaseQuery.isLoading) return;
    if (requestedMemberId === 'all') {
      if (selectedMemberId !== 'all') {
        setSelectedMemberId('all');
      }
      return;
    }

    const hasMember = membersWithFinance.some((member) => member.id === requestedMemberId);
    if (!hasMember) return;
    if (selectedMemberId !== requestedMemberId) {
      setSelectedMemberId(requestedMemberId);
    }
  }, [financeBaseQuery.isLoading, membersWithFinance, requestedMemberId, selectedMemberId]);

  useEffect(() => {
    if (!resumePendingAction) return;
    if (!isAuthenticated || principalType !== 'parent') return;

    const pendingActionId = resumePendingAction.actionId;
    if (!pendingActionId.startsWith('finance:')) {
      void clearPendingParentAction();
      setResumePendingAction(null);
      return;
    }

    const kind = pendingActionId.replace('finance:', '');
    const payloadMemberId = resumePendingAction.payload?.selectedMemberId;
    const resumeMemberId =
      (payloadMemberId && payloadMemberId !== 'all' ? payloadMemberId : null) ||
      currentUser?.id ||
      membersWithFinance[0]?.id ||
      null;

    if (resumeMemberId && selectedMemberId !== resumeMemberId) {
      setSelectedMemberId(resumeMemberId);
      return;
    }

    if (resumeMemberId && !membersWithFinance.some((member) => member.id === resumeMemberId)) {
      return;
    }

    void (async () => {
      await openFinanceAction(kind, { skipParentGate: true });
      await clearPendingParentAction();
      setResumePendingAction(null);
    })();
  }, [currentUser?.id, isAuthenticated, membersWithFinance, principalType, resumePendingAction, selectedMemberId]); // eslint-disable-line react-hooks/exhaustive-deps

  function getFinanceActionLabel(kind) {
    switch (kind) {
      case 'add-envelope':
        return 'Add envelope';
      case 'delete-envelope':
        return 'Delete envelope';
      case 'deposit':
        return 'Deposit funds';
      case 'withdraw':
        return 'Withdraw funds';
      case 'transfer':
        return 'Transfer funds';
      default:
        return 'Finance action';
    }
  }

  function isKidAllowedFinanceAction(kind) {
    return kind === 'add-envelope' || kind === 'delete-envelope' || kind === 'transfer';
  }

  function isActionParentOnly(kind) {
    return kind === 'deposit' || kind === 'withdraw';
  }

  function isActionVisuallyLocked(kind) {
    if (isParentPrincipal) return false;
    return isActionParentOnly(kind);
  }

  function canRunFinanceAction(kind, memberId) {
    if (isParentPrincipal) return true;
    if (!isKidSelfServeUser) return false;
    if (!memberId || !currentUserId) return false;
    if (memberId !== currentUserId) return false;
    return isKidAllowedFinanceAction(kind);
  }

  const financeModalTitle = useMemo(() => {
    switch (financeModalKind) {
      case 'add-envelope':
        return 'Add Envelope';
      case 'delete-envelope':
        return 'Delete Envelope';
      case 'deposit':
        return 'Deposit Funds';
      case 'withdraw':
        return 'Withdraw Funds';
      case 'transfer':
        return 'Transfer Funds';
      default:
        return 'Finance Action';
    }
  }, [financeModalKind]);

  const financeModalSubmitLabel = useMemo(() => {
    if (financeModalSubmitting) return 'Saving...';
    switch (financeModalKind) {
      case 'add-envelope':
        return 'Create Envelope';
      case 'delete-envelope':
        return 'Delete Envelope';
      case 'deposit':
        return 'Deposit';
      case 'withdraw':
        return 'Withdraw';
      case 'transfer':
        return 'Transfer';
      default:
        return 'Save';
    }
  }, [financeModalKind, financeModalSubmitting]);

  function closeFinanceModal() {
    setFinanceModalKind(null);
    setFinanceModalSubmitting(false);
    setFinanceModalError('');
  }

  function requireSelectedMember() {
    const fallbackMember =
      selectedMember || membersWithFinance.find((member) => member.id === currentUser?.id) || null;

    if (!fallbackMember) {
      Alert.alert('Choose a member', 'Select a family member first so the finance action knows whose envelopes to update.');
      return null;
    }

    if (!selectedMember && fallbackMember?.id) {
      setSelectedMemberId(fallbackMember.id);
    }

    return fallbackMember;
  }

  function resolveFinanceActionMember(kind) {
    const member = requireSelectedMember();
    if (!member) return null;

    if (!isKidSelfServeUser || !isKidAllowedFinanceAction(kind)) {
      return member;
    }

    if (!currentUserId) return member;
    if (member.id === currentUserId) return member;

    const selfMember = membersWithFinance.find((item) => item.id === currentUserId) || null;
    if (!selfMember) {
      Alert.alert('Login required', 'Choose your own profile before using kid finance actions.');
      return null;
    }

    setSelectedMemberId(selfMember.id);
    return selfMember;
  }

  async function requestParentFinanceLogin(kind, memberId) {
    await requireParentAction({
      actionId: `finance:${kind}`,
      actionLabel: getFinanceActionLabel(kind),
      payload: {
        selectedMemberId: memberId || currentUserId || (selectedMemberId === 'all' ? '' : selectedMemberId),
      },
      returnPath: '/finance',
    });
  }

  async function openFinanceAction(kind, opts = {}) {
    recordParentActivity();
    setFinanceModalError('');

    const skipParentGate = !!opts.skipParentGate;
    const member = resolveFinanceActionMember(kind);
    if (!member) return;

    if (!skipParentGate && !canRunFinanceAction(kind, member.id)) {
      await requestParentFinanceLogin(kind, member.id);
      return;
    }

    const defaultEnvelope = getDefaultEnvelope(member);
    const firstEnvelope = member.envelopes[0] || null;

    if (kind !== 'add-envelope' && member.envelopes.length === 0) {
      Alert.alert('No envelopes yet', 'Create an envelope first before using this action.');
      return;
    }

    if (kind === 'add-envelope') {
      setEnvelopeNameInput(member.envelopes.length === 0 ? 'Savings' : `Envelope ${member.envelopes.length + 1}`);
      setEnvelopeDescriptionInput('');
      setEnvelopeIsDefaultInput(member.envelopes.length === 0);
      setMoneyEnvelopeIdInput('');
      setMoneyDestinationEnvelopeIdInput('');
      setMoneyAmountInput('');
      setMoneyCurrencyInput(member.allowanceCurrency ? upperCurrency(member.allowanceCurrency) : 'USD');
      setMoneyDescriptionInput('');
      setFinanceModalKind(kind);
      return;
    }

    if (kind === 'delete-envelope') {
      const sourceEnvelope = defaultEnvelope || firstEnvelope;
      setMoneyEnvelopeIdInput(sourceEnvelope?.id || '');
      setMoneyDestinationEnvelopeIdInput('');
      setMoneyAmountInput('');
      setMoneyCurrencyInput(getPreferredCurrency(member, sourceEnvelope));
      setMoneyDescriptionInput('');
      setFinanceModalKind(kind);
      return;
    }

    const sourceEnvelope = defaultEnvelope || firstEnvelope;
    const destinationEnvelope =
      kind === 'transfer'
        ? Array.from(envelopeById.values()).find((envelope) => envelope.id !== sourceEnvelope?.id) || null
        : null;

    if (kind === 'transfer' && !destinationEnvelope) {
      Alert.alert('Need another envelope', 'Transfers require a destination envelope in this family.');
      return;
    }

    setMoneyEnvelopeIdInput(sourceEnvelope?.id || '');
    setMoneyDestinationEnvelopeIdInput(destinationEnvelope?.id || '');
    setMoneyAmountInput('');
    setMoneyCurrencyInput(getPreferredCurrency(member, sourceEnvelope));
    setMoneyDescriptionInput('');
    setFinanceModalKind(kind);
  }

  async function submitFinanceAction() {
    if (!financeModalKind) return;
    const member = resolveFinanceActionMember(financeModalKind);
    if (!member) return;

    if (!canRunFinanceAction(financeModalKind, member.id)) {
      await requestParentFinanceLogin(financeModalKind, member.id);
      return;
    }

    setFinanceModalSubmitting(true);
    setFinanceModalError('');
    const auditFields = buildAuditFields(auth?.user?.id, currentUser?.id);
    const nowIso = new Date().toISOString();

    try {
      if (financeModalKind === 'add-envelope') {
        const name = envelopeNameInput.trim();
        if (!name) throw new Error('Envelope name is required.');
        const description = envelopeDescriptionInput.trim();
        const shouldBeDefault = member.envelopes.length === 0 ? true : !!envelopeIsDefaultInput;
        const newEnvelopeId = id();
        const envelopePayload = {
          name,
          balances: {},
          isDefault: shouldBeDefault,
          ...(description ? { description } : {}),
        };

        const transactionsToRun = [];
        if (shouldBeDefault) {
          member.envelopes.forEach((env) => {
            if (env.isDefault) {
              transactionsToRun.push(tx.allowanceEnvelopes[env.id].update({ isDefault: false }));
            }
          });
        }

        transactionsToRun.push(tx.allowanceEnvelopes[newEnvelopeId].update(envelopePayload));
        transactionsToRun.push(tx.allowanceEnvelopes[newEnvelopeId].link({ familyMember: member.id }));

        await db.transact(transactionsToRun);
        closeFinanceModal();
        return;
      }

      if (financeModalKind === 'delete-envelope') {
        const envelopeToDelete = selectedMoneyEnvelope;
        if (!envelopeToDelete) throw new Error('Select an envelope to delete.');

        const hasRemainingBalance = Object.values(envelopeToDelete.balancesNormalized || {}).some(
          (value) => coerceNumber(value) !== 0
        );
        if (hasRemainingBalance) {
          throw new Error('Transfer or withdraw all funds before deleting this envelope.');
        }

        const siblingEnvelopes = member.envelopes.filter((envelope) => envelope.id !== envelopeToDelete.id);
        const txs = [];
        if (envelopeToDelete.isDefault && siblingEnvelopes.length > 0) {
          txs.push(tx.allowanceEnvelopes[siblingEnvelopes[0].id].update({ isDefault: true }));
        }
        txs.push(tx.allowanceEnvelopes[envelopeToDelete.id].delete());

        await db.transact(txs);
        closeFinanceModal();
        return;
      }

      const amount = coerceNumber(moneyAmountInput);
      const currency = upperCurrency(moneyCurrencyInput);
      if (!currency || currency.length < 2) throw new Error('Enter a valid currency code (for example: USD or NPR).');
      if (!(amount > 0)) throw new Error('Amount must be greater than zero.');

      const sourceEnvelope = selectedMoneyEnvelope;
      if (!sourceEnvelope) throw new Error('Select an envelope.');
      const sourceBalances = { ...(sourceEnvelope.balancesNormalized || {}) };
      const description = moneyDescriptionInput.trim();
      if (isKidSelfServeUser && !isParentPrincipal && member.id !== currentUserId) {
        throw new Error('Kids can only move funds from their own envelopes.');
      }

      if (financeModalKind === 'deposit') {
        const updatedBalances = withoutZeroBalances({
          ...sourceBalances,
          [currency]: coerceNumber(sourceBalances[currency]) + amount,
        });
        const txId = id();
        await db.transact([
          tx.allowanceEnvelopes[sourceEnvelope.id].update({ balances: updatedBalances }),
          tx.allowanceTransactions[txId].update({
            ...auditFields,
            amount,
            currency,
            transactionType: 'deposit',
            envelope: sourceEnvelope.id,
            destinationEnvelope: sourceEnvelope.id,
            description: description || `Deposit to ${sourceEnvelope.name}`,
            createdAt: nowIso,
            updatedAt: nowIso,
          }),
          tx.allowanceEnvelopes[sourceEnvelope.id].link({ transactions: txId }),
        ]);
        closeFinanceModal();
        return;
      }

      if (financeModalKind === 'withdraw') {
        const available = coerceNumber(sourceBalances[currency]);
        if (available < amount) {
          throw new Error(`Insufficient ${currency}. Available: ${formatAmount(currency, available, unitMap)}.`);
        }
        const updatedBalances = { ...sourceBalances };
        const remaining = available - amount;
        if (remaining === 0) delete updatedBalances[currency];
        else updatedBalances[currency] = remaining;
        const txId = id();
        await db.transact([
          tx.allowanceEnvelopes[sourceEnvelope.id].update({ balances: withoutZeroBalances(updatedBalances) }),
          tx.allowanceTransactions[txId].update({
            ...auditFields,
            amount: -amount,
            currency,
            transactionType: 'withdrawal',
            envelope: sourceEnvelope.id,
            description: description || `Withdrawal from ${sourceEnvelope.name}`,
            createdAt: nowIso,
            updatedAt: nowIso,
          }),
          tx.allowanceEnvelopes[sourceEnvelope.id].link({ transactions: txId }),
        ]);
        closeFinanceModal();
        return;
      }

      if (financeModalKind === 'transfer') {
        const destinationEnvelope = selectedMoneyDestinationEnvelope;
        if (!destinationEnvelope) throw new Error('Select a destination envelope.');
        if (destinationEnvelope.id === sourceEnvelope.id) throw new Error('Source and destination envelopes must be different.');

        const available = coerceNumber(sourceBalances[currency]);
        if (available < amount) {
          throw new Error(`Insufficient ${currency}. Available: ${formatAmount(currency, available, unitMap)}.`);
        }

        const destinationBalances = { ...(destinationEnvelope.balancesNormalized || {}) };
        const sourceUpdated = { ...sourceBalances };
        const sourceRemaining = available - amount;
        if (sourceRemaining === 0) delete sourceUpdated[currency];
        else sourceUpdated[currency] = sourceRemaining;
        const destinationUpdated = withoutZeroBalances({
          ...destinationBalances,
          [currency]: coerceNumber(destinationBalances[currency]) + amount,
        });

        const transferDescription = description || `Transfer from ${sourceEnvelope.name} to ${destinationEnvelope.name}`;
        const txOutId = id();
        const txInId = id();

        await db.transact([
          tx.allowanceEnvelopes[sourceEnvelope.id].update({ balances: withoutZeroBalances(sourceUpdated) }),
          tx.allowanceEnvelopes[destinationEnvelope.id].update({ balances: destinationUpdated }),
          tx.allowanceTransactions[txOutId].update({
            ...auditFields,
            amount: -amount,
            currency,
            transactionType: 'transfer-out',
            envelope: sourceEnvelope.id,
            sourceEnvelope: sourceEnvelope.id,
            destinationEnvelope: destinationEnvelope.id,
            description: transferDescription,
            createdAt: nowIso,
            updatedAt: nowIso,
          }),
          tx.allowanceTransactions[txInId].update({
            ...auditFields,
            amount,
            currency,
            transactionType: 'transfer-in',
            envelope: destinationEnvelope.id,
            sourceEnvelope: sourceEnvelope.id,
            destinationEnvelope: destinationEnvelope.id,
            description: transferDescription,
            createdAt: nowIso,
            updatedAt: nowIso,
          }),
          tx.allowanceEnvelopes[sourceEnvelope.id].link({ outgoingTransfers: txOutId, transactions: txOutId }),
          tx.allowanceEnvelopes[destinationEnvelope.id].link({ incomingTransfers: txInId, transactions: txInId }),
        ]);
        closeFinanceModal();
        return;
      }

      closeFinanceModal();
    } catch (error) {
      setFinanceModalSubmitting(false);
      setFinanceModalError(error?.message || 'Unable to complete the action.');
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={E.bg} />

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={s.heroCard}>
          <View>
            <Text style={s.heroEyebrow}>Allowance Overview</Text>
            <Text style={s.heroTitle}>{selectedMember ? selectedMember.name : 'Family totals'}</Text>
            <Text style={s.heroSub}>
              {selectedMember
                ? `${selectedMember.envelopes.length} envelope${selectedMember.envelopes.length === 1 ? '' : 's'}`
                : `${membersWithFinance.length} members · ${membersWithFinance.reduce((sum, m) => sum + m.envelopes.length, 0)} envelopes`}
              {currentUser?.name ? ` · ${currentUser.name}` : ''}
            </Text>
            <Text style={s.heroBalances}>{formatBalancesInline(familyCombinedBalances, unitMap)}</Text>
          </View>
          <View style={s.heroBadge}>
            <Text style={s.heroBadgeText}>
              {isParentPrincipal ? 'Parent' : isKidSelfServeUser ? 'Kid self-serve' : 'Read-only'}
            </Text>
          </View>
        </View>

        {/* Member filter */}
        <View style={s.panel}>
          <View style={s.panelHead}>
            <Text style={s.panelTitle}>Members</Text>
            <Text style={s.metaText}>Tap to filter</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
            <Pressable
              testID="finance-member-filter-all"
              accessibilityRole="button"
              accessibilityLabel="Show family finance for all members"
              onPress={() => { recordParentActivity(); setSelectedMemberId('all'); }}
              style={[s.chip, selectedMemberId === 'all' && s.chipSelected]}
            >
              <Text style={[s.chipText, selectedMemberId === 'all' && s.chipTextSelected]}>All</Text>
            </Pressable>
            {membersWithFinance.map((member) => {
              const selected = selectedMemberId === member.id;
              return (
                <Pressable
                  key={`finance-member-${member.id}`}
                  testID={`finance-member-filter-${member.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Show finance for ${member.name}`}
                  onPress={() => { recordParentActivity(); setSelectedMemberId(member.id); }}
                  style={[s.chip, selected && s.chipSelected]}
                >
                  <Text style={[s.chipText, selected && s.chipTextSelected]}>{member.name}</Text>
                  <Text style={[s.chipMeta, selected && s.chipMetaSelected]}>{member.allowanceEnvelopes?.length || 0} env</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Actions */}
        <View style={s.panel}>
          <View style={s.panelHead}>
            <Text style={s.panelTitle}>Actions</Text>
            <Text style={s.metaText}>{isParentPrincipal ? 'All available' : 'Deposit/withdraw need parent'}</Text>
          </View>

          {!selectedMember ? (
            <Text style={s.emptyText}>Select a family member above to manage envelopes and funds.</Text>
          ) : (
            <View style={s.scopeCard}>
              <Text style={s.scopeTitle}>{selectedMember.name}</Text>
              <Text style={s.scopeMeta}>
                {selectedMember.envelopes.length} envelope{selectedMember.envelopes.length === 1 ? '' : 's'} · {formatBalancesInline(selectedMember.totalBalances, unitMap)}
              </Text>
            </View>
          )}

          <View style={s.actionGrid}>
            {[
              { key: 'add-envelope', label: 'Add Envelope', primary: true },
              { key: 'delete-envelope', label: 'Delete Envelope' },
              { key: 'deposit', label: 'Deposit' },
              { key: 'withdraw', label: 'Withdraw' },
              { key: 'transfer', label: 'Transfer' },
            ].map(({ key, label, primary }) => (
              <Pressable
                key={key}
                testID={`finance-open-${key}`}
                accessibilityRole="button"
                accessibilityLabel={`Open ${label} action`}
                onPress={() => { void openFinanceAction(key); }}
                style={[s.actionBtn, primary && s.actionBtnPrimary, isActionVisuallyLocked(key) && s.actionBtnLocked]}
              >
                <Text style={[s.actionBtnText, isActionVisuallyLocked(key) && s.actionBtnTextLocked]}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {selectedMember && selectedMember.envelopes.length === 0 ? (
            <Text style={s.helperText}>Create an initial envelope first (e.g. "Savings"), then use other finance actions.</Text>
          ) : null}
        </View>

        {/* Allowance settings */}
        <View style={s.panel}>
          <View style={s.panelHead}>
            <Text style={s.panelTitle}>Allowance Settings</Text>
            <Text style={s.metaText}>{selectedMember ? selectedMember.name : 'Visible members'}</Text>
          </View>
          <View style={s.memberCards}>
            {visibleMembers.length === 0 ? (
              <Text style={s.emptyText}>No family members available.</Text>
            ) : (
              visibleMembers.map((member) => {
                const summary = summarizeAllowance(member, unitMap);
                return (
                  <View key={`allowance-summary-${member.id}`} style={s.memberCard}>
                    <View style={s.memberCardHead}>
                      <Text style={s.memberCardName}>{member.name}</Text>
                      <Text style={[s.roleTag, member.role === 'parent' ? s.roleTagParent : s.roleTagKid]}>
                        {member.role || 'member'}
                      </Text>
                    </View>
                    <Text style={s.allowanceAmount}>{summary.amountLabel || 'No allowance amount set'}</Text>
                    <Text style={s.allowanceMeta}>
                      {summary.cadence}
                      {summary.startDateLabel ? ` · starts ${summary.startDateLabel}` : ''}
                      {summary.payoutDelayDays ? ` · delay ${summary.payoutDelayDays}d` : ''}
                    </Text>
                    <Text style={s.allowanceTotal}>Total: {formatBalancesInline(member.totalBalances, unitMap)}</Text>
                  </View>
                );
              })
            )}
          </View>
        </View>

        {/* Envelopes */}
        <View style={s.panel}>
          <View style={s.panelHead}>
            <Text style={s.panelTitle}>Envelopes</Text>
            <Text style={s.metaText}>{visibleMembers.reduce((sum, m) => sum + m.envelopes.length, 0)} total</Text>
          </View>
          {visibleMembers.length === 0 ? (
            <Text style={s.emptyText}>No members selected.</Text>
          ) : visibleMembers.every((m) => m.envelopes.length === 0) ? (
            <Text style={s.emptyText}>No envelopes yet. Use "Add Envelope" above to create one.</Text>
          ) : (
            <View style={s.envelopeSections}>
              {visibleMembers.map((member) => (
                <View key={`member-envelopes-${member.id}`} style={s.envelopeSection}>
                  <View style={s.envelopeSectionHead}>
                    <Text style={s.envelopeSectionTitle}>{member.name}</Text>
                    <Text style={s.envelopeSectionMeta}>{member.envelopes.length} env</Text>
                  </View>
                  {member.envelopes.length === 0 ? (
                    <Text style={s.emptyInline}>No envelopes</Text>
                  ) : (
                    member.envelopes.map((envelope) => (
                      <View key={`envelope-${envelope.id}`} style={s.envelopeCard}>
                        <View style={s.envelopeHead}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.envelopeName}>{envelope.name || 'Untitled envelope'}</Text>
                            {!!envelope.description ? <Text style={s.envelopeDesc}>{envelope.description}</Text> : null}
                          </View>
                          {envelope.isDefault ? (
                            <Text style={s.defaultTag}>Default</Text>
                          ) : null}
                        </View>
                        <Text style={s.envelopeBalances}>{formatBalancesInline(envelope.balancesNormalized, unitMap)}</Text>
                        {envelope.goalAmount != null && envelope.goalCurrency ? (
                          <Text style={s.envelopeGoal}>Goal: {formatAmount(envelope.goalCurrency, coerceNumber(envelope.goalAmount), unitMap)}</Text>
                        ) : null}
                      </View>
                    ))
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Transactions */}
        <View style={s.panel}>
          <View style={s.panelHead}>
            <Text style={s.panelTitle}>Recent Transactions</Text>
            <Text style={s.metaText}>{selectedMember ? selectedMember.name : 'Family'} · latest {Math.min(20, transactionRows.length)}</Text>
          </View>

          {financeError ? (
            <Text style={s.errorText}>{financeError.message || 'Failed to load finance data'}</Text>
          ) : financeLoading ? (
            <Text style={s.emptyText}>Loading…</Text>
          ) : transactionRows.length === 0 ? (
            <Text style={s.emptyText}>No transactions found.</Text>
          ) : (
            <View style={s.txList}>
              {transactionRows.map((txRow) => (
                <View key={`tx-${txRow.id}`} style={s.txCard}>
                  <View style={s.txTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.txType}>{txRow.typeLabel}</Text>
                      <Text style={s.txMeta}>
                        {txRow.dateLabel}{txRow.counterparty ? ` · ${txRow.counterparty}` : ''}
                      </Text>
                    </View>
                    <Text style={[s.txAmount, txRow.tone === 'positive' && s.txAmountPos, txRow.tone === 'negative' && s.txAmountNeg]}>
                      {txRow.signedAmountLabel}
                    </Text>
                  </View>
                  {!!txRow.description ? <Text style={s.txDesc}>{txRow.description}</Text> : null}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Finance action modal */}
      <Modal
        visible={!!financeModalKind}
        transparent
        animationType="slide"
        onRequestClose={closeFinanceModal}
        presentationStyle="overFullScreen"
      >
        <View style={s.modalBackdrop}>
          <KeyboardAvoidingView
            style={s.modalKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
          >
            <Pressable style={s.modalScrim} onPress={closeFinanceModal} />
            <View style={s.modalSheet}>
              <View style={s.modalHandle} />
              <View style={s.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.modalTitle}>{financeModalTitle}</Text>
                  <Text style={s.modalSub}>
                    {selectedMember
                      ? `${selectedMember.name} · ${selectedMember.envelopes.length} envelope${selectedMember.envelopes.length === 1 ? '' : 's'}`
                      : 'Choose a member first.'}
                  </Text>
                </View>
                <Pressable
                  testID="finance-close-modal"
                  accessibilityRole="button"
                  accessibilityLabel="Close finance action modal"
                  onPress={closeFinanceModal}
                  style={s.modalCloseBtn}
                >
                  <Text style={s.modalCloseBtnText}>Close</Text>
                </Pressable>
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.modalForm}>
                {financeModalError ? <Text style={s.modalError}>{financeModalError}</Text> : null}

                {financeModalKind === 'add-envelope' ? (
                  <>
                    <View style={s.fieldBlock}>
                      <Text style={s.fieldLabel}>Envelope Name</Text>
                      <TextInput
                        testID="finance-envelope-name-input"
                        accessibilityLabel="Envelope name"
                        value={envelopeNameInput}
                        onChangeText={setEnvelopeNameInput}
                        editable={!financeModalSubmitting}
                        placeholder="Savings"
                        placeholderTextColor={E.inkMuted}
                        style={s.textInput}
                        onFocus={recordParentActivity}
                      />
                    </View>

                    <View style={s.fieldBlock}>
                      <Text style={s.fieldLabel}>Description (optional)</Text>
                      <TextInput
                        testID="finance-envelope-description-input"
                        accessibilityLabel="Envelope description"
                        value={envelopeDescriptionInput}
                        onChangeText={setEnvelopeDescriptionInput}
                        editable={!financeModalSubmitting}
                        placeholder="School spending"
                        placeholderTextColor={E.inkMuted}
                        style={[s.textInput, s.textArea]}
                        multiline
                        textAlignVertical="top"
                        onFocus={recordParentActivity}
                      />
                    </View>

                    <View style={s.switchRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.switchTitle}>Set as default envelope</Text>
                        <Text style={s.switchMeta}>First envelope is always default.</Text>
                      </View>
                      <Switch
                        value={selectedMember && selectedMember.envelopes.length === 0 ? true : envelopeIsDefaultInput}
                        onValueChange={setEnvelopeIsDefaultInput}
                        disabled={financeModalSubmitting || (selectedMember && selectedMember.envelopes.length === 0)}
                        trackColor={{ false: E.border, true: E.ok }}
                        thumbColor={E.white}
                      />
                    </View>
                  </>
                ) : null}

                {financeModalKind && financeModalKind !== 'add-envelope' ? (
                  <>
                    <View style={s.fieldBlock}>
                      <Text style={s.fieldLabel}>Source Envelope</Text>
                      <View style={s.selectorWrap}>
                        {selectedMemberEnvelopes.map((envelope) => {
                          const selected = moneyEnvelopeIdInput === envelope.id;
                          return (
                            <Pressable
                              key={`modal-source-${envelope.id}`}
                              testID={`finance-source-envelope-${envelope.id}`}
                              accessibilityRole="button"
                              accessibilityLabel={`Select source envelope ${envelope.name}`}
                              onPress={() => {
                                recordParentActivity();
                                setMoneyEnvelopeIdInput(envelope.id);
                                if (financeModalKind === 'transfer' && moneyDestinationEnvelopeIdInput === envelope.id) {
                                  const fallback = transferDestinationOptions.find((env) => env.id !== envelope.id);
                                  setMoneyDestinationEnvelopeIdInput(fallback?.id || '');
                                }
                                setMoneyCurrencyInput(getPreferredCurrency(selectedMember, envelope));
                              }}
                              style={[s.selectorChip, selected && s.selectorChipSelected]}
                            >
                              <Text style={[s.selectorChipName, selected && s.selectorChipNameSelected]}>{envelope.name}</Text>
                              <Text style={[s.selectorChipMeta, selected && s.selectorChipMetaSelected]}>
                                {formatBalancesInline(envelope.balancesNormalized, unitMap)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    {financeModalKind === 'transfer' ? (
                      <View style={s.fieldBlock}>
                        <Text style={s.fieldLabel}>Destination Envelope</Text>
                        <View style={s.selectorWrap}>
                          {transferDestinationOptions.map((envelope) => {
                            const selected = moneyDestinationEnvelopeIdInput === envelope.id;
                            return (
                              <Pressable
                                key={`modal-dest-${envelope.id}`}
                                testID={`finance-destination-envelope-${envelope.id}`}
                                accessibilityRole="button"
                                accessibilityLabel={`Select destination envelope ${envelope.name}`}
                                onPress={() => { recordParentActivity(); setMoneyDestinationEnvelopeIdInput(envelope.id); }}
                                style={[s.selectorChip, selected && s.selectorChipSelected]}
                              >
                                <Text style={[s.selectorChipName, selected && s.selectorChipNameSelected]}>{envelope.name}</Text>
                                <Text style={[s.selectorChipMeta, selected && s.selectorChipMetaSelected]}>
                                  {envelope.ownerMember?.name ? `${envelope.ownerMember.name} · ` : ''}
                                  {formatBalancesInline(envelope.balancesNormalized, unitMap)}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    ) : null}

                    {financeModalKind === 'delete-envelope' ? (
                      <Text style={s.warnText}>Deleting removes this envelope permanently. Transfer or withdraw its balance first.</Text>
                    ) : null}

                    {(financeModalKind === 'deposit' || financeModalKind === 'withdraw' || financeModalKind === 'transfer') ? (
                      <>
                        <View style={s.inlineFields}>
                          <View style={[s.fieldBlock, { flex: 1 }]}>
                            <Text style={s.fieldLabel}>Amount</Text>
                            <TextInput
                              testID="finance-money-amount-input"
                              accessibilityLabel="Finance action amount"
                              value={moneyAmountInput}
                              onChangeText={setMoneyAmountInput}
                              editable={!financeModalSubmitting}
                              placeholder="10"
                              placeholderTextColor={E.inkMuted}
                              style={s.textInput}
                              keyboardType="decimal-pad"
                              onFocus={recordParentActivity}
                            />
                          </View>
                          <View style={[s.fieldBlock, { flex: 1 }]}>
                            <Text style={s.fieldLabel}>Currency</Text>
                            <TextInput
                              testID="finance-money-currency-input"
                              accessibilityLabel="Finance action currency"
                              value={moneyCurrencyInput}
                              onChangeText={(v) => setMoneyCurrencyInput(upperCurrency(v))}
                              editable={!financeModalSubmitting}
                              placeholder="USD"
                              placeholderTextColor={E.inkMuted}
                              style={s.textInput}
                              autoCapitalize="characters"
                              autoCorrect={false}
                              onFocus={recordParentActivity}
                            />
                          </View>
                        </View>

                        <View style={s.fieldBlock}>
                          <Text style={s.fieldLabel}>Description (optional)</Text>
                          <TextInput
                            testID="finance-money-description-input"
                            accessibilityLabel="Finance action description"
                            value={moneyDescriptionInput}
                            onChangeText={setMoneyDescriptionInput}
                            editable={!financeModalSubmitting}
                            placeholder={
                              financeModalKind === 'deposit' ? 'Birthday money'
                              : financeModalKind === 'withdraw' ? 'Cash out'
                              : 'Move to spending envelope'
                            }
                            placeholderTextColor={E.inkMuted}
                            style={[s.textInput, s.textArea]}
                            multiline
                            textAlignVertical="top"
                            onFocus={recordParentActivity}
                          />
                        </View>
                      </>
                    ) : null}
                  </>
                ) : null}

                <View style={s.modalActions}>
                  <Pressable
                    testID="finance-cancel-action"
                    accessibilityRole="button"
                    accessibilityLabel="Cancel finance action"
                    onPress={closeFinanceModal}
                    style={s.cancelBtn}
                  >
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    testID="finance-submit-action"
                    accessibilityRole="button"
                    accessibilityLabel="Submit finance action"
                    disabled={financeModalSubmitting}
                    onPress={() => { void submitFinanceAction(); }}
                    style={[s.submitBtn, financeModalSubmitting && s.submitBtnDisabled]}
                  >
                    <Text style={[s.submitBtnText, financeModalSubmitting && s.submitBtnTextDisabled]}>
                      {financeModalSubmitLabel}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: E.bg },
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: SP.md, paddingTop: SP.md, paddingBottom: 80, gap: SP.md },

  // Hero
  heroCard:      { backgroundColor: E.bgDeep, borderRadius: R.lg, borderWidth: 1, borderColor: E.border, padding: SP.lg, gap: SP.sm },
  heroEyebrow:   { fontSize: 10, fontWeight: '600', color: E.inkMuted, textTransform: 'uppercase', letterSpacing: 1 },
  heroTitle:     { fontFamily: 'serif', fontSize: 26, fontWeight: '700', color: E.ink, marginTop: 2 },
  heroSub:       { fontSize: 12, color: E.inkMuted, fontWeight: '300', lineHeight: 18, marginTop: 3 },
  heroBalances:  { fontFamily: 'serif', fontSize: 16, fontWeight: '700', color: E.ink, marginTop: SP.sm },
  heroBadge:     { alignSelf: 'flex-start', borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, paddingHorizontal: 10, paddingVertical: 5 },
  heroBadgeText: { fontSize: 11, fontWeight: '500', color: E.inkSub, letterSpacing: 0.3 },

  // Panel
  panel:    { backgroundColor: E.surface, borderRadius: R.lg, borderWidth: 1, borderColor: E.border, padding: SP.md, gap: SP.md },
  panelHead:{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SP.sm },
  panelTitle:{ fontFamily: 'serif', fontSize: 17, fontWeight: '700', color: E.ink },
  metaText: { fontSize: 11, color: E.inkMuted, fontWeight: '300', textAlign: 'right' },

  // Member chips
  chipRow:          { flexDirection: 'row', gap: SP.sm, paddingRight: SP.md },
  chip:             { borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, borderRadius: R.pill, paddingHorizontal: SP.sm, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipSelected:     { borderColor: E.ink, backgroundColor: E.ink },
  chipText:         { fontSize: 13, fontWeight: '500', color: E.inkSub },
  chipTextSelected: { color: E.white },
  chipMeta:         { fontSize: 10, color: E.inkMuted, fontWeight: '400' },
  chipMetaSelected: { color: E.white },

  // Action scope
  scopeCard:  { borderWidth: 1, borderColor: E.borderLight, borderRadius: R.md, backgroundColor: E.bg, padding: SP.sm, gap: 3 },
  scopeTitle: { fontFamily: 'serif', fontSize: 15, fontWeight: '700', color: E.ink },
  scopeMeta:  { fontSize: 12, color: E.inkMuted, fontWeight: '300' },

  // Action grid
  actionGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },
  actionBtn:           { borderWidth: 1, borderColor: E.border, borderRadius: R.md, backgroundColor: E.bg, paddingHorizontal: SP.sm, paddingVertical: 11, minWidth: 130, alignItems: 'center', justifyContent: 'center' },
  actionBtnPrimary:    { borderColor: E.accentDeep, backgroundColor: E.bgDeep },
  actionBtnLocked:     { opacity: 0.45 },
  actionBtnText:       { fontSize: 13, fontWeight: '500', color: E.inkSub },
  actionBtnTextLocked: { color: E.inkMuted },

  helperText: { fontSize: 12, color: E.inkMuted, fontWeight: '300', lineHeight: 18 },
  emptyText:  { fontSize: 13, color: E.inkMuted, fontWeight: '300', lineHeight: 20 },
  errorText:  { fontSize: 13, color: E.danger, fontWeight: '500', lineHeight: 20 },

  // Member cards (allowance)
  memberCards:     { gap: SP.sm },
  memberCard:      { borderWidth: 1, borderColor: E.borderLight, borderRadius: R.md, backgroundColor: E.bg, padding: SP.md, gap: 5 },
  memberCardHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP.sm },
  memberCardName:  { fontFamily: 'serif', fontSize: 15, fontWeight: '700', color: E.ink },
  roleTag:         { fontSize: 10, fontWeight: '600', color: E.inkMuted, borderWidth: 1, borderColor: E.border, borderRadius: R.pill, paddingHorizontal: 7, paddingVertical: 3, textTransform: 'capitalize' },
  roleTagParent:   { color: E.accentDeep, borderColor: E.accentDeep },
  roleTagKid:      { color: E.inkSub, borderColor: E.border },
  allowanceAmount: { fontFamily: 'serif', fontSize: 15, fontWeight: '700', color: E.ink },
  allowanceMeta:   { fontSize: 12, color: E.inkMuted, fontWeight: '300', lineHeight: 17 },
  allowanceTotal:  { fontSize: 12, color: E.accentDeep, fontWeight: '500' },

  // Envelopes
  envelopeSections:   { gap: SP.md },
  envelopeSection:    { gap: SP.sm },
  envelopeSectionHead:{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SP.sm },
  envelopeSectionTitle: { fontFamily: 'serif', fontSize: 14, fontWeight: '700', color: E.ink },
  envelopeSectionMeta:  { fontSize: 11, color: E.inkMuted, fontWeight: '400' },
  emptyInline:        { fontSize: 12, color: E.inkMuted, fontStyle: 'italic' },
  envelopeCard:       { borderWidth: 1, borderColor: E.borderLight, borderRadius: R.md, backgroundColor: E.bg, padding: SP.md, gap: 5 },
  envelopeHead:       { flexDirection: 'row', alignItems: 'flex-start', gap: SP.sm },
  envelopeName:       { fontFamily: 'serif', fontSize: 14, fontWeight: '700', color: E.ink },
  envelopeDesc:       { fontSize: 12, color: E.inkMuted, fontWeight: '300', marginTop: 2 },
  defaultTag:         { fontSize: 10, fontWeight: '600', color: E.ok, borderWidth: 1, borderColor: E.okBorder, borderRadius: R.pill, paddingHorizontal: 7, paddingVertical: 3 },
  envelopeBalances:   { fontFamily: 'serif', fontSize: 14, fontWeight: '700', color: E.ink },
  envelopeGoal:       { fontSize: 11, color: E.inkMuted, fontWeight: '400' },

  // Transactions
  txList:      { gap: SP.sm },
  txCard:      { borderWidth: 1, borderColor: E.borderLight, borderRadius: R.md, backgroundColor: E.bg, padding: SP.md, gap: 3 },
  txTopRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: SP.sm },
  txType:      { fontFamily: 'serif', fontSize: 14, fontWeight: '700', color: E.ink },
  txMeta:      { fontSize: 11, color: E.inkMuted, fontWeight: '300', lineHeight: 16, marginTop: 2 },
  txAmount:    { fontFamily: 'serif', fontSize: 14, fontWeight: '700', color: E.ink },
  txAmountPos: { color: E.ok },
  txAmountNeg: { color: E.danger },
  txDesc:      { fontSize: 12, color: E.inkMuted, fontWeight: '300', lineHeight: 17 },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(17,17,17,0.3)' },
  modalKeyboard: { flex: 1, justifyContent: 'flex-end' },
  modalScrim:    { flex: 1 },
  modalSheet:    { backgroundColor: E.bg, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, borderTopWidth: 1, borderColor: E.border, paddingHorizontal: SP.lg, paddingTop: SP.sm, paddingBottom: SP.lg, maxHeight: '84%', gap: SP.sm },
  modalHandle:   { alignSelf: 'center', width: 48, height: 4, borderRadius: R.pill, backgroundColor: E.border, marginBottom: 4 },
  modalHeader:   { flexDirection: 'row', alignItems: 'flex-start', gap: SP.sm },
  modalTitle:    { fontFamily: 'serif', fontSize: 22, fontWeight: '700', color: E.ink },
  modalSub:      { fontSize: 12, color: E.inkMuted, fontWeight: '300', marginTop: 3, lineHeight: 17 },
  modalCloseBtn: { borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, borderRadius: R.pill, paddingHorizontal: SP.sm, paddingVertical: 7 },
  modalCloseBtnText: { fontSize: 12, color: E.inkSub, fontWeight: '500' },
  modalForm:     { gap: SP.md, paddingBottom: SP.sm },
  modalError:    { fontSize: 13, color: E.danger, fontWeight: '500', lineHeight: 18 },
  modalActions:  { flexDirection: 'row', justifyContent: 'flex-end', gap: SP.sm, marginTop: 4 },

  // Fields
  fieldBlock:  { gap: 6 },
  fieldLabel:  { fontSize: 10, color: E.inkMuted, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  textInput:   { borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, borderRadius: R.md, paddingHorizontal: SP.sm, paddingVertical: 11, color: E.ink, fontSize: 15, minHeight: 46 },
  textArea:    { minHeight: 88, paddingTop: 10 },
  inlineFields:{ flexDirection: 'row', gap: SP.sm },
  warnText:    { fontSize: 12, color: E.warn, fontWeight: '500', lineHeight: 18 },

  switchRow:   { borderWidth: 1, borderColor: E.border, borderRadius: R.md, backgroundColor: E.bgDeep, padding: SP.md, flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  switchTitle: { fontFamily: 'serif', fontSize: 14, fontWeight: '700', color: E.ink },
  switchMeta:  { fontSize: 12, color: E.inkMuted, fontWeight: '300', marginTop: 2 },

  selectorWrap:          { gap: SP.sm },
  selectorChip:          { borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, borderRadius: R.md, paddingHorizontal: SP.sm, paddingVertical: SP.sm, gap: 2 },
  selectorChipSelected:  { borderColor: E.ink, backgroundColor: E.bg },
  selectorChipName:      { fontFamily: 'serif', fontSize: 14, fontWeight: '700', color: E.ink },
  selectorChipNameSelected: { color: E.ink },
  selectorChipMeta:      { fontSize: 12, color: E.inkMuted, fontWeight: '300' },
  selectorChipMetaSelected: { color: E.inkSub },

  cancelBtn:          { minWidth: 100, borderWidth: 1, borderColor: E.border, borderRadius: R.md, backgroundColor: E.bgDeep, paddingHorizontal: SP.md, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText:      { fontSize: 14, color: E.inkSub, fontWeight: '500' },
  submitBtn:          { minWidth: 120, borderWidth: 1, borderColor: E.ink, borderRadius: R.md, backgroundColor: E.ink, paddingHorizontal: SP.md, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled:  { opacity: 0.4 },
  submitBtnText:      { fontSize: 14, color: E.white, fontWeight: '600' },
  submitBtnTextDisabled: { color: E.white },
});
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroEyebrow}>Allowance Overview</Text>
            <Text style={styles.heroTitle}>{selectedMember ? selectedMember.name : 'Family totals'}</Text>
            <Text style={styles.heroSub}>
              {selectedMember
                ? `${selectedMember.envelopes.length} envelope${selectedMember.envelopes.length === 1 ? '' : 's'}`
                : `${membersWithFinance.length} members • ${membersWithFinance.reduce((sum, m) => sum + m.envelopes.length, 0)} envelopes`}
              {currentUser?.name ? ` • viewing as ${currentUser.name}` : ''}
            </Text>
            <Text style={styles.heroBalances}>{formatBalancesInline(familyCombinedBalances, unitMap)}</Text>
          </View>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeLabel}>
              {isParentPrincipal ? 'Parent Actions Ready' : isKidSelfServeUser ? 'Kid Self-Serve Mode' : 'Read-only Mode'}
            </Text>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeaderRow}>
            <Text style={styles.panelTitle}>Members</Text>
            <Text style={styles.metaText}>Tap to filter balances and transactions</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberChipRow}>
            <Pressable
              testID="finance-member-filter-all"
              accessibilityRole="button"
              accessibilityLabel="Show family finance for all members"
              onPress={() => {
                recordParentActivity();
                setSelectedMemberId('all');
              }}
              style={[styles.memberChip, selectedMemberId === 'all' && styles.memberChipSelected]}
            >
              <Text style={[styles.memberChipText, selectedMemberId === 'all' && styles.memberChipTextSelected]}>All</Text>
            </Pressable>
            {membersWithFinance.map((member) => {
              const selected = selectedMemberId === member.id;
              return (
                <Pressable
                  key={`finance-member-${member.id}`}
                  testID={`finance-member-filter-${member.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Show finance for ${member.name}`}
                  onPress={() => {
                    recordParentActivity();
                    setSelectedMemberId(member.id);
                  }}
                  style={[styles.memberChip, selected && styles.memberChipSelected]}
                >
                  <Text style={[styles.memberChipText, selected && styles.memberChipTextSelected]}>{member.name}</Text>
                  <Text style={[styles.memberChipMeta, selected && styles.memberChipMetaSelected]}>
                    {member.allowanceEnvelopes?.length || 0} env
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeaderRow}>
            <Text style={styles.panelTitle}>Actions</Text>
            <Text style={styles.metaText}>
              {isParentPrincipal ? 'All actions available' : 'Deposit/withdraw need parent login'}
            </Text>
          </View>

          {!selectedMember ? (
            <Text style={styles.emptyText}>Select a family member above to create envelopes and move funds.</Text>
          ) : (
            <View style={styles.actionScopeCard}>
              <Text style={styles.actionScopeTitle}>{selectedMember.name}</Text>
              <Text style={styles.actionScopeMeta}>
                {selectedMember.envelopes.length} envelope{selectedMember.envelopes.length === 1 ? '' : 's'} •
                {' '}
                {formatBalancesInline(selectedMember.totalBalances, unitMap)}
              </Text>
            </View>
          )}

          <View style={styles.actionGrid}>
            <Pressable
              testID="finance-open-add-envelope"
              accessibilityRole="button"
              accessibilityLabel="Open add envelope action"
              onPress={() => {
                void openFinanceAction('add-envelope');
              }}
              style={[
                styles.actionButton,
                styles.actionButtonPrimary,
                isActionVisuallyLocked('add-envelope') && styles.actionButtonLocked,
              ]}
            >
              <Text style={[styles.actionButtonTextPrimary, isActionVisuallyLocked('add-envelope') && styles.actionButtonTextDisabled]}>
                Add Envelope
              </Text>
            </Pressable>

            <Pressable
              testID="finance-open-delete-envelope"
              accessibilityRole="button"
              accessibilityLabel="Open delete envelope action"
              onPress={() => {
                void openFinanceAction('delete-envelope');
              }}
              style={[
                styles.actionButton,
                isActionVisuallyLocked('delete-envelope') && styles.actionButtonLocked,
              ]}
            >
              <Text style={[styles.actionButtonText, isActionVisuallyLocked('delete-envelope') && styles.actionButtonTextDisabled]}>
                Delete Envelope
              </Text>
            </Pressable>

            <Pressable
              testID="finance-open-deposit"
              accessibilityRole="button"
              accessibilityLabel="Open deposit action"
              onPress={() => {
                void openFinanceAction('deposit');
              }}
              style={[
                styles.actionButton,
                isActionVisuallyLocked('deposit') && styles.actionButtonLocked,
              ]}
            >
              <Text style={[styles.actionButtonText, isActionVisuallyLocked('deposit') && styles.actionButtonTextDisabled]}>
                Deposit
              </Text>
            </Pressable>

            <Pressable
              testID="finance-open-withdraw"
              accessibilityRole="button"
              accessibilityLabel="Open withdraw action"
              onPress={() => {
                void openFinanceAction('withdraw');
              }}
              style={[
                styles.actionButton,
                isActionVisuallyLocked('withdraw') && styles.actionButtonLocked,
              ]}
            >
              <Text style={[styles.actionButtonText, isActionVisuallyLocked('withdraw') && styles.actionButtonTextDisabled]}>
                Withdraw
              </Text>
            </Pressable>

            <Pressable
              testID="finance-open-transfer"
              accessibilityRole="button"
              accessibilityLabel="Open transfer action"
              onPress={() => {
                void openFinanceAction('transfer');
              }}
              style={[
                styles.actionButton,
                isActionVisuallyLocked('transfer') && styles.actionButtonLocked,
              ]}
            >
              <Text style={[styles.actionButtonText, isActionVisuallyLocked('transfer') && styles.actionButtonTextDisabled]}>
                Transfer
              </Text>
            </Pressable>
          </View>

          {selectedMember && selectedMember.envelopes.length === 0 ? (
            <Text style={styles.helperText}>
              Create an initial envelope first (usually “Savings”), then use transfer and other finance actions.
            </Text>
          ) : null}
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeaderRow}>
            <Text style={styles.panelTitle}>Allowance Settings</Text>
            <Text style={styles.metaText}>{selectedMember ? selectedMember.name : 'Visible members'}</Text>
          </View>
          <View style={styles.memberFinanceCards}>
            {visibleMembers.length === 0 ? (
              <Text style={styles.emptyText}>No family members available.</Text>
            ) : (
              visibleMembers.map((member) => {
                const summary = summarizeAllowance(member, unitMap);
                return (
                  <View key={`allowance-summary-${member.id}`} style={styles.memberFinanceCard}>
                    <View style={styles.memberFinanceHeader}>
                      <Text style={styles.memberFinanceName}>{member.name}</Text>
                      <View style={[styles.rolePill, member.role === 'parent' ? styles.rolePillParent : styles.rolePillChild]}>
                        <Text style={[styles.rolePillText, member.role === 'parent' ? styles.rolePillTextParent : styles.rolePillTextChild]}>
                          {member.role || 'member'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.allowanceAmountLabel}>{summary.amountLabel || 'No allowance amount set'}</Text>
                    <Text style={styles.allowanceMeta}>
                      {summary.cadence}
                      {summary.startDateLabel ? ` • starts ${summary.startDateLabel}` : ''}
                      {summary.payoutDelayDays ? ` • payout delay ${summary.payoutDelayDays}d` : ''}
                    </Text>
                    <Text style={styles.allowanceTotalLabel}>Envelope total: {formatBalancesInline(member.totalBalances, unitMap)}</Text>
                  </View>
                );
              })
            )}
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeaderRow}>
            <Text style={styles.panelTitle}>Envelopes</Text>
            <Text style={styles.metaText}>
              {visibleMembers.reduce((sum, member) => sum + member.envelopes.length, 0)} total
            </Text>
          </View>
          {visibleMembers.length === 0 ? (
            <Text style={styles.emptyText}>No members selected.</Text>
          ) : visibleMembers.every((member) => member.envelopes.length === 0) ? (
            <Text style={styles.emptyText}>
              No envelopes yet for the selected member(s). Phase 3 add/edit envelope flows will populate this list.
            </Text>
          ) : (
            <View style={styles.envelopeSections}>
              {visibleMembers.map((member) => (
                <View key={`member-envelopes-${member.id}`} style={styles.envelopeSection}>
                  <View style={styles.envelopeSectionHeader}>
                    <Text style={styles.envelopeSectionTitle}>{member.name}</Text>
                    <Text style={styles.envelopeSectionMeta}>
                      {member.envelopes.length} envelope{member.envelopes.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                  {member.envelopes.length === 0 ? (
                    <Text style={styles.emptyInline}>No envelopes</Text>
                  ) : (
                    member.envelopes.map((envelope) => {
                      const balancesLabel = formatBalancesInline(envelope.balancesNormalized, unitMap);
                      const goalLabel =
                        envelope.goalAmount != null && envelope.goalCurrency
                          ? formatAmount(envelope.goalCurrency, coerceNumber(envelope.goalAmount), unitMap)
                          : null;
                      return (
                        <View key={`envelope-${envelope.id}`} style={styles.envelopeCard}>
                          <View style={styles.envelopeHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.envelopeName}>{envelope.name || 'Untitled envelope'}</Text>
                              {!!envelope.description ? <Text style={styles.envelopeDescription}>{envelope.description}</Text> : null}
                            </View>
                            {envelope.isDefault ? (
                              <View style={styles.defaultPill}>
                                <Text style={styles.defaultPillText}>Default</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.envelopeBalances}>{balancesLabel}</Text>
                          {goalLabel ? <Text style={styles.envelopeGoal}>Goal: {goalLabel}</Text> : null}
                        </View>
                      );
                    })
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeaderRow}>
            <Text style={styles.panelTitle}>Recent Transactions</Text>
            <Text style={styles.metaText}>
              {selectedMember ? selectedMember.name : 'Family'} • latest {Math.min(20, transactionRows.length)}
            </Text>
          </View>

          {financeError ? (
            <Text style={styles.errorText}>{financeError.message || 'Failed to load finance data'}</Text>
          ) : financeLoading ? (
            <Text style={styles.emptyText}>Loading balances and transactions...</Text>
          ) : transactionRows.length === 0 ? (
            <Text style={styles.emptyText}>No transactions found for the selected scope.</Text>
          ) : (
            <View style={styles.transactionList}>
              {transactionRows.map((tx) => (
                <View key={`tx-${tx.id}`} style={styles.transactionCard}>
                  <View style={styles.transactionTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.transactionTitle}>{tx.typeLabel}</Text>
                      <Text style={styles.transactionMetaLine}>
                        {tx.dateLabel}
                        {tx.counterparty ? ` • ${tx.counterparty}` : ''}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.transactionAmount,
                        tx.tone === 'positive' && styles.transactionAmountPositive,
                        tx.tone === 'negative' && styles.transactionAmountNegative,
                      ]}
                    >
                      {tx.signedAmountLabel}
                    </Text>
                  </View>
                  {!!tx.description ? <Text style={styles.transactionDescription}>{tx.description}</Text> : null}
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.phaseNextCard}>
          <Text style={styles.phaseNextTitle}>Next in Finance Phase 3</Text>
          <Text style={styles.phaseNextBody}>
            Next priorities are transaction filters, combined converted balance display, and parent allowance distribution execution.
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={!!financeModalKind}
        transparent
        animationType="slide"
        onRequestClose={closeFinanceModal}
        presentationStyle="overFullScreen"
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardLayer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
          >
            <Pressable style={styles.modalScrim} onPress={closeFinanceModal} />
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>{financeModalTitle}</Text>
                  <Text style={styles.modalSubtitle}>
                    {selectedMember
                      ? `${selectedMember.name} • ${selectedMember.envelopes.length} envelope${selectedMember.envelopes.length === 1 ? '' : 's'}`
                      : 'Choose a member first to run finance actions.'}
                  </Text>
                </View>
                <Pressable
                  testID="finance-close-modal"
                  accessibilityRole="button"
                  accessibilityLabel="Close finance action modal"
                  onPress={closeFinanceModal}
                  style={styles.modalCloseButton}
                >
                  <Text style={styles.modalCloseText}>Close</Text>
                </Pressable>
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalForm}>
                {financeModalError ? <Text style={styles.modalErrorText}>{financeModalError}</Text> : null}

                {financeModalKind === 'add-envelope' ? (
                  <>
                    <View style={styles.fieldBlock}>
                      <Text style={styles.fieldLabel}>Envelope Name</Text>
                      <TextInput
                        testID="finance-envelope-name-input"
                        accessibilityLabel="Envelope name"
                        value={envelopeNameInput}
                        onChangeText={setEnvelopeNameInput}
                        editable={!financeModalSubmitting}
                        placeholder="Savings"
                        placeholderTextColor={E.inkMuted}
                        style={styles.textInput}
                        onFocus={recordParentActivity}
                      />
                    </View>

                    <View style={styles.fieldBlock}>
                      <Text style={styles.fieldLabel}>Description (optional)</Text>
                      <TextInput
                        testID="finance-envelope-description-input"
                        accessibilityLabel="Envelope description"
                        value={envelopeDescriptionInput}
                        onChangeText={setEnvelopeDescriptionInput}
                        editable={!financeModalSubmitting}
                        placeholder="School spending"
                        placeholderTextColor={E.inkMuted}
                        style={[styles.textInput, styles.textArea]}
                        multiline
                        textAlignVertical="top"
                        onFocus={recordParentActivity}
                      />
                    </View>

                    <View style={styles.switchRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.switchTitle}>Set as default envelope</Text>
                        <Text style={styles.switchMeta}>New deposits can default here. First envelope is always default.</Text>
                      </View>
                      <Switch
                        value={selectedMember && selectedMember.envelopes.length === 0 ? true : envelopeIsDefaultInput}
                        onValueChange={setEnvelopeIsDefaultInput}
                        disabled={financeModalSubmitting || (selectedMember && selectedMember.envelopes.length === 0)}
                        trackColor={{ false: E.border, true: E.ok }}
                        thumbColor={E.white}
                      />
                    </View>
                  </>
                ) : null}

                {financeModalKind && financeModalKind !== 'add-envelope' ? (
                  <>
                    <View style={styles.fieldBlock}>
                      <Text style={styles.fieldLabel}>Source Envelope</Text>
                      <View style={styles.selectorWrap}>
                        {selectedMemberEnvelopes.map((envelope) => {
                          const selected = moneyEnvelopeIdInput === envelope.id;
                          return (
                            <Pressable
                              key={`modal-source-${envelope.id}`}
                              testID={`finance-source-envelope-${envelope.id}`}
                              accessibilityRole="button"
                              accessibilityLabel={`Select source envelope ${envelope.name}`}
                              onPress={() => {
                                recordParentActivity();
                                setMoneyEnvelopeIdInput(envelope.id);
                                if (financeModalKind === 'transfer' && moneyDestinationEnvelopeIdInput === envelope.id) {
                                  const fallback = transferDestinationOptions.find((env) => env.id !== envelope.id);
                                  setMoneyDestinationEnvelopeIdInput(fallback?.id || '');
                                }
                                setMoneyCurrencyInput(getPreferredCurrency(selectedMember, envelope));
                              }}
                              style={[styles.selectorChip, selected && styles.selectorChipSelected]}
                            >
                              <Text style={[styles.selectorChipText, selected && styles.selectorChipTextSelected]}>
                                {envelope.name}
                              </Text>
                              <Text style={[styles.selectorChipMeta, selected && styles.selectorChipMetaSelected]}>
                                {formatBalancesInline(envelope.balancesNormalized, unitMap)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    {financeModalKind === 'transfer' ? (
                      <View style={styles.fieldBlock}>
                        <Text style={styles.fieldLabel}>Destination Envelope</Text>
                        <View style={styles.selectorWrap}>
                          {transferDestinationOptions.map((envelope) => {
                            const selected = moneyDestinationEnvelopeIdInput === envelope.id;
                            return (
                              <Pressable
                                key={`modal-dest-${envelope.id}`}
                                testID={`finance-destination-envelope-${envelope.id}`}
                                accessibilityRole="button"
                                accessibilityLabel={`Select destination envelope ${envelope.name}`}
                                onPress={() => {
                                  recordParentActivity();
                                  setMoneyDestinationEnvelopeIdInput(envelope.id);
                                }}
                                style={[styles.selectorChip, selected && styles.selectorChipSelected]}
                              >
                                <Text style={[styles.selectorChipText, selected && styles.selectorChipTextSelected]}>
                                  {envelope.name}
                                </Text>
                                <Text style={[styles.selectorChipMeta, selected && styles.selectorChipMetaSelected]}>
                                  {envelope.ownerMember?.name ? `${envelope.ownerMember.name} • ` : ''}
                                  {formatBalancesInline(envelope.balancesNormalized, unitMap)}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    ) : null}

                    {financeModalKind === 'delete-envelope' ? (
                      <Text style={styles.deleteWarningText}>
                        Deleting removes this envelope permanently. Transfer or withdraw its balance first if funds remain.
                      </Text>
                    ) : null}

                    {financeModalKind === 'deposit' || financeModalKind === 'withdraw' || financeModalKind === 'transfer' ? (
                      <>
                        <View style={styles.inlineFields}>
                          <View style={[styles.fieldBlock, styles.inlineField]}>
                            <Text style={styles.fieldLabel}>Amount</Text>
                            <TextInput
                              testID="finance-money-amount-input"
                              accessibilityLabel="Finance action amount"
                              value={moneyAmountInput}
                              onChangeText={setMoneyAmountInput}
                              editable={!financeModalSubmitting}
                              placeholder="10"
                              placeholderTextColor={E.inkMuted}
                              style={styles.textInput}
                              keyboardType="decimal-pad"
                              onFocus={recordParentActivity}
                            />
                          </View>
                          <View style={[styles.fieldBlock, styles.inlineField]}>
                            <Text style={styles.fieldLabel}>Currency</Text>
                            <TextInput
                              testID="finance-money-currency-input"
                              accessibilityLabel="Finance action currency"
                              value={moneyCurrencyInput}
                              onChangeText={(value) => setMoneyCurrencyInput(upperCurrency(value))}
                              editable={!financeModalSubmitting}
                              placeholder="USD"
                              placeholderTextColor={E.inkMuted}
                              style={styles.textInput}
                              autoCapitalize="characters"
                              autoCorrect={false}
                              onFocus={recordParentActivity}
                            />
                          </View>
                        </View>

                        <View style={styles.fieldBlock}>
                          <Text style={styles.fieldLabel}>Description (optional)</Text>
                          <TextInput
                            testID="finance-money-description-input"
                            accessibilityLabel="Finance action description"
                            value={moneyDescriptionInput}
                            onChangeText={setMoneyDescriptionInput}
                            editable={!financeModalSubmitting}
                            placeholder={
                              financeModalKind === 'deposit'
                                ? 'Birthday money'
                                : financeModalKind === 'withdraw'
                                ? 'Cash out'
                                : 'Move to spending envelope'
                            }
                            placeholderTextColor={E.inkMuted}
                            style={[styles.textInput, styles.textArea]}
                            multiline
                            textAlignVertical="top"
                            onFocus={recordParentActivity}
                          />
                        </View>
                      </>
                    ) : null}
                  </>
                ) : null}

                <View style={styles.modalActions}>
                  <Pressable
                    testID="finance-cancel-action"
                    accessibilityRole="button"
                    accessibilityLabel="Cancel finance action"
                    onPress={closeFinanceModal}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    testID="finance-submit-action"
                    accessibilityRole="button"
                    accessibilityLabel="Submit finance action"
                    disabled={financeModalSubmitting}
                    onPress={() => {
                      void submitFinanceAction();
                    }}
                    style={[styles.primaryButton, financeModalSubmitting && styles.actionButtonDisabled]}
                  >
                    <Text style={[styles.primaryButtonText, financeModalSubmitting && styles.actionButtonTextDisabled]}>
                      {financeModalSubmitLabel}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

  });
