// components/allowance/TransactionHistoryView.tsx
import React, { useState, useMemo } from 'react';
import { tx, id } from '@instantdb/react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Filter } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatBalances, UnitDefinition } from '@/lib/currency-utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge'; // For transaction type

// Define expected Transaction structure based on schema and query
// Needs refinement based on actual query results
interface Transaction {
    id: string;
    amount: number;
    createdAt: string; // ISO String date
    createdBy?: string | null;
    createdByFamilyMemberId?: string | null;
    currency: string;
    transactionType: string;
    description?: string | null;
    // **** UPDATED: These are has-one relationships, so they return objects, not arrays ****
    envelope?: { id: string; name: string; familyMember?: { id: string; name: string } };
    sourceEnvelope?: { id: string; name: string; familyMember?: { id: string; name: string } };
    destinationEnvelope?: { id: string; name: string; familyMember?: { id: string; name: string } };
}

type FamilyMemberName = { id: string; name?: string | null };

interface TransactionHistoryViewProps {
    db: any;
    mode: 'all' | 'member';
    familyMemberId?: string | null; // Required if mode is 'member'
    unitDefinitions: UnitDefinition[];
    onClose: () => void; // Callback to close/go back
}

// Helper to format date
const formatDate = (dateString: string): string => {
    try {
        return new Date(dateString).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch (e) {
        return dateString; // Fallback
    }
};

const getTransactionActorLabel = (tx: Transaction, familyMemberNamesById: Map<string, string>): string | null => {
    if (tx.createdByFamilyMemberId) {
        const name = familyMemberNamesById.get(tx.createdByFamilyMemberId);
        if (name) return name;
        return 'Unknown family member';
    }

    if (tx.createdBy) {
        return 'Unknown (legacy or shared principal)';
    }

    return null;
};

// **** UPDATED Helper to interpret transaction details ****
const getTransactionDetails = (tx: Transaction, isIntraMemberTransfer: boolean): string => {
    // Safely access the relationships (removed [0] as these are single objects)
    const envelope = tx.envelope; // Envelope directly affected
    const srcEnv = tx.sourceEnvelope;
    const destEnv = tx.destinationEnvelope;
    const srcMember = srcEnv?.familyMember;
    const destMember = destEnv?.familyMember;

    // Get names with fallbacks
    const envName = envelope?.name || '? Envelope';
    const srcEnvName = srcEnv?.name || '? Source Env';
    const destEnvName = destEnv?.name || '? Dest Env';
    const srcMemberName = srcMember?.name || 'Other Member';
    const destMemberName = destMember?.name || 'Other Member';

    // Handle the combined type specifically
    if (isIntraMemberTransfer) {
        // Use source/dest from the 'transfer-in' record
        return `Transfer from ${srcEnvName} to ${destEnvName}`;
    }

    // Original logic for other types
    switch (tx.transactionType) {
        case 'deposit':
            // Check if source info is available (e.g., if it was a transfer-in deposit)
            if (srcMember && srcEnv) {
                return `Deposit from ${srcMemberName} ${srcEnvName}`;
            }
            return `Deposit to ${envName}`; // Basic deposit
        case 'withdrawal':
            // Check if destination info is available (e.g. transfer-out withdrawal)
            if (destMember && destEnv) {
                return `Withdrawal to ${destMemberName} (${destEnvName})`;
            }
            return `Withdrawal from ${envName}`; // Basic withdrawal
        case 'transfer-in': // Intra-member transfer IN
            // This type might not be used if using transfer-in-person for all receipts?
            // Assuming it means received from same member's other envelope
            return `Transfer from ${srcEnvName} to ${destEnvName || envName}`;
        case 'transfer-out': // Intra-member transfer OUT
            // Assuming it means sent to same member's other envelope
            return `Transfer from ${srcEnvName || envName} to ${destEnvName}`;
        case 'transfer-in-person': // Received from another person
            // Envelope receiving the funds is tx.envelope or tx.destinationEnvelope
            // Source is tx.sourceEnvelope (which has the source member)
            return `Transfer from ${srcMemberName} to ${destEnvName}`; // Shows who sent it and from which of their envelopes
        case 'transfer-out-person': // Sent to another person
            // Envelope losing the funds is tx.envelope or tx.sourceEnvelope
            // Destination is tx.destinationEnvelope (which has the dest member)
            return `Transfer to ${destMemberName}`; // Shows who received it and in which of their envelopes
        default:
            // Fallback using description or type
            const fallbackDetail = tx.description || tx.transactionType || 'Unknown Transaction';
            console.warn('Unhandled transaction type or missing details for:', tx.transactionType, tx);
            return fallbackDetail;
    }
};

// getTransactionStyle - check for intra-member transfer-in case
const getTransactionStyle = (tx: Transaction, isIntraMemberTransfer: boolean): { sign: string; colorClass: string } => {
    if (isIntraMemberTransfer) {
        return { sign: '', colorClass: 'text-foreground' }; // Neutral style
    }
    // Original logic
    if (tx.amount > 0) return { sign: '+', colorClass: 'text-green-600' };
    if (tx.amount < 0) return { sign: '', colorClass: 'text-red-600' };
    return { sign: '', colorClass: 'text-muted-foreground' };
};

// getDisplayTransactionType - check for intra-member transfer-in case
const getDisplayTransactionType = (tx: Transaction, isIntraMemberTransfer: boolean): string => {
    if (isIntraMemberTransfer) {
        return 'Transfer';
    }
    // Original logic
    switch (tx.transactionType) {
        case 'deposit':
            return 'Deposit';
        case 'withdrawal':
            return 'Withdrawal';
        case 'transfer-in-person':
            return 'Received';
        case 'transfer-out-person':
            return 'Sent';
        // transfer-out (intra-member) is filtered
        // transfer-in (intra-member) handled above
        default:
            return tx.transactionType;
    }
};

const TransactionHistoryView: React.FC<TransactionHistoryViewProps> = ({ db, mode, familyMemberId, unitDefinitions, onClose }) => {
    const [filterCurrency, setFilterCurrency] = useState<string | null>(null); // null means 'all'

    // --- Data Fetching ---
    // Query based on mode
    // Note: Query structure needs careful testing with InstantDB links
    const query = useMemo(() => {
        if (mode === 'member' && familyMemberId) {
            // Fetch member -> envelopes -> transactions, and linked source/dest envelopes + their members
            return {
                familyMembers: {
                    $: {
                        where: {
                            id: familyMemberId,
                        },
                    },
                    allowanceEnvelopes: {
                        transactions: {
                            envelope: {},
                            sourceEnvelope: {
                                familyMember: {},
                            },
                            destinationEnvelope: {
                                familyMember: {},
                            },
                        },
                    },
                },
            };
        } else if (mode === 'all') {
            // Fetch ALL transactions and their related envelopes/members
            // This might be performance-intensive and query structure might need adjustment
            return {
                allowanceTransactions: {
                    $: {
                        order: {
                            serverCreatedAt: 'desc',
                        },
                    },
                    envelope: {
                        familyMember: {},
                    },
                    sourceEnvelope: {
                        familyMember: {},
                    },
                    destinationEnvelope: {
                        familyMember: {},
                    },
                },
            };
        }
        return {}; // Default empty query if props are invalid
    }, [mode, familyMemberId]);

    const { isLoading, error, data } = db.useQuery(query, { enabled: mode === 'all' || (mode === 'member' && !!familyMemberId) });
    const familyNamesQuery = db.useQuery({ familyMembers: {} });
    const familyMemberNamesById = useMemo(() => {
        const members = (familyNamesQuery.data?.familyMembers as FamilyMemberName[]) || [];
        return new Map(members.map((member) => [member.id, member.name || 'Unknown']));
    }, [familyNamesQuery.data]);

    // --- Data Processing & Filtering ---
    const processedTransactions: Transaction[] = useMemo(() => {
        if (isLoading || error || !data) return [];

        let rawTxs: Transaction[] = [];
        if (mode === 'member') {
            rawTxs = data.familyMembers?.[0]?.allowanceEnvelopes?.flatMap((env: any) => env.transactions || []) || [];
        } else if (mode === 'all') {
            rawTxs = data.allowanceTransactions || [];
        }

        let finalTxs = rawTxs;

        // Only filter if in member view mode
        if (mode === 'member' && familyMemberId) {
            finalTxs = rawTxs.filter((tx) => {
                // Check if it's an intra-member transfer-out
                const srcEnv = tx.sourceEnvelope;
                const destEnv = tx.destinationEnvelope;
                const isIntraMemberTransferOut =
                    tx.transactionType === 'transfer-out' && srcEnv?.familyMember?.id === familyMemberId && destEnv?.familyMember?.id === familyMemberId;

                // Exclude (return false) if it IS an intra-member transfer-out
                return !isIntraMemberTransferOut;
            });
        }

        // Sort the results
        finalTxs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return finalTxs;
    }, [data, isLoading, error, mode, familyMemberId]);

    // Get unique currencies for the filter dropdown
    const availableCurrencies = useMemo(() => {
        const currencies = new Set(processedTransactions.map((tx) => tx.currency));
        return Array.from(currencies).sort();
    }, [processedTransactions]);

    // Apply currency filter
    const filteredTransactions = useMemo(() => {
        if (!filterCurrency) return processedTransactions; // No filter applied
        return processedTransactions.filter((tx) => tx.currency === filterCurrency);
    }, [processedTransactions, filterCurrency]);

    // Sort transactions by date (descending) - API might handle this via query ($orderBy)
    const sortedTransactions = useMemo(() => {
        return [...filteredTransactions].sort((a, b) => {
            try {
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            } catch {
                return 0; // Fallback sort
            }
        });
    }, [filteredTransactions]);

    // --- Render Logic ---
    if (isLoading) return <div className="p-4">Loading transactions...</div>;
    if (error) return <div className="p-4 text-red-600">Error loading transactions: {error.message}</div>;

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
                <div className="flex items-center space-x-2">
                    <Button variant="ghost" size="icon" onClick={onClose} aria-label="Go Back">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <CardTitle className="text-lg font-semibold">{mode === 'member' ? 'Member Transactions' : 'All Transactions'}</CardTitle>
                </div>
                {/* Currency Filter */}
                <div className="flex items-center space-x-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select value={filterCurrency || 'all'} onValueChange={(value) => setFilterCurrency(value === 'all' ? null : value)}>
                        <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="Filter Currency" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Currencies</SelectItem>
                            {availableCurrencies.map((currency) => (
                                <SelectItem key={currency} value={currency}>
                                    {currency}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent className="flex-grow p-0 overflow-hidden">
                <ScrollArea className="h-full p-4">
                    {filteredTransactions.length === 0 ? (
                        <p className="text-center text-muted-foreground py-10">No transactions found{filterCurrency ? ` for ${filterCurrency}` : ''}.</p>
                    ) : (
                        <ul className="space-y-4">
                            {filteredTransactions.map((tx) => {
                                // Determine if this 'transfer-in' is the one we kept for an intra-member transfer
                                const isIntraMemberTransfer =
                                    mode === 'member' && // Only apply in member mode
                                    tx.transactionType === 'transfer-in' &&
                                    tx.sourceEnvelope?.familyMember?.id === familyMemberId &&
                                    tx.destinationEnvelope?.familyMember?.id === familyMemberId;

                                // Use the updated helper functions, passing the flag
                                const { sign, colorClass } = getTransactionStyle(tx, isIntraMemberTransfer);
                                const details = getTransactionDetails(tx, isIntraMemberTransfer);
                                const actorLabel = getTransactionActorLabel(tx, familyMemberNamesById);
                                const displayAmount = isIntraMemberTransfer ? Math.abs(tx.amount) : tx.amount; // Use absolute only for the styled intra-member one
                                const formattedAmountString = formatBalances({ [tx.currency]: Math.abs(displayAmount) }, unitDefinitions); // Format absolute for consistency display
                                const displayType = getDisplayTransactionType(tx, isIntraMemberTransfer);

                                return (
                                    <li key={tx.id} className="flex items-center space-x-4 border-b pb-3 last:border-b-0">
                                        {/* Amount Display */}
                                        <div className="flex-shrink-0 w-24 text-right pr-2">
                                            {' '}
                                            {/* Slightly wider, right align */}
                                            {/* **** Display the full formatted string **** */}
                                            <span className={`text-lg font-semibold ${colorClass}`}>
                                                {' '}
                                                {/* Adjusted size slightly */}
                                                {/* Show sign only if NOT the specially styled intra-member transfer */}
                                                {!isIntraMemberTransfer && tx.amount !== 0 ? (tx.amount > 0 ? '+' : '') : ''}
                                                {formattedAmountString}
                                            </span>
                                            <span className="text-xs text-muted-foreground block">{tx.currency}</span>
                                        </div>
                                        {/* Details Display */}
                                        <div className="flex-grow">
                                            {/* Use the potentially more detailed 'details' string */}
                                            <p className="text-sm font-medium leading-none">{details}</p>
                                            {/* Show explicit description only if it exists AND differs from the generated details */}
                                            {tx.description && tx.description !== details && (
                                                <p className="text-xs text-muted-foreground pt-1 italic">{tx.description}</p>
                                            )}
                                            <p className="text-xs text-muted-foreground pt-1">{formatDate(tx.createdAt)}</p>
                                            {actorLabel && <p className="text-xs text-muted-foreground pt-1">Created by {actorLabel}</p>}
                                        </div>
                                        {/* Transaction Type Badge */}
                                        <Badge variant="outline" className="flex-shrink-0">
                                            {displayType}
                                        </Badge>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    );
};

export default TransactionHistoryView;
