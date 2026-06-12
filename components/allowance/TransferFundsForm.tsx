// components/allowance/TransferFundsForm.tsx
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
import { Envelope } from '@/components/EnvelopeItem'; // Assuming type export
import { formatBalances } from '@/lib/currency-utils'; // For display if needed

interface TransferFundsFormProps {
  db: any; // InstantDB instance
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (amount: number, currency: string, destinationEnvelopeId: string) => Promise<void>;
  sourceEnvelopeId: string | null;
  allEnvelopes: Envelope[]; // All envelopes for the member
  unitDefinitions?: any[]; // Optional unit definitions for formatting
}

const TransferFundsForm: React.FC<TransferFundsFormProps> = ({
  db,
  isOpen,
  onClose,
  onSubmit,
  sourceEnvelopeId,
  allEnvelopes,
}) => {
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState<string | undefined>(undefined);
  const [destinationEnvelopeId, setDestinationEnvelopeId] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sourceEnvelope = allEnvelopes.find(e => e.id === sourceEnvelopeId);
  // Memoize derived values to prevent unnecessary recalculations/triggers if props haven't changed deeply
  const availableCurrencies = useMemo(() => {
    return sourceEnvelope ?
      Object.keys(sourceEnvelope.balances || {}).filter(cur => (sourceEnvelope.balances[cur] ?? 0) > 0)
      : [];
  }, [sourceEnvelope]); // Depend only on the sourceEnvelope object

  const destinationOptions = useMemo(() => {
    return allEnvelopes.filter(e => e.id !== sourceEnvelopeId);
  }, [allEnvelopes, sourceEnvelopeId]); // Depend on allEnvelopes and sourceId

 // --- Effect 1: Reset the entire form when the modal opens ---
 useEffect(() => {
    if (isOpen) {
      setAmount('');
      // Auto-select currency based on the *current* availableCurrencies
      setSelectedCurrency(availableCurrencies.length === 1 ? availableCurrencies[0] : undefined);
      setDestinationEnvelopeId(undefined);
      setIsSubmitting(false);
    }
    // This effect should ONLY run when 'isOpen' changes to true.
    // Adding availableCurrencies back here might reintroduce issues if it changes while modal is open.
    // Consider if auto-selecting currency needs to react to availableCurrencies changing *while open*.
  }, [isOpen]); // <<-- Depend primarily on isOpen


  // --- Effect 2: Reset currency/destination if sourceEnvelopeId changes WHILE open ---
  // This handles the case where the source might change without closing/reopening.
  // If your UI doesn't allow this, you might simplify or remove this effect.
  useEffect(() => {
    // Only run if the modal is open AND sourceEnvelopeId is valid
    if (isOpen && sourceEnvelopeId) {
      // Reset amount too? Depends on desired UX.
      // setAmount('');
      setSelectedCurrency(availableCurrencies.length === 1 ? availableCurrencies[0] : undefined);
      setDestinationEnvelopeId(undefined);
      // Don't reset isSubmitting here unless necessary
    }
  }, [sourceEnvelopeId, isOpen, availableCurrencies]); // Depend on sourceId, isOpen, and the currencies for that source


  // --- Effect 3: Ensure selected currency remains valid ---
  // (Keep your existing effect for this if you have one, or add it)
  useEffect(() => {
    if (isOpen && selectedCurrency && !availableCurrencies.includes(selectedCurrency)) {
      // Reset to default/undefined if the selected currency disappears
      setSelectedCurrency(availableCurrencies.length === 1 ? availableCurrencies[0] : undefined);
    }
  }, [selectedCurrency, availableCurrencies, isOpen]);


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const transferAmount = parseFloat(amount);

    if (!sourceEnvelope || !destinationEnvelopeId || !selectedCurrency || isNaN(transferAmount) || transferAmount <= 0) {
      toast({
        title: "Validation Error",
        description: "Please fill all fields with valid values.",
        variant: "destructive",
      });
      return;
    }

    const sourceBalance = sourceEnvelope.balances?.[selectedCurrency] ?? 0;
    if (transferAmount > sourceBalance) {
         toast({
            title: "Validation Error",
            description: `Insufficient funds. You only have ${formatBalances({[selectedCurrency]: sourceBalance})}.`,
            variant: "destructive",
         });
         return;
    }


    setIsSubmitting(true);
    try {
      await onSubmit(transferAmount, selectedCurrency, destinationEnvelopeId);
      // onSubmit should handle success toast and closing the modal
    } catch (err: any) {
      // onSubmit should handle error toast
      console.error("Transfer failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !sourceEnvelope) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Transfer Funds from {sourceEnvelope.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Amount */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="transfer-amount" className="text-right">
                Amount
              </Label>
              <Input
                id="transfer-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="col-span-3"
                placeholder="e.g., 5.00"
                step="0.01"
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Currency */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="transfer-currency" className="text-right">
                Currency
              </Label>
              <Select
                value={selectedCurrency}
                onValueChange={setSelectedCurrency}
                required
                disabled={isSubmitting || availableCurrencies.length === 0}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={availableCurrencies.length === 0 ? "No funds available" : "Select currency"} />
                </SelectTrigger>
                <SelectContent>
                  {availableCurrencies.map(currency => (
                    <SelectItem key={currency} value={currency}>
                      {currency} ({formatBalances({[currency]: sourceEnvelope.balances?.[currency] ?? 0})})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Destination Envelope */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="destination-envelope" className="text-right">
                To
              </Label>
              <Select
                 value={destinationEnvelopeId}
                 onValueChange={setDestinationEnvelopeId}
                 required
                 disabled={isSubmitting || destinationOptions.length === 0}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={destinationOptions.length === 0 ? "No other envelopes" : "Select destination"}/>
                </SelectTrigger>
                <SelectContent>
                  {destinationOptions.map(envelope => (
                    <SelectItem key={envelope.id} value={envelope.id}>
                      {envelope.name} ({formatBalances(envelope.balances || {})})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              disabled={isSubmitting || !amount || !selectedCurrency || !destinationEnvelopeId || destinationOptions.length === 0 || availableCurrencies.length === 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Transferring...
                </>
              ) : (
                'Confirm Transfer'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TransferFundsForm;