// components/allowance/MemberAllowanceDetail.tsx
import { tx, id } from '@instantdb/react';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Check, ChevronsUpDown, MinusCircle, Users, History, Target, Settings, Save, CalendarDays, Info } from 'lucide-react'; // Added Settings, Save, CalendarDays, Info
// --- Shadcn UI Imports ---
import { cn } from '@/lib/utils';
// --- REMOVED Command Imports ---
// import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
// --- REMOVED Popover Imports ---
// import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'; // Import Select components
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'; // Import RadioGroup
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'; // Import Card components
// --- Import Components ---
import EnvelopeItem, { Envelope } from '@/components/EnvelopeItem';
import AddEditEnvelopeForm from '@/components/allowance/AddEditEnvelopeForm';
import TransferFundsForm from '@/components/allowance/TransferFundsForm'; // From envelope to envelope of the same person
import DeleteEnvelopeDialog from '@/components/allowance/DeleteEnvelopeDialog';
// --- REMOVED DefineUnitForm Import (Handled by CurrencySelector) ---
// import DefineUnitForm from '@/components/allowance/DefineUnitForm';
import WithdrawForm from '@/components/allowance/WithdrawForm';
import TransferToPersonForm from '@/components/allowance/TransferToPersonForm';
import TransactionHistoryView from '@/components/allowance/TransactionHistoryView';
import CombinedBalanceDisplay from '@/components/allowance/CombinedBalanceDisplay';
import RecurrenceRuleForm from '@/components/RecurrenceRuleForm'; // Import RecurrenceRuleForm
import CurrencySelector from '@/components/CurrencySelector'; // +++ Import CurrencySelector +++

// --- Import Utilities ---
import { RRule, Frequency } from 'rrule'; // Import RRule for parsing/generation
import {
    depositToSpecificEnvelope,
    createInitialSavingsEnvelope,
    setDefaultEnvelope, // Keep existing setDefaultEnvelope import
    transferFunds,
    deleteEnvelope,
    withdrawFromEnvelope,
    transferFundsToPerson,
    fetchExternalExchangeRates,
    cacheExchangeRates,
    getExchangeRate,
    setLastDisplayCurrencyPref,
    CachedExchangeRate,
    UnitDefinition,
    formatBalances,
    ExchangeRateResult,
    calculateEnvelopeProgress, // Ensure this is imported if used elsewhere
    GoalProgressResult, // Ensure this is imported if used elsewhere
} from '@/lib/currency-utils';

// +++ NEW IMPORTS +++
import { useAuth } from '@/components/AuthProvider';
import { useParentMode } from '@/components/auth/useParentMode';
import { validateRestriction } from '@/lib/auth-utils';
import { RestrictedButton } from '@/components/ui/RestrictedButton';

// --- Types ---
interface BasicFamilyMember {
    id: string;
    name: string;
}

// Type for the full family member data expected from the query
interface FamilyMemberData extends BasicFamilyMember {
    allowanceEnvelopes?: Envelope[];
    lastDisplayCurrency?: string | null;
    // +++ Add new allowance fields +++
    allowanceAmount?: number | null;
    allowanceCurrency?: string | null;
    allowanceRrule?: string | null;
    allowanceStartDate?: string | null; // Store as ISO string from DB
    allowanceConfig?: AllowanceConfig | null; // Store config as JSON
    // +++ Add delay field +++
    allowancePayoutDelayDays?: number | null;
}

// Interface for the allowance configuration JSON
interface AllowanceConfig {
    // *** REMOVED startOfWeek ***
    readable?: string; // Human-readable description
    // Add other UI-specific settings if needed
}

// --- Component Props ---
interface MemberAllowanceDetailProps {
    memberId: string; // Changed from string | null previously? Ensure consistency.
    allFamilyMembers: BasicFamilyMember[]; // Added prop
    allMonetaryCurrenciesInUse: string[]; // e.g., ["USD", "NPR", "EUR"] - this is passed from parent
    unitDefinitions: UnitDefinition[];
    db: any; // +++ Add db prop +++
}

// --- Constants ---
// --- REMOVED db initialization (passed as prop) ---

// Define props for the component
// interface MemberAllowanceDetailProps {
//     //
//     memberId: string; //
// }

const BASE_CURRENCY = 'USD'; // API Base

// **** Destructure new props ****
export default function MemberAllowanceDetail({
    memberId,
    allFamilyMembers,
    allMonetaryCurrenciesInUse,
    unitDefinitions,
    db, // Destructure db prop
}: MemberAllowanceDetailProps) {
    const { toast } = useToast();
    // +++ NEW: Get Auth Context +++
    const { currentUser } = useAuth();
    const { isParentMode } = useParentMode();

    const hasInitializedEnvelope = useRef(false);
    const rateCalculationController = useRef<AbortController | null>(null);
    const isFetchingApiRates = useRef(false);
    const hasSetInitialCurrency = useRef(false);

    // --- State ---
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [envelopeToEdit, setEnvelopeToEdit] = useState<Envelope | null>(null);
    const [transferSourceEnvelopeId, setTransferSourceEnvelopeId] = useState<string | null>(null);
    const [envelopeToDelete, setEnvelopeToDelete] = useState<Envelope | null>(null);
    // --- REMOVED isDefineUnitModalOpen (Handled by CurrencySelector) ---
    // const [isDefineUnitModalOpen, setIsDefineUnitModalOpen] = useState(false);
    const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
    const [isTransferToPersonModalOpen, setIsTransferToPersonModalOpen] = useState(false);
    const [selectedDisplayCurrency, setSelectedDisplayCurrency] = useState<string | null>(null);
    const [isLoadingRates, setIsLoadingRates] = useState(false);
    const [showingTransactions, setShowingTransactions] = useState(false);

    // ... (form states) ...
    const [depositAmount, setDepositAmount] = useState('');
    const [depositCurrency, setDepositCurrency] = useState('USD');
    const [depositDescription, setDepositDescription] = useState('');
    const [isDepositing, setIsDepositing] = useState(false);
    // --- REMOVED Currency Popover/Search/Ref State (Handled by CurrencySelector) ---
    // const [isCurrencyPopoverOpen, setIsCurrencyPopoverOpen] = useState(false);
    // const [currencySearchInput, setCurrencySearchInput] = useState('');
    // const itemSelectedRef = useRef(false);
    const [hasFetchedInitialPrefs, setHasFetchedInitialPrefs] = useState(false);
    const [combinedValue, setCombinedValue] = useState<number | null>(null);
    const [tooltipLines, setTooltipLines] = useState<string[]>([]);
    const [nonMonetaryBalances, setNonMonetaryBalances] = useState<{ [c: string]: number }>({});

    // +++ NEW State for Allowance Settings Form +++
    const [allowanceAmountInput, setAllowanceAmountInput] = useState<string>('');
    const [allowanceCurrencyInput, setAllowanceCurrencyInput] = useState<string>('');
    // --- REMOVED Allowance Currency Popover/Search/Ref State (Will use CurrencySelector) ---
    // const [allowanceCurrencyPopoverOpen, setAllowanceCurrencyPopoverOpen] = useState(false);
    // const [allowanceCurrencySearch, setAllowanceCurrencySearch] = useState('');
    // const allowanceItemSelectedRef = useRef(false);
    const [allowanceRecurrenceOptions, setAllowanceRecurrenceOptions] = useState<({ freq: Frequency } & Partial<Omit<RRule.Options, 'freq'>>) | null>(null);
    const [allowanceStartDateInput, setAllowanceStartDateInput] = useState<string>(''); // Store as 'yyyy-MM-dd' string
    // *** REMOVED allowanceStartOfWeekInput state ***
    // +++ NEW State for Delay +++
    const [allowanceDelayDaysInput, setAllowanceDelayDaysInput] = useState<string>('0'); // Default delay 0 days
    const [isSavingAllowance, setIsSavingAllowance] = useState(false);

    // --- Data Fetching ---
    // Query only for the specific member, their envelopes, and exchange rates
    // No need to fetch allFamilyMembers here, it's passed as a prop
    const {
        isLoading: isLoadingData,
        error: errorData,
        data,
    } = db.useQuery({
        familyMembers: {
            $: { where: { id: memberId! } },
            allowanceEnvelopes: {}, // Include envelopes for balance calculation
            // Allowance fields are implicitly included by querying the member
        },
        exchangeRates: {}, // Fetch all cached rates
    });

    // --- Derived Data ---
    const member: FamilyMemberData | undefined = data?.familyMembers?.[0];
    const envelopes: Envelope[] = useMemo(() => member?.allowanceEnvelopes || [], [member]);
    const allCachedRates: CachedExchangeRate[] = useMemo(() => {
        if (!data?.exchangeRates) return [];
        return data.exchangeRates
            .map((r: any) => ({
                ...r,
                lastFetchedTimestamp: r.lastFetchedTimestamp ? new Date(r.lastFetchedTimestamp) : new Date(0),
            }))
            .filter((r: any) => r.lastFetchedTimestamp instanceof Date && !isNaN(r.lastFetchedTimestamp.getTime()));
    }, [data?.exchangeRates]);
    const isLastEnvelope = envelopes.length === 1;

    // --- Effect to Populate Allowance Form when Member Data Loads ---
    useEffect(() => {
        if (member) {
            setAllowanceAmountInput(member.allowanceAmount ? String(member.allowanceAmount) : '');
            setAllowanceCurrencyInput(member.allowanceCurrency || ''); // Default to empty if null/undefined
            setAllowanceStartDateInput(member.allowanceStartDate ? member.allowanceStartDate.split('T')[0] : ''); // Format date string
            // +++ Populate Delay Days +++
            setAllowanceDelayDaysInput(
                member.allowancePayoutDelayDays !== null && member.allowancePayoutDelayDays !== undefined ? String(member.allowancePayoutDelayDays) : '0'
            );

            // Parse existing RRULE string to set recurrence form state
            if (member.allowanceRrule) {
                try {
                    const options = RRule.parseString(member.allowanceRrule);
                    // Add dtstart back from allowanceStartDate for RRule object if needed by RecurrenceRuleForm's internal logic
                    if (member.allowanceStartDate) {
                        options.dtstart = new Date(member.allowanceStartDate);
                    }
                    setAllowanceRecurrenceOptions(options);
                } catch (e) {
                    console.error('Error parsing member allowance RRULE:', e);
                    setAllowanceRecurrenceOptions(null); // Reset if invalid
                }
            } else {
                setAllowanceRecurrenceOptions(null); // No rule set
            }

            // *** REMOVED logic setting allowanceStartOfWeekInput ***
        } else {
            // Reset form if member data is unavailable
            setAllowanceAmountInput('');
            setAllowanceCurrencyInput('');
            setAllowanceStartDateInput('');
            setAllowanceRecurrenceOptions(null);
            // *** REMOVED reset for allowanceStartOfWeekInput ***
            setAllowanceDelayDaysInput('0'); // Reset delay in the else block too
        }
    }, [member]); // Rerun when member data changes

    // --- Generate Currency Options for Deposit & Allowance (using props) ---
    // Using a single computed list for both deposit and allowance currency dropdowns
    const depositAndAllowanceCurrencyOptions = useMemo(() => {
        const codes = new Set<string>();
        // Add codes from global definitions
        unitDefinitions.forEach((def) => codes.add(def.code.toUpperCase()));
        // Add codes currently used across *all* monetary balances (passed via prop)
        allMonetaryCurrenciesInUse.forEach((code) => codes.add(code.toUpperCase()));
        // Add codes currently used in *this member's* envelopes (in case they have unique non-monetary)
        // TODO: need to get all codes form every family member's envelopes, not just this one member's envelopes
        envelopes.forEach((env) => {
            if (env.balances) {
                Object.keys(env.balances).forEach((code) => codes.add(code.toUpperCase()));
            }
        });
        // Ensure common defaults like USD are present if defined or 3 letters
        const unitDefMap = new Map(unitDefinitions.map((def) => [def.code.toUpperCase(), def]));
        ['USD'].forEach((c) => {
            const def = unitDefMap.get(c);
            const isMonetary = def?.isMonetary ?? c.length === 3;
            if (isMonetary || codes.has(c)) {
                // Add if monetary or already used
                codes.add(c);
            }
        });

        const sortedCodes = Array.from(codes).sort();

        // Generate label including symbol/name from definitions
        const optionsWithLabels = sortedCodes.map((code) => {
            const def = unitDefMap.get(code);
            const symbol = def?.symbol;
            const name = def?.name;
            let label = code;
            if (symbol && name) label = `${code} (${symbol} - ${name})`;
            else if (symbol) label = `${code} (${symbol})`;
            else if (name) label = `${code} (${name})`;
            return { value: code, label: label };
        });

        return [
            ...optionsWithLabels,
            { value: '__DEFINE_NEW__', label: 'Define New Unit...' }, // Keep define new option
        ];
    }, [unitDefinitions, allMonetaryCurrenciesInUse, envelopes]);

    // --- Calculate Total Balances ---
    const totalBalances = useMemo(() => {
        const totals: { [currency: string]: number } = {};
        envelopes.forEach((envelope) => {
            if (envelope.balances) {
                Object.entries(envelope.balances).forEach(([currency, amount]) => {
                    totals[currency] = (totals[currency] || 0) + amount;
                });
            }
        });
        return totals;
    }, [envelopes]);

    // --- Helper to find first available monetary currency ---
    const getFirstMonetaryCurrency = useCallback(() => {
        const unitDefMap = new Map(unitDefinitions.map((def) => [def.code.toUpperCase(), def]));
        for (const code in totalBalances) {
            if (totalBalances[code] > 0) {
                const definition = unitDefMap.get(code.toUpperCase());
                const isMonetary = definition?.isMonetary ?? code.length === 3;
                if (isMonetary) {
                    return code;
                }
            }
        }
        // Fallback if no monetary currency found with balance
        const firstMonetaryDef = unitDefinitions.find((def) => def.isMonetary);
        return firstMonetaryDef?.code || 'USD'; // Absolute fallback
    }, [totalBalances, unitDefinitions]);

    // --- Effect for Initial Setup (Envelope & Currency Pref) ---
    useEffect(() => {
        if (isLoadingData || !member || hasFetchedInitialPrefs) return;
        // ... (logic to set initial selectedDisplayCurrency based on pref or default) ...
        console.log('Initial Pref/Default currency:', member.lastDisplayCurrency);
        let initialCurrency = member.lastDisplayCurrency;

        if (!initialCurrency || !allMonetaryCurrenciesInUse.includes(initialCurrency)) {
            initialCurrency = getFirstMonetaryCurrency();
            console.log('Pref missing or invalid, using default:', initialCurrency);
        }
        setSelectedDisplayCurrency(initialCurrency);
        setHasFetchedInitialPrefs(true); // Mark pref as fetched/set

        // --- Initialize Default Envelope (Keep existing logic) ---
        if (!hasInitializedEnvelope.current) {
            if (envelopes.length === 0) {
                console.log(`Member ${memberId} has no envelopes. Calling createInitialSavingsEnvelope.`);
                hasInitializedEnvelope.current = true; // prevent loop
                createInitialSavingsEnvelope(db, memberId)
                    .then((newId) => {
                        if (newId) toast({ title: "Created 'Savings' envelope." });
                    })
                    .catch((err) => {
                        console.error('Failed to create initial Savings envelope:', err);
                        toast({
                            title: 'Error',
                            description: err.message || 'Could not create envelope.',
                            variant: 'destructive',
                        });
                        hasInitializedEnvelope.current = false; // Allow retry if failed
                    });
            } else {
                const hasDefault = envelopes.some((env: Envelope) => env.isDefault);
                if (!hasDefault) {
                    console.warn(`Member ${memberId} has envelopes but no default. Setting first one '${envelopes[0].name}' as default.`);
                    hasInitializedEnvelope.current = true;
                    setDefaultEnvelope(db, envelopes, envelopes[0].id)
                        .then(() => toast({ title: 'Default Set', description: `Set '${envelopes[0].name}' as default.` }))
                        .catch((err) => {
                            console.error('Failed to set default envelope automatically:', err);
                            toast({ title: 'Error', description: err.message || 'Could not set default envelope.', variant: 'destructive' });
                            hasInitializedEnvelope.current = false;
                        });
                } else {
                    hasInitializedEnvelope.current = true; // envelopes exist and have a default
                }
            }
        }
    }, [isLoadingData, member, envelopes, hasFetchedInitialPrefs, allMonetaryCurrenciesInUse, getFirstMonetaryCurrency, unitDefinitions, db, memberId, toast]);

    // --- Effect to Calculate Combined Balance and Fetch Rates ---
    useEffect(() => {
        // Abort previous calculation if running
        rateCalculationController.current?.abort();
        const controller = new AbortController();
        rateCalculationController.current = controller;
        const signal = controller.signal;

        // Don't run calculation if currency/data isn't ready
        if (!selectedDisplayCurrency || isLoadingData || !hasFetchedInitialPrefs) {
            setCombinedValue(null);
            setTooltipLines([]);
            setNonMonetaryBalances({});
            setIsLoadingRates(false); // Not loading if we don't have the currency yet
            return;
        }

        console.log(`Calculating combined balance for: ${selectedDisplayCurrency}`);
        setIsLoadingRates(true);
        setCombinedValue(null); // Reset while calculating
        setTooltipLines([]);
        setNonMonetaryBalances({});

        const calculate = async () => {
            let combinedTotal = 0;
            const lines: string[] = [];
            const nonMonetary: { [c: string]: number } = {};
            let needsApiFetch = false;
            const unitDefMap = new Map(unitDefinitions.map((def) => [def.code.toUpperCase(), def]));

            for (const code in totalBalances) {
                if (signal.aborted) return; // Check for abort
                const amount = totalBalances[code];
                if (amount === 0) continue;

                const definition = unitDefMap.get(code.toUpperCase());
                // Determine if monetary (definition first, then fallback)
                const isMonetary = definition?.isMonetary ?? code.length === 3;

                if (isMonetary) {
                    const rateResult = await getExchangeRate(db, code, selectedDisplayCurrency, allCachedRates);
                    if (signal.aborted) return; // Check for abort

                    if (rateResult.rate !== null) {
                        const convertedAmount = amount * rateResult.rate;
                        combinedTotal += convertedAmount;

                        // Add tooltip line based on how the rate was obtained
                        const formattedOriginal = formatBalances({ [code]: amount }, unitDefinitions);
                        const formattedConverted = formatBalances({ [selectedDisplayCurrency]: convertedAmount }, unitDefinitions);
                        let sourceText = '';
                        if (rateResult.source === 'identity') sourceText = `already in ${selectedDisplayCurrency}`;
                        else if (rateResult.source === 'cache') sourceText = `from ${formattedOriginal}`; // removed " (cached rate)" from the end of the string
                        else if (rateResult.source === 'calculated')
                            sourceText = `from ${formattedOriginal}`; // removed " (calculated rate)" from the edn of the string
                        else sourceText = `from ${formattedOriginal}`; // Default if source unclear

                        lines.push(`${formattedConverted} ${sourceText}`);
                    } else {
                        // Rate unavailable, add note to tooltip
                        lines.push(`${formatBalances({ [code]: amount }, unitDefinitions)} (rate to ${selectedDisplayCurrency} unavailable)`);
                    }
                    if (rateResult.needsApiFetch) {
                        needsApiFetch = true;
                    }
                } else {
                    nonMonetary[code] = amount;
                }
            }

            if (signal.aborted) return; // Check for abort

            // Update state with results
            setCombinedValue(combinedTotal);
            setTooltipLines(lines);
            setNonMonetaryBalances(nonMonetary);
            console.log('Calculation complete. Combined:', combinedTotal, 'Tooltips:', lines.length, 'Needs Fetch:', needsApiFetch);

            // Trigger API fetch if needed
            if (needsApiFetch) {
                console.log('Triggering background API fetch...');
                //setIsLoadingRates(true); // Already true or will be handled by useQuery refresh
                try {
                    const apiData = await fetchExternalExchangeRates(); // Fetches USD based rates
                    if (signal.aborted) return;
                    if (apiData && apiData.rates) {
                        const now = new Date();
                        const ratesToCache = Object.entries(apiData.rates).map(([currency, rate]) => ({
                            baseCurrency: BASE_CURRENCY,
                            targetCurrency: currency,
                            rate: rate as number,
                            timestamp: now,
                        }));
                        // Cache the fresh rates, passing *all* current rates for potential updates
                        await cacheExchangeRates(db, ratesToCache, allCachedRates);
                        console.log('Background fetch and cache complete.');
                        // Let useQuery refresh trigger final state/loading changes
                    }
                } catch (fetchError: any) {
                    if (fetchError.name !== 'AbortError') {
                        console.error('Error during background rate fetch:', fetchError);
                        toast({ title: 'Error', description: 'Could not update exchange rates.', variant: 'destructive' });
                        setIsLoadingRates(false); // Stop loading on error only if fetch fails
                    } else {
                        console.log('Background fetch aborted.');
                    }
                } finally {
                    // setIsLoadingRates(false); // Let useQuery handle final loading state
                }
            } else {
                setIsLoadingRates(false);
            }
        };

        calculate().catch((err) => {
            if (err.name !== 'AbortError') {
                console.error('Error in calculation effect:', err);
                setIsLoadingRates(false);
                setCombinedValue(null); // Indicate error state
                setTooltipLines(['Error calculating combined value.']);
            } else {
                console.log('Calculation aborted.');
            }
        });

        // Cleanup function
        return () => {
            console.log('Cleaning up calculation effect.');
            controller.abort();
        };
    }, [selectedDisplayCurrency, totalBalances, unitDefinitions, allCachedRates, db, hasFetchedInitialPrefs, isLoadingData, toast]); // Dependencies

    // --- Event Handlers ---
    const handleDeposit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !memberId || isDepositing || !data?.familyMembers?.[0]?.allowanceEnvelopes) return;

        const amount = parseFloat(depositAmount);
        if (isNaN(amount) || amount <= 0) {
            toast({ title: 'Invalid Amount', variant: 'destructive' });
            return;
        }
        // **** UPDATED: Validate typed currency format ****
        const finalDepositCurrency = depositCurrency.trim().toUpperCase();
        if (!finalDepositCurrency || finalDepositCurrency === '__DEFINE_NEW__') {
            toast({ title: 'Invalid Currency', description: 'Please select or define a currency/unit.', variant: 'destructive' });
            return;
        }

        // ... (rest of deposit logic using finalDepositCurrency) ...
        const defaultEnvelope = envelopes.find((env) => env.isDefault);
        if (!defaultEnvelope) {
            toast({ title: 'Deposit Failed', description: 'Default envelope not found.', variant: 'destructive' });
            return;
        }

        setIsDepositing(true);
        try {
            await depositToSpecificEnvelope(
                db,
                defaultEnvelope.id,
                defaultEnvelope.balances || {},
                amount,
                finalDepositCurrency, // TODO: What does the below || `Deposit to ${member?.name}` bit do?
                depositDescription.trim() || `Deposit to ${member?.name}` // Add default description
            );
            toast({ title: 'Success', description: `Deposited ${finalDepositCurrency} ${amount}` });
            setDepositAmount('');
            // setDepositCurrency('USD'); // Reset or keep?
            setDepositDescription('');
        } catch (err: any) {
            console.error('Failed to deposit:', err);
            toast({ title: 'Deposit Failed', description: err.message, variant: 'destructive' });
        } finally {
            setIsDepositing(false);
        }
    };

    // --- Save Allowance Settings Handler (Updated) ---
    const handleSaveAllowanceSettings = async () => {
        if (!member) return;

        const amount = allowanceAmountInput.trim() ? parseFloat(allowanceAmountInput) : null;
        const currency = allowanceCurrencyInput.trim().toUpperCase() || null;
        let rruleString: string | null = null;
        // *** REMOVED startOfWeek from config initialization ***
        let config: AllowanceConfig = {};

        if (allowanceRecurrenceOptions) {
            try {
                // Remove dtstart before generating string if it exists
                const optionsForString = { ...allowanceRecurrenceOptions };
                if ('dtstart' in optionsForString) delete optionsForString.dtstart;
                delete (optionsForString as any)._dtstart;

                // Ensure freq is present
                if (optionsForString.freq === undefined) {
                    throw new Error('Frequency (freq) is required to generate RRULE string.');
                }

                const rrule = new RRule(optionsForString);
                rruleString = rrule.toString();
                // *** REMOVED setting config.startOfWeek ***
                config.readable = rrule.toText();
            } catch (e: any) {
                toast({ title: 'Invalid Recurrence', description: `Could not save recurrence rule: ${e.message}`, variant: 'destructive' });
                return;
            }
        }

        const startDate = allowanceStartDateInput ? new Date(allowanceStartDateInput) : null;
        if (rruleString && !startDate) {
            toast({ title: 'Validation Error', description: 'A start date is required when recurrence is set.', variant: 'destructive' });
            return;
        }

        // +++ Parse and Validate Delay Days +++
        const delayDays = allowanceDelayDaysInput.trim() ? parseInt(allowanceDelayDaysInput, 10) : 0; // Default to 0 if empty
        if (isNaN(delayDays) || delayDays < 0) {
            toast({ title: 'Invalid Delay', description: 'Payout delay must be a non-negative whole number (0 or more days).', variant: 'destructive' });
            return;
        }

        // Basic validation
        if (amount !== null && (isNaN(amount) || amount < 0)) {
            toast({ title: 'Invalid Amount', description: 'Allowance amount must be a non-negative number.', variant: 'destructive' });
            return;
        }
        if (amount !== null && !currency) {
            toast({ title: 'Missing Currency', description: 'Please select a currency for the allowance amount.', variant: 'destructive' });
            return;
        }
        if (currency && amount === null) {
            toast({ title: 'Missing Amount', description: 'Please enter an amount for the allowance currency.', variant: 'destructive' });
            return;
        }

        setIsSavingAllowance(true);
        try {
            await db.transact(
                tx.familyMembers[member.id].update({
                    allowanceAmount: amount,
                    allowanceCurrency: currency,
                    allowanceRrule: rruleString,
                    allowanceStartDate: startDate ? startDate.toISOString() : null,
                    allowanceConfig: config,
                    allowancePayoutDelayDays: delayDays, // *** ADDED: Save the parsed delay ***
                })
            );
            toast({ title: 'Success', description: 'Allowance settings saved.' });
        } catch (err: any) {
            console.error('Failed to save allowance settings:', err);
            toast({ title: 'Save Failed', description: err.message, variant: 'destructive' });
        } finally {
            setIsSavingAllowance(false);
        }
    };

    // --- Other Handlers ---
    // ... (AddClick, EditClick, TransferClick, DeleteClick, TransferSubmit, DeleteConfirm, WithdrawClick, TransferToPersonClick, ShowTransactionsClick, DisplayCurrencyChange) ...
    const handleAddClick = () => setIsAddModalOpen(true);
    const handleEditClick = useCallback(
        (envelopeId: string) => {
            const envelope = envelopes.find((e) => e.id === envelopeId);
            if (envelope) {
                setEnvelopeToEdit(envelope);
                setIsEditModalOpen(true);
            }
        },
        [envelopes]
    );

    const handleTransferClick = useCallback((sourceId: string) => {
        setTransferSourceEnvelopeId(sourceId);
        setIsTransferModalOpen(true);
    }, []);

    const handleDeleteClick = useCallback(
        (envelopeId: string) => {
            const envelope = envelopes.find((e) => e.id === envelopeId);
            if (envelope) {
                // Prevent opening delete modal for the last envelope
                if (isLastEnvelope) {
                    toast({ title: 'Action Denied', description: 'Cannot delete the last envelope.', variant: 'destructive' });
                    return;
                }
                setEnvelopeToDelete(envelope);
                setIsDeleteModalOpen(true);
            }
        },
        [envelopes, isLastEnvelope, toast]
    ); // Added isLastEnvelope and toast dependencies //

    // **** NEW: Handler for Withdraw Button Click ****
    const handleWithdrawClick = () => {
        // Ensure there's an envelope to withdraw from before opening
        if (!envelopes || envelopes.length === 0) {
            toast({ title: 'Action Denied', description: 'You need at least one envelope to withdraw funds.', variant: 'destructive' });
            return;
        }
        setIsWithdrawModalOpen(true);
    };

    // **** NEW: Handler for Transfer to Person Button Click ****
    const handleTransferToPersonClick = () => {
        const otherMembers = allFamilyMembers.filter((m) => m.id !== memberId);
        if (!otherMembers || otherMembers.length === 0) {
            toast({ title: 'Action Denied', description: 'No other family members available to transfer to.', variant: 'destructive' });
            return;
        }
        if (!envelopes || envelopes.length === 0) {
            toast({ title: 'Action Denied', description: 'You need at least one envelope with funds to initiate a transfer.', variant: 'destructive' });
            return;
        }
        setIsTransferToPersonModalOpen(true);
    };

    // **** NEW: Handler to show transactions ****
    const handleShowTransactionsClick = () => {
        setShowingTransactions(true);
    };

    // --- **** NEW Handler to Change Display Currency **** ---
    const handleDisplayCurrencyChange = useCallback(
        (newCurrency: string) => {
            if (newCurrency && newCurrency !== selectedDisplayCurrency) {
                setSelectedDisplayCurrency(newCurrency);
                // Store preference asynchronously
                setLastDisplayCurrencyPref(db, memberId, newCurrency).catch((err) =>
                    toast({ title: 'Warning', description: 'Could not save currency preference.', variant: 'default' })
                );
            }
        },
        [selectedDisplayCurrency, db, memberId, toast]
    );

    // --- Modal Submit Handlers & Callbacks ---
    // ... (handleTransferSubmit, handleDeleteConfirm, handleUnitDefined, handleWithdrawSubmit, handleTransferToPersonSubmit) ...
    const handleTransferSubmit = async (amount: number, currency: string, destinationEnvelopeId: string) => {
        // Basic validation moved to form, but keep checks here too
        if (!db || !transferSourceEnvelopeId || !destinationEnvelopeId || amount <= 0) return; //

        const sourceEnvelope = envelopes.find((e) => e.id === transferSourceEnvelopeId); //
        const destinationEnvelope = envelopes.find((e) => e.id === destinationEnvelopeId); //

        if (!sourceEnvelope || !destinationEnvelope) {
            toast({ title: 'Error', description: 'Could not find source or destination envelope.', variant: 'destructive' }); //
            return; //
        }

        // More robust validation before calling utility
        const sourceBalance = sourceEnvelope.balances?.[currency] ?? 0;
        if (amount > sourceBalance) {
            toast({
                title: 'Transfer Failed',
                description: `Insufficient ${currency} funds in ${sourceEnvelope.name}.`,
                variant: 'destructive',
            });
            return;
        }

        try {
            await transferFunds(db, sourceEnvelope, destinationEnvelope, amount, currency); //
            toast({ title: 'Success', description: 'Funds transferred.' }); //
            setIsTransferModalOpen(false); //
            setTransferSourceEnvelopeId(null); //
        } catch (err: any) {
            toast({ title: 'Transfer Failed', description: err.message, variant: 'destructive' }); //
            // Don't close modal on error? Or handle within form? Decide on desired UX.
        }
    };

    const handleDeleteConfirm = async (transferTargetId: string, newDefaultId: string | null) => {
        if (!db || !envelopeToDelete || !transferTargetId) return; //
        // Added check: prevent deletion if it's the last one (belt-and-suspenders)
        if (envelopes.length <= 1) {
            toast({ title: 'Delete Failed', description: 'Cannot delete the last envelope.', variant: 'destructive' });
            setIsDeleteModalOpen(false);
            setEnvelopeToDelete(null);
            return;
        }

        try {
            await deleteEnvelope(db, envelopes, envelopeToDelete.id, transferTargetId, newDefaultId); //
            toast({ title: 'Success', description: `Envelope '${envelopeToDelete.name}' deleted.` }); //
            setIsDeleteModalOpen(false); //
            setEnvelopeToDelete(null); //
        } catch (err: any) {
            toast({ title: 'Delete Failed', description: err.message, variant: 'destructive' }); //
            // Consider keeping modal open on failure?
        }
    };

    // --- REMOVED handleUnitDefined (Handled by CurrencySelector) ---
    // const handleUnitDefined = (newCode: string) => {
    //     setIsDefineUnitModalOpen(false);
    //     // Update both deposit and allowance currency if the user defines a new one
    //     setDepositCurrency(newCode);
    //     setCurrencySearchInput(newCode);
    //     setAllowanceCurrencyInput(newCode); // Set allowance currency too
    //     setAllowanceCurrencySearch(newCode);
    // };

    const handleWithdrawSubmit = async (envelopeId: string, amount: number, currency: string, description?: string) => {
        const envelopeToWithdrawFrom = envelopes.find((e) => e.id === envelopeId);
        if (!envelopeToWithdrawFrom) {
            toast({ title: 'Error', description: 'Could not find the specified envelope.', variant: 'destructive' });
            return;
        }

        try {
            // Pass values to the utility function
            await withdrawFromEnvelope(db, envelopeToWithdrawFrom, amount, currency, description);
            toast({ title: 'Success', description: 'Withdrawal successful.' });
            setIsWithdrawModalOpen(false); // Close modal on success
        } catch (err: any) {
            console.error('Withdrawal failed:', err);
            toast({ title: 'Withdrawal Failed', description: err.message || 'Could not process withdrawal.', variant: 'destructive' });
            // Keep modal open on error
        }
    };

    // **** NEW: Handler for TransferToPersonForm Submission ****
    const handleTransferToPersonSubmit = async (
        sourceEnvelopeId: string,
        // Receive the full destination envelope object
        destinationDefaultEnvelope: Envelope,
        amount: number,
        currency: string,
        description?: string
    ) => {
        const sourceEnvelope = envelopes.find((e) => e.id === sourceEnvelopeId);
        if (!sourceEnvelope) {
            toast({ title: 'Error', description: 'Source envelope not found.', variant: 'destructive' });
            return;
        }

        try {
            // **** Use the passed destinationDefaultEnvelope directly ****
            await transferFundsToPerson(db, sourceEnvelope, destinationDefaultEnvelope, amount, currency, description);

            toast({ title: 'Success', description: 'Funds transferred successfully.' });
            setIsTransferToPersonModalOpen(false); // Close modal on success
        } catch (err: any) {
            console.error('Transfer to person failed:', err);
            toast({ title: 'Transfer Failed', description: err.message || 'Could not complete transfer.', variant: 'destructive' });
            // Keep modal open on error
        }
    };

    // --- Render Logic ---
    if (!memberId || !db) return <div className="p-4">Error: Missing required data.</div>;
    if (isLoadingData && !member) return <div className="p-4">Loading member details...</div>; // Show loading only if member isn't available yet
    if (errorData) return <div className="p-4 text-red-600">Error loading details: {errorData.message}</div>;
    if (!member) return <div className="p-4 text-muted-foreground">Member details not found.</div>;

    // --- Conditional Rendering for Transactions ---
    if (showingTransactions) {
        return (
            <div className="h-full">
                {' '}
                {/* Ensure container takes height */}
                <TransactionHistoryView
                    db={db}
                    mode="member"
                    familyMemberId={memberId}
                    unitDefinitions={unitDefinitions}
                    onClose={() => setShowingTransactions(false)} // Set state back to false
                />
            </div>
        );
    }

    // +++ Permission Logic +++
    const isParent = isParentMode;
    const isSelf = currentUser?.id === memberId;
    const canInteract = isParent || isSelf;
    const restrictionMsg = `You need to be logged in as ${member.name} or a parent to use this function.`;

    // --- Original Allowance Detail View ---
    return (
        // Use h-full and flex/flex-col if needed to ensure height consistency
        <div className="p-4 space-y-6 border rounded-lg bg-card text-card-foreground h-full flex flex-col">
            {/* Header Section */}
            <div className="flex justify-between items-center pb-4 border-b">
                <h2 className="text-xl font-bold">Allowance for {member.name}</h2>
                {/* **** NEW: Show Transactions Button **** */}
                <Button variant="outline" size="sm" onClick={handleShowTransactionsClick}>
                    <History className="mr-2 h-4 w-4" />
                    View History
                </Button>
            </div>
            {/* Wrap content in a flex-grow ScrollArea */}
            <ScrollArea className="flex-grow -mr-4 pr-4">
                <div className="space-y-6 pb-4">
                    {/* +++ NEW: Allowance Settings Section +++ */}
                    {isParent && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-lg flex items-center">
                                    <Settings className="mr-2 h-5 w-5" />
                                    Allowance Configuration
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* Amount */}
                                    <div>
                                        <Label htmlFor="allowance-amount">Amount per Period</Label>
                                        <Input
                                            id="allowance-amount"
                                            type="number"
                                            value={allowanceAmountInput}
                                            onChange={(e) => setAllowanceAmountInput(e.target.value)}
                                            placeholder="e.g., 10.00"
                                            step="0.01"
                                            min="0" // Generally allowance is non-negative
                                            disabled={isSavingAllowance}
                                        />
                                    </div>
                                    {/* Currency */}
                                    <div>
                                        <Label htmlFor="allowance-currency-input">Currency/Unit</Label>
                                        {/* +++ Use CurrencySelector for Allowance +++ */}
                                        <CurrencySelector
                                            db={db}
                                            value={allowanceCurrencyInput}
                                            onChange={setAllowanceCurrencyInput}
                                            currencyOptions={depositAndAllowanceCurrencyOptions} // Use same options as deposit
                                            unitDefinitions={unitDefinitions}
                                            disabled={isSavingAllowance}
                                            placeholder="Select or type unit..."
                                        />
                                    </div>
                                </div>

                                {/* Recurrence Settings */}
                                <div className="space-y-3 pt-3 border-t">
                                    <Label className="text-base font-medium">Frequency & Schedule</Label>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                                        {' '}
                                        {/* Use grid for side-by-side layout */}
                                        {/* Left Column: Start Date & Recurrence Form */}
                                        <div className="space-y-3">
                                            <div className="grid w-full items-center gap-1.5">
                                                <Label htmlFor="allowance-start-date">Schedule Start Date</Label>
                                                <Input
                                                    id="allowance-start-date"
                                                    type="date"
                                                    value={allowanceStartDateInput}
                                                    onChange={(e) => setAllowanceStartDateInput(e.target.value)}
                                                    disabled={isSavingAllowance}
                                                />
                                                <p className="text-xs text-muted-foreground">The date the allowance schedule begins.</p>
                                            </div>
                                            <RecurrenceRuleForm
                                                key={memberId} // Re-initialize when member changes
                                                onSave={(options) => {
                                                    console.log('Recurrence options saved:', options);
                                                    setAllowanceRecurrenceOptions(options); // Update state
                                                }}
                                                initialOptions={allowanceRecurrenceOptions}
                                            />
                                        </div>
                                        {/* Right Column: Delay and Week Start */}
                                        <div className="space-y-3">
                                            {/* +++ NEW: Payout Delay Input +++ */}
                                            <div className="grid w-full items-center gap-1.5">
                                                <Label htmlFor="allowance-delay-days">Calculation Delay (Days)</Label>
                                                <Input
                                                    id="allowance-delay-days"
                                                    type="number"
                                                    value={allowanceDelayDaysInput}
                                                    onChange={(e) => setAllowanceDelayDaysInput(e.target.value)}
                                                    placeholder="e.g., 1"
                                                    min="0" // Ensures non-negative input in browser
                                                    step="1" // Allows only whole numbers
                                                    disabled={isSavingAllowance}
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    Days after period ends to calculate/payout allowance (0 = same day).
                                                </p>
                                            </div>

                                            {/* *** REMOVED Weekly Start Day Select *** */}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Button onClick={handleSaveAllowanceSettings} disabled={isSavingAllowance}>
                                    {isSavingAllowance ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="mr-2 h-4 w-4" /> Save Settings
                                        </>
                                    )}
                                </Button>
                            </CardFooter>
                        </Card>
                    )}

                    {/* Deposit Section */}
                    {isParent && (
                        <section className="p-4 border rounded-md">
                            <h3 className="text-lg font-semibold mb-3">Add to Allowance (Manual Deposit)</h3>
                            <form onSubmit={handleDeposit} className="space-y-3">
                                {/* Deposit Amount */}
                                <div>
                                    <Label htmlFor="deposit-amount">Amount</Label>
                                    <Input
                                        id="deposit-amount"
                                        type="number"
                                        value={depositAmount}
                                        onChange={(e) => setDepositAmount(e.target.value)}
                                        placeholder="e.g., 10.00"
                                        step="0.01"
                                        required
                                        disabled={isDepositing}
                                    />
                                </div>
                                {/* Deposit Currency */}
                                <div>
                                    <Label htmlFor="deposit-currency-input">Currency/Unit</Label>
                                    {/* +++ Use CurrencySelector for Deposit +++ */}
                                    <CurrencySelector
                                        db={db}
                                        value={depositCurrency}
                                        onChange={setDepositCurrency}
                                        currencyOptions={depositAndAllowanceCurrencyOptions}
                                        unitDefinitions={unitDefinitions}
                                        disabled={isDepositing}
                                        placeholder="Select or type unit..."
                                    />
                                </div>
                                {/* Deposit Description */}
                                <div>
                                    <Label htmlFor="deposit-description">Description (Optional)</Label>
                                    <Input
                                        id="deposit-description"
                                        type="text"
                                        value={depositDescription}
                                        onChange={(e) => setDepositDescription(e.target.value)}
                                        placeholder="e.g., Weekly allowance"
                                        disabled={isDepositing}
                                    />
                                </div>
                                <Button type="submit" disabled={isDepositing}>
                                    {isDepositing ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Depositing...
                                        </>
                                    ) : (
                                        'Deposit Funds'
                                    )}
                                </Button>
                            </form>
                        </section>
                    )}

                    {/* Total Allowance Display & Actions */}
                    <section className="p-4 border rounded-md bg-muted/50">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                            {/* Balance Display */}
                            <div className="flex-grow">
                                <h3 className="text-lg font-semibold mb-1">Total Balance</h3>
                                {/* Use CombinedBalanceDisplay */}
                                {selectedDisplayCurrency ? (
                                    <CombinedBalanceDisplay
                                        totalBalances={totalBalances}
                                        displayCurrency={selectedDisplayCurrency}
                                        combinedMonetaryValue={combinedValue} // Pass calculated value
                                        nonMonetaryBalances={nonMonetaryBalances} // Pass separated balances
                                        tooltipLines={tooltipLines} // Pass breakdown lines
                                        unitDefinitions={unitDefinitions}
                                        onCurrencyChange={handleDisplayCurrencyChange}
                                        className="mt-1"
                                        isLoading={isLoadingRates || (!hasFetchedInitialPrefs && isLoadingData)} // Combine loading states
                                        // **** NEW: Pass all monetary currencies ****
                                        allMonetaryCurrenciesInUse={allMonetaryCurrenciesInUse}
                                    />
                                ) : (
                                    // Fallback (should only show briefly during initial load)
                                    <p className="text-lg font-medium opacity-50">{formatBalances(totalBalances, unitDefinitions)}</p>
                                )}
                            </div>
                            {/* Action Buttons */}
                            <div className="flex flex-col sm:flex-row gap-2 shrink-0 pt-1">
                                <RestrictedButton
                                    isRestricted={!canInteract}
                                    restrictionMessage={restrictionMsg}
                                    variant="outline"
                                    onClick={handleWithdrawClick}
                                >
                                    {' '}
                                    <MinusCircle className="mr-2 h-4 w-4" /> Withdraw{' '}
                                </RestrictedButton>
                                {/* **** UPDATED: Added onClick handler **** */}
                                <RestrictedButton
                                    isRestricted={!canInteract}
                                    restrictionMessage={restrictionMsg}
                                    variant="outline"
                                    onClick={handleTransferToPersonClick}
                                >
                                    {' '}
                                    <Users className="mr-2 h-4 w-4" /> Transfer to Person{' '}
                                </RestrictedButton>
                            </div>
                        </div>
                    </section>

                    {/* Envelopes Section */}
                    <section>
                        {/* ... Envelope list mapping EnvelopeItem ... */}
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-lg font-semibold">Envelopes</h3>
                            <RestrictedButton isRestricted={!canInteract} restrictionMessage={restrictionMsg} onClick={handleAddClick} size="sm">
                                + Add Envelope
                            </RestrictedButton>
                        </div>
                        {/* ... loading/empty states ... */}
                        {envelopes.length === 0 && !isLoadingData && <p className="text-muted-foreground italic">No envelopes created yet.</p>}
                        {isLoadingData && envelopes.length === 0 && <p className="text-muted-foreground italic">Loading envelopes...</p>}
                        <div>
                            {envelopes.map((envelope) => (
                                <EnvelopeItem
                                    key={envelope.id}
                                    db={db}
                                    envelope={envelope}
                                    isLastEnvelope={isLastEnvelope}
                                    unitDefinitions={unitDefinitions}
                                    // **** Pass cached rates down ****
                                    allCachedRates={allCachedRates}
                                    onEdit={(id) => {
                                        if (!validateRestriction(currentUser, memberId, member.name)) return;
                                        handleEditClick(id);
                                    }}
                                    onTransfer={(id) => {
                                        if (!validateRestriction(currentUser, memberId, member.name)) return;
                                        handleTransferClick(id);
                                    }}
                                    onDelete={(id) => {
                                        if (!validateRestriction(currentUser, memberId, member.name)) return;
                                        handleDeleteClick(id);
                                    }}
                                />
                            ))}
                        </div>
                    </section>
                </div>
                {/* End inner padding div */}
            </ScrollArea>{' '}
            {/* End ScrollArea */}
            {/* --- Modals --- */}
            <AddEditEnvelopeForm
                db={db}
                isOpen={isAddModalOpen || isEditModalOpen}
                onClose={() => {
                    setIsAddModalOpen(false);
                    setIsEditModalOpen(false);
                    setEnvelopeToEdit(null);
                }}
                initialData={envelopeToEdit}
                memberId={memberId}
                allMemberEnvelopes={envelopes}
                // **** Pass unit definitions to Add/Edit form ****
                unitDefinitions={unitDefinitions}
                allMonetaryCurrenciesInUse={allMonetaryCurrenciesInUse}
            />
            <TransferFundsForm
                db={db}
                isOpen={isTransferModalOpen}
                onClose={() => {
                    setIsTransferModalOpen(false);
                    setTransferSourceEnvelopeId(null);
                }}
                onSubmit={handleTransferSubmit}
                sourceEnvelopeId={transferSourceEnvelopeId}
                allEnvelopes={envelopes}
                // **** Pass unit definitions if needed by Transfer form for formatting ****
                unitDefinitions={unitDefinitions}
            />
            <DeleteEnvelopeDialog
                db={db}
                isOpen={isDeleteModalOpen}
                onClose={() => {
                    setIsDeleteModalOpen(false);
                    setEnvelopeToDelete(null);
                }}
                onConfirm={handleDeleteConfirm}
                envelopeToDelete={envelopeToDelete}
                allEnvelopes={envelopes}
            />
            {/* --- REMOVED DefineUnitForm (Handled by CurrencySelector) --- */}
            {/* <DefineUnitForm
                db={db}
                isOpen={isDefineUnitModalOpen}
                onClose={() => setIsDefineUnitModalOpen(false)}
                onUnitDefined={handleUnitDefined} // Pass the callback
            /> */}
            {/* **** NEW: Withdraw Modal **** */}
            <WithdrawForm
                db={db}
                isOpen={isWithdrawModalOpen}
                onClose={() => setIsWithdrawModalOpen(false)}
                onSubmit={handleWithdrawSubmit}
                memberEnvelopes={envelopes}
                unitDefinitions={unitDefinitions}
            />
            {/* **** NEW: Transfer to Person Modal **** */}
            <TransferToPersonForm
                db={db}
                isOpen={isTransferToPersonModalOpen}
                onClose={() => setIsTransferToPersonModalOpen(false)}
                onSubmit={handleTransferToPersonSubmit} // Pass the new handler
                sourceMemberId={memberId} // Pass current member's ID
                allFamilyMembers={allFamilyMembers} // Pass the list from props
                sourceMemberEnvelopes={envelopes} // Pass current member's envelopes
                unitDefinitions={unitDefinitions} // Pass definitions
            />
        </div>
    );
}
