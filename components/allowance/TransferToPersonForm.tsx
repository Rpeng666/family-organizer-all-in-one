// components/allowance/TransferToPersonForm.tsx
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

// Minimal Family Member type needed for props
interface BasicFamilyMember {
    id: string;
    name: string;
    // Include other fields if needed for display/logic
}

interface TransferToPersonFormProps {
  db: any;
  isOpen: boolean;
  onClose: () => void;
  // Callback passes necessary info for parent to find dest envelope & call utility
  onSubmit: (
      sourceEnvelopeId: string,
      destinationDefaultEnvelope: Envelope,
      amount: number,
      currency: string,
      description?: string
    ) => Promise<void>;
  sourceMemberId: string; // ID of the person initiating transfer
  allFamilyMembers: BasicFamilyMember[]; // All members to select destination
  sourceMemberEnvelopes: Envelope[]; // Source member's envelopes
  unitDefinitions: UnitDefinition[];
}

const TransferToPersonForm: React.FC<TransferToPersonFormProps> = ({
  db,
  isOpen,
  onClose,
  onSubmit,
  sourceMemberId,
  allFamilyMembers,
  sourceMemberEnvelopes,
  unitDefinitions,
}) => {
  const { toast } = useToast();
  // Form State
  const [destinationMemberId, setDestinationMemberId] = useState<string | undefined>(undefined);
  const [sourceEnvelopeId, setSourceEnvelopeId] = useState<string | undefined>(undefined);
  const [selectedCurrency, setSelectedCurrency] = useState<string | undefined>(undefined);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // **** NEW: State to hold fetched destination envelope ****
  const [destinationDefaultEnvelope, setDestinationDefaultEnvelope] = useState<Envelope | null>(null);

  // **** Query for the member and ALL their envelopes ****
  const { isLoading: isLoadingMemberData, error: errorMemberData, data: memberData } = db.useQuery({
    familyMembers: {
        $: { where: { id: destinationMemberId! } },
        allowanceEnvelopes: {} // Get linked envelopes (all fields)
    }
}, { enabled: !!destinationMemberId && isOpen });

// **** Effect to FIND the default envelope from the results ****
useEffect(() => {
    setDestinationDefaultEnvelope(null); // Reset on id change before data arrives
    if (!isLoadingMemberData && memberData?.familyMembers?.[0]?.allowanceEnvelopes) {
        const envelopes = memberData.familyMembers[0].allowanceEnvelopes;
        // Find the default envelope using standard JS array find
        const defaultEnvelope = envelopes.find((env: any) => env.isDefault === true); // Use 'any' if Envelope type isn't perfectly matching raw data
        setDestinationDefaultEnvelope(defaultEnvelope || null);
        if (!defaultEnvelope && envelopes.length > 0) {
          toast({ title: "Error", description: "Recipient has envelopes, but none marked as default.", variant: "destructive" });
           // Consider adding a toast warning here?
        }
    }
}, [isLoadingMemberData, memberData, destinationMemberId]); // Rerun when data or ID changes

// Derived Data
  const destinationOptions = useMemo(() => {
    return allFamilyMembers.filter(member => member.id !== sourceMemberId);
  }, [allFamilyMembers, sourceMemberId]);

  const selectedSourceEnvelope = useMemo(() => {
    return sourceMemberEnvelopes.find(e => e.id === sourceEnvelopeId);
  }, [sourceEnvelopeId, sourceMemberEnvelopes]);

  const availableCurrencies = useMemo(() => {
    if (!selectedSourceEnvelope || !selectedSourceEnvelope.balances) return [];
    return Object.entries(selectedSourceEnvelope.balances)
      .filter(([_, balance]) => balance > 0)
      .map(([currency]) => currency);
  }, [selectedSourceEnvelope]);

   const sourceCurrencyBalance = useMemo(() => {
      if (!selectedSourceEnvelope || !selectedCurrency || !selectedSourceEnvelope.balances) return 0;
      return selectedSourceEnvelope.balances[selectedCurrency] ?? 0;
  }, [selectedSourceEnvelope, selectedCurrency]);


  // Effects to reset dependent fields
  useEffect(() => {
    // Reset currency/amount/desc if source envelope changes
    setSelectedCurrency(undefined);
    setAmount('');
    setDescription('');
  }, [sourceEnvelopeId]);

  useEffect(() => {
    // Reset source envelope/currency/amount/desc if destination member changes
    setSourceEnvelopeId(undefined);
    setSelectedCurrency(undefined);
    setAmount('');
    setDescription('');
  }, [destinationMemberId]);

  // Reset form completely when modal opens
  useEffect(() => {
    if (isOpen) {
      setDestinationMemberId(undefined);
      setSourceEnvelopeId(undefined);
      setSelectedCurrency(undefined);
      setAmount('');
      setDescription('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Reset currency if it becomes unavailable
  useEffect(() => {
    if (selectedCurrency && !availableCurrencies.includes(selectedCurrency)) {
      setSelectedCurrency(undefined);
    }
  }, [availableCurrencies, selectedCurrency]);

  // --- Submit Handler ---
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const transferAmount = parseFloat(amount);
    const trimmedDescription = description.trim();

    // --- Validation ---
    if (!destinationMemberId || !sourceEnvelopeId || !selectedCurrency || isNaN(transferAmount) || transferAmount <= 0) {
        toast({ title: "Validation Error", description: "Please fill all fields with valid values.", variant: "destructive" });
        return;
    }
    // **** NEW: Check if destination envelope is loaded ****
    if (isLoadingMemberData) {
        toast({ title: "Please wait", description: "Loading recipient details...", variant: "default" });
        return;
    }
    if (errorMemberData || !memberData?.familyMembers?.[0]) {
      toast({ title: "Error", description: "Could not load recipient data.", variant: "destructive" });
      return;
   }
   if (!destinationDefaultEnvelope) {
       toast({ title: "Transfer Failed", description: "Could not find a default envelope for the recipient. Please ensure they have one set up.", variant: "destructive" });
       return;
   }
    if (transferAmount > sourceCurrencyBalance) {
         toast({
            title: "Validation Error",
            description: `Insufficient funds. Available: ${formatBalances({[selectedCurrency]: sourceCurrencyBalance}, unitDefinitions)}.`,
            variant: "destructive",
         });
         return;
    }
    // --- End Validation ---

    setIsSubmitting(true);
    try { // Call parent onSubmit, passing the necessary IDs and values
        await onSubmit(sourceEnvelopeId!, destinationDefaultEnvelope, transferAmount, selectedCurrency!, description.trim());
    
    } catch (err: any) { // Parent should handle success toast & closing
        console.error("Transfer to person failed in form:", err);
        // Parent should handle error toast
    } finally {
        setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const canTransfer = sourceMemberEnvelopes && sourceMemberEnvelopes.length > 0 && destinationOptions && destinationOptions.length > 0;

  // --- Update Submit Button Disabled Logic ---
  const isSubmitDisabled = isSubmitting ||
                           !destinationMemberId ||
                           !sourceEnvelopeId ||
                           !selectedCurrency ||
                           !amount ||
                           parseFloat(amount) <= 0 ||
                           isLoadingMemberData || // Disable while loading dest envelope
                           !destinationDefaultEnvelope || // Disable if dest envelope not found
                           parseFloat(amount) > sourceCurrencyBalance;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg"> {/* Wider modal */}
        <DialogHeader>
          <DialogTitle>Transfer Funds to Family Member</DialogTitle>
        </DialogHeader>
        {!canTransfer ? (
            <p className="py-4 text-muted-foreground">
                {!destinationOptions || destinationOptions.length === 0
                 ? "No other family members available to transfer to."
                 : "You need at least one envelope with funds to initiate a transfer."}
             </p>
        ) : (
            <form onSubmit={handleSubmit}>
            {/* Use space-y-4 for vertical spacing */}
            <div className="space-y-4 py-4">
                {/* Destination Member */}
                 <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="dest-member">To Family Member</Label>
                    <Select value={destinationMemberId} onValueChange={setDestinationMemberId} required disabled={isSubmitting} name="dest-member">
                        <SelectTrigger>
                            <SelectValue placeholder="Select recipient..." />
                        </SelectTrigger>
                        <SelectContent>
                            {destinationOptions.map(member => (
                                <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Source Envelope */}
                <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="source-envelope">From Your Envelope</Label>
                    <Select value={sourceEnvelopeId} onValueChange={setSourceEnvelopeId} required disabled={isSubmitting || !destinationMemberId} name="source-envelope">
                        <SelectTrigger>
                            <SelectValue placeholder={!destinationMemberId ? "Select recipient first" : "Select source envelope..."} />
                        </SelectTrigger>
                        <SelectContent>
                            {sourceMemberEnvelopes.map(envelope => (
                                <SelectItem key={envelope.id} value={envelope.id}>
                                     {envelope.name} ({formatBalances(envelope.balances || {}, unitDefinitions)})
                                 </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                 {/* Currency */}
                <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="transfer-currency">Currency/Unit</Label>
                    <Select value={selectedCurrency} onValueChange={setSelectedCurrency} required disabled={isSubmitting || !sourceEnvelopeId || availableCurrencies.length === 0} name="transfer-currency">
                        <SelectTrigger>
                            <SelectValue placeholder={!sourceEnvelopeId ? "Select source envelope first" : availableCurrencies.length === 0 ? "No funds in source" : "Select currency..."} />
                        </SelectTrigger>
                        <SelectContent>
                             {availableCurrencies.map(currency => (
                                <SelectItem key={currency} value={currency}>
                                    {currency} ({formatBalances({[currency]: selectedSourceEnvelope?.balances?.[currency] ?? 0}, unitDefinitions)})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Amount */}
                <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="transfer-amount">Amount</Label>
                    <Input id="transfer-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required disabled={isSubmitting || !selectedCurrency} min="0.01" max={sourceCurrencyBalance > 0 ? String(sourceCurrencyBalance) : undefined} step="0.01" placeholder="e.g., 10.00" />
                </div>

                {/* Description */}
                <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="transfer-description">Description (Optional)</Label>
                    <Input id="transfer-description" type="text" value={description} onChange={(e) => setDescription(e.target.value)} disabled={isSubmitting} placeholder="e.g., For movie ticket" />
                </div>

            </div>
            {isLoadingMemberData && <p>Loading recipient details...</p>}
            {/* Add a message if loading or if default isn't found after loading */}
            {!isLoadingMemberData && destinationMemberId && !destinationDefaultEnvelope && memberData?.familyMembers?.[0] &&
              <p className="text-orange-600 text-sm py-2">Warning: Recipient does not have a default envelope set.</p>
            }
            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}> Cancel </Button>
                </DialogClose>
                <Button type="submit" disabled={isSubmitDisabled}>
                    {isSubmitting ? ( <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Transferring... </> ) : ( 'Confirm Transfer' )}
                </Button>
            </DialogFooter>
            </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TransferToPersonForm;