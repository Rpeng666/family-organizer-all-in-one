// components/allowance/WithdrawForm.tsx
import React, { useState, useEffect, FormEvent, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import { Envelope, UnitDefinition, formatBalances } from '@/lib/currency-utils';

interface WithdrawFormProps {
  db: any;
  isOpen: boolean;
  onClose: () => void;
  // **** UPDATED: Add optional description to onSubmit signature ****
  onSubmit: (envelopeId: string, amount: number, currency: string, description?: string) => Promise<void>;
  memberEnvelopes: Envelope[];
  unitDefinitions: UnitDefinition[];
}

const WithdrawForm: React.FC<WithdrawFormProps> = ({
  db,
  isOpen,
  onClose,
  onSubmit,
  memberEnvelopes,
  unitDefinitions,
}) => {
  const { toast } = useToast();
  const [selectedEnvelopeId, setSelectedEnvelopeId] = useState<string | undefined>(undefined);
  const [selectedCurrency, setSelectedCurrency] = useState<string | undefined>(undefined);
  const [amount, setAmount] = useState('');
  // **** NEW: State for description ****
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Derived Values ---

  // Find the selected envelope object
  const selectedEnvelope = useMemo(() => {
    return memberEnvelopes.find(e => e.id === selectedEnvelopeId);
  }, [selectedEnvelopeId, memberEnvelopes]);

  // Get available currencies with positive balance from the selected envelope
  const availableCurrencies = useMemo(() => {
    if (!selectedEnvelope || !selectedEnvelope.balances) return [];
    return Object.entries(selectedEnvelope.balances)
      .filter(([_, balance]) => balance > 0)
      .map(([currency]) => currency);
  }, [selectedEnvelope]);

  // Get the balance for the selected currency in the selected envelope
  const currentBalance = useMemo(() => {
      if (!selectedEnvelope || !selectedCurrency || !selectedEnvelope.balances) return 0;
      return selectedEnvelope.balances[selectedCurrency] ?? 0;
  }, [selectedEnvelope, selectedCurrency]);

  // --- Effects ---
  // Reset dependent fields when envelope changes
  useEffect(() => {
    // This effect seems less necessary now with the full reset below?
    // Consider removing if the full reset covers all cases.
    // Leaving it for now.
    // The following 3 lines were in a `if (isOpen) {}` clause, not sure if it's needed
    setSelectedCurrency(undefined);
    setAmount('');
    setDescription(''); // Also reset description if envelope changes
  }, [selectedEnvelopeId]); // Depends only on envelope change

  // Reset form completely when modal opens
   useEffect(() => {
     if (isOpen) {
       setSelectedEnvelopeId(undefined);
       setSelectedCurrency(undefined);
       setAmount('');
       setDescription(''); // Reset description on open
       setIsSubmitting(false);
     }
   }, [isOpen]); // Depends only on modal opening


  // Reset currency if it becomes unavailable (e.g., balance becomes 0 elsewhere)
  useEffect(() => {
    if (selectedCurrency && !availableCurrencies.includes(selectedCurrency)) {
      setSelectedCurrency(undefined);
    }
  }, [availableCurrencies, selectedCurrency]);

  // --- Submit Handler ---
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const withdrawAmount = parseFloat(amount);
    const trimmedDescription = description.trim(); // Get trimmed description

    // --- Validation ---
    if (!selectedEnvelopeId || !selectedCurrency || isNaN(withdrawAmount) || withdrawAmount <= 0) {
      toast({ title: "Validation Error", description: "Please fill all fields with valid values.", variant: "destructive" });
      return;
    }

    if (withdrawAmount > currentBalance) {
         toast({
            title: "Validation Error",
            description: `Insufficient funds. Available: ${formatBalances({[selectedCurrency]: currentBalance}, unitDefinitions)}.`,
            variant: "destructive",
         });
         return;
    }
    // --- End Validation ---

    setIsSubmitting(true);
    try {
        // Call the onSubmit prop passed from the parent, which contains the actual DB logic
        // **** UPDATED: Pass description to onSubmit ****
        await onSubmit(selectedEnvelopeId, withdrawAmount, selectedCurrency, trimmedDescription);
    // Parent component (MemberAllowanceDetail) should handle success toast & closing modal
    } catch (err: any) {
        // Parent should ideally handle error toast as well, but log here just in case
        console.error("Withdrawal failed:", err);
    // Optional: Show a generic error toast here if parent doesn't
    // toast({ title: "Withdrawal Failed", description: err.message || "Could not process withdrawal.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) { return null; }
  // Check if there are any envelopes to withdraw from
  const canWithdraw = memberEnvelopes && memberEnvelopes.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Withdraw Funds</DialogTitle>
        </DialogHeader>
        {!canWithdraw ? (
             <p className="py-4 text-muted-foreground">You need at least one envelope to withdraw funds.</p>
        ) : (
            <form onSubmit={handleSubmit}>
            {/* Use space-y-4 for better vertical spacing */}
            <div className="space-y-4 py-4">
                {/* From Envelope */}
                <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="withdraw-envelope">From Envelope</Label>
                    <Select
                        value={selectedEnvelopeId}
                        onValueChange={setSelectedEnvelopeId}
                        required
                        disabled={isSubmitting}
                        name="withdraw-envelope"
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select envelope..." />
                        </SelectTrigger>
                        <SelectContent>
                        {memberEnvelopes.map(envelope => (
                            <SelectItem key={envelope.id} value={envelope.id}>
                                {envelope.name} ({formatBalances(envelope.balances || {}, unitDefinitions)})
                            </SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Currency */}
                <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="withdraw-currency">Currency/Unit</Label>
                    <Select
                    value={selectedCurrency}
                    onValueChange={setSelectedCurrency}
                    required
                    disabled={isSubmitting || !selectedEnvelopeId || availableCurrencies.length === 0}
                    name="withdraw-currency"
                >
                        <SelectTrigger>
                            <SelectValue placeholder={!selectedEnvelopeId ? "Select envelope first" : availableCurrencies.length === 0 ? "No funds available" : "Select currency..."} />
                        </SelectTrigger>
                        <SelectContent>
                        {availableCurrencies.map(currency => (
                            <SelectItem key={currency} value={currency}>
                                {currency} ({formatBalances({[currency]: selectedEnvelope?.balances?.[currency] ?? 0}, unitDefinitions)})
                            </SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Amount */}
                 <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="withdraw-amount">Amount</Label>
                    <Input
                        id="withdraw-amount"
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="col-span-3"
                        placeholder="e.g., 5.00"
                        step="0.01" // Adjust step based on currency needs if possible?
                        required
                        disabled={isSubmitting || !selectedCurrency}
                        min="0.01" // Minimum withdraw amount
                        max={currentBalance > 0 ? String(currentBalance) : undefined} // Set max based on available balance
                    />
                </div>

                {/* **** NEW: Description Field **** */}
                <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="withdraw-description">Description (Optional)</Label>
                    <Input
                        id="withdraw-description"
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g., Cash withdrawal"
                        disabled={isSubmitting}
                    />
                </div>
            </div>
            <DialogFooter>
                <DialogClose asChild>
                <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </Button>
                </DialogClose>
                <Button
                    type="submit"
                    disabled={
                        isSubmitting ||
                        !selectedEnvelopeId ||
                        !selectedCurrency ||
                        !amount ||
                        parseFloat(amount) <= 0 ||
                        parseFloat(amount) > currentBalance
                    }
                >
                {isSubmitting ? (
                    <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Withdrawing... </>
                ) : ( 'Confirm Withdraw' )}
                </Button>
            </DialogFooter>
            </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WithdrawForm;