// components/allowance/AddEditEnvelopeForm.tsx
import React, { useState, useEffect, FormEvent, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import { id, tx } from '@instantdb/react';

// **** IMPORT UPDATED/RENAMED UTILITY FUNCTIONS ****
import { Envelope, UnitDefinition, createAdditionalEnvelope, updateEnvelope, setDefaultEnvelope } from '@/lib/currency-utils'; // Import InstantDB utilities

interface AddEditEnvelopeFormProps {
  db: any; // InstantDB instance
  isOpen: boolean;
  onClose: () => void;
  initialData?: Envelope | null; // Envelope data for editing
  memberId: string; // Needed for creating envelopes
  allMemberEnvelopes: Envelope[]; // Pass all envelopes for the member
  // **** UPDATED Props: Receive unitDefinitions and the computed list ****
  unitDefinitions: UnitDefinition[];
  allMonetaryCurrenciesInUse: string[];
}

const AddEditEnvelopeForm: React.FC<AddEditEnvelopeFormProps> = ({
  db,
  isOpen,
  onClose,
  initialData,
  memberId,
  allMemberEnvelopes,
  unitDefinitions,
  allMonetaryCurrenciesInUse, // Use this for dropdown options
}) => {
  const { toast } = useToast();
  const [envelopeName, setEnvelopeName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [goalAmount, setGoalAmount] = useState<string>('');
  const [goalCurrency, setGoalCurrency] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!initialData;

  // Create a map for quick lookup of unit definition details (like symbols)
  const unitDefMap = useMemo(() => {
    return new Map(unitDefinitions.map(def => [def.code.toUpperCase(), def]));
  }, [unitDefinitions]);

    // Prepare options for the goal currency dropdown using the computed list
    const goalCurrencyOptions = useMemo(() => {
      return allMonetaryCurrenciesInUse.map(code => {
          const def = unitDefMap.get(code);
          const label = def?.symbol ? `${code} (${def.symbol})` : (def?.name ? `${code} (${def.name})` : code);
          return { value: code, label: label };
      });
      // No need to sort here if allMonetaryCurrenciesInUse is already sorted
  }, [allMonetaryCurrenciesInUse, unitDefMap]);

  // Populate form when initialData changes (for edit mode)
  useEffect(() => {
    if (isOpen) {
      if (isEditMode && initialData) {
        setEnvelopeName(initialData.name);
        // **** Initialize switch based on initial data ****
        setIsDefault(initialData.isDefault ?? false);
        // **** Populate goal fields ****
        setGoalAmount(initialData.goalAmount ? String(initialData.goalAmount) : '');
        setGoalCurrency(initialData.goalCurrency ?? undefined);
      } else {
        setEnvelopeName('');
        // **** Reset switch for add mode (default is false) ****
        setIsDefault(false);
        // **** Reset goal fields ****
        setGoalAmount('');
        setGoalCurrency(undefined);
      }
      setIsSubmitting(false);
    }
  }, [initialData, isEditMode, isOpen]); // Reset when modal opens/closes or data changes


  // **** NEW Effect: Clear currency if amount is cleared ****
  useEffect(() => {
      // If the goal amount input is empty, automatically unset the currency
      if (goalAmount.trim() === '') {
          setGoalCurrency(undefined);
      }
  }, [goalAmount]); // Re-run only when goalAmount changes


  const handleDefaultChange = (checked: boolean) => {
    // Check if trying to turn OFF the switch WHILE editing an ALREADY default envelope
    if (isEditMode && initialData?.isDefault && !checked) {
        // Prevent the change and show a toast
        toast({
            title: "Action Needed",
            description: "To change the default, please edit a different envelope and make *it* the default.",
            variant: "default", // Or choose another appropriate variant
        });
        // Do NOT update the state, keep the switch visually ON
    } else {
        // Otherwise, allow the state change
        setIsDefault(checked);
    }
  };
  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); // Prevent page reload
    const trimmedName = envelopeName.trim();
    const parsedGoalAmount = goalAmount.trim() ? parseFloat(goalAmount) : null;

    // --- Validation ---
    if (!trimmedName) {
      toast({
        title: "Validation Error",
        description: "Envelope name cannot be empty.",
        variant: "destructive",
      });
      return;
    }
    if (parsedGoalAmount !== null && isNaN(parsedGoalAmount)) {
      toast({ title: "Validation Error", description: "Goal amount must be a valid number.", variant: "destructive" });
      return;
    }
    if (parsedGoalAmount !== null && parsedGoalAmount <= 0) {
      toast({ title: "Validation Error", description: "Goal amount must be positive if set.", variant: "destructive" });
      return;
    }
    if (parsedGoalAmount !== null && !goalCurrency) {
       toast({ title: "Validation Error", description: "Please select a goal currency when setting an amount.", variant: "destructive" });
       return;
    }
    // **** Updated check: Allow saving if amount is empty (parsedGoalAmount is null) even if currency *was* set ****
    // The useEffect above handles clearing goalCurrency state if amount is empty.
    // The previous validation `if (!parsedGoalAmount && goalCurrency)` is no longer needed because
    // if `!parsedGoalAmount` is true, the `useEffect` should have already set `goalCurrency` to `undefined`.

    if (isEditMode && initialData?.isDefault && !isDefault && allMemberEnvelopes.length <= 1) {
         toast({
             title: "Action Denied",
             description: "Cannot remove default status from the only envelope.",
             variant: "destructive",
         });
         return;
     }

    setIsSubmitting(true);

    try {
      // **** Pass null if the value is cleared ****
      const finalGoalAmount = parsedGoalAmount; // parsedGoalAmount will be null if input was empty
      const finalGoalCurrency = parsedGoalAmount === null ? null : goalCurrency; // Send null if amount is null

      if (isEditMode && initialData) {
        // --- UPDATE ---
        const originalIsDefault = initialData.isDefault ?? false;
        await updateEnvelope(db, initialData.id, trimmedName, isDefault, finalGoalAmount, finalGoalCurrency); // pass goal info
        toast({
          title: "Success",
          description: `Envelope '${trimmedName}' updated.`,
        });
        // If the default status was CHECKED during edit AND it wasn't default before
        if (isDefault && !originalIsDefault) {
           await setDefaultEnvelope(db, allMemberEnvelopes, initialData.id);
        }
      } else {
        // --- CREATE ---
        const newEnvelopeId = await createAdditionalEnvelope(db, memberId, trimmedName, isDefault, finalGoalAmount, finalGoalCurrency); // Pass goal info
        toast({
          title: "Success",
          description: `Envelope '${trimmedName}' created.`,
        });
         // If the default status was CHECKED during creation
        if (isDefault) {
            // Fetch the *updated* list of envelopes AFTER creation before setting default
            // This is tricky as the component's state `allMemberEnvelopes` might be stale.
            // It's safer if `setDefaultEnvelope` fetches fresh data, or we pass the newly created envelope info.
            // For now, assume `setDefaultEnvelope` can handle it, or requires a refresh/refetch mechanism in parent.
            // A simpler approach might be needed if atomicity across calls is strict.
            // Let's pass the current list + the new one conceptually
            const newEnvelopePlaceholder = { id: newEnvelopeId, name: trimmedName, balances: {}, isDefault: true };
            await setDefaultEnvelope(db, [...allMemberEnvelopes, newEnvelopePlaceholder], newEnvelopeId);
        }
      }
      onClose(); // Close modal on success
    } catch (err: any) {
      console.error("Failed to save envelope:", err);
      toast({
        title: "Error",
        description: err.message || "Could not save envelope.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Use Dialog's controlled state
  if (!isOpen) {
    return null;
  }

  return (
    // **** Increase Modal Width ****
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      {/* Increased width slightly */}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Envelope' : 'Add New Envelope'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
           {/* Using grid with slightly wider label column */}
          <div className="grid grid-cols-[140px_1fr] items-center gap-x-4 gap-y-6 py-4"> {/* Increased gap-y */}

            {/* -- Row 1: Name -- */}
            <Label htmlFor="envelope-name" className="text-right">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="envelope-name"
              value={envelopeName}
              onChange={(e) => setEnvelopeName(e.target.value)}
              placeholder="e.g., Spending Money"
              required
              disabled={isSubmitting}
            />

            {/* -- Row 2: Make Default -- */}
            {/* Label now contains the helper text and spans the first column */}
            <Label htmlFor="make-default" className="text-right flex flex-col items-end"> {/* Align items end for right align */}
                <span>Make Default</span>
                 <span className="font-normal leading-snug text-muted-foreground text-xs mt-1"> {/* Added margin-top */}
                     Default for deposits/transfers.
                 </span>
            </Label>
            {/* Switch stays in the second column */}
            <div className="flex items-center"> {/* Keeps switch vertically centered */}
                <Switch
                    id="make-default"
                    checked={isDefault}
                    // Use the new handler function
                    onCheckedChange={handleDefaultChange}
                    // Keep disable logic for the only envelope case (visual cue)
                    disabled={isSubmitting || (isEditMode && initialData?.isDefault && allMemberEnvelopes.length <= 1)}
                    aria-label="Make this the default envelope"
                />
            </div>

             {/* -- Row 3: Goal Amount -- */}
             <Label htmlFor="goal-amount" className="text-right">
                Savings Goal (Optional)
             </Label>
              <Input
                  id="goal-amount"
                  type="number"
                  value={goalAmount}
                  // **** Use direct state update ****
                  onChange={(e) => setGoalAmount(e.target.value)}
                  placeholder="e.g., 500.00"
                  step="0.01"
                  // Allow empty string, min="0" prevents negative visually
                  min="0"
                  disabled={isSubmitting}
              />

               {/* -- Row 4: Goal Currency -- */}
               <Label htmlFor="goal-currency" className="text-right">
                  Goal Currency
                </Label>
                <Select
                     value={goalCurrency} // Reflects state, which is cleared by effect if amount is empty
                    onValueChange={setGoalCurrency}
                    // **** Disable if amount is empty OR submitting ****
                    disabled={isSubmitting || !goalAmount.trim()}
                    name="goal-currency"
                 >
                    <SelectTrigger>
                        {/* **** Adjust placeholder based on whether amount is set **** */}
                        <SelectValue placeholder={!goalAmount.trim() ? "Set amount first" : "Select currency..."} />
                    </SelectTrigger>
                    <SelectContent>
                        {/* **** Map over goalCurrencyOptions **** */}
                        {goalCurrencyOptions.map(option => (
                           <SelectItem key={option.value} value={option.value}>
                              {option.label} {/* Display computed label with symbol/name */}
                            </SelectItem>
                        ))}
                    {goalCurrencyOptions.length === 0 && <SelectItem value="none" disabled>No monetary currencies available</SelectItem>}
                    </SelectContent>
                 </Select>

          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting || !envelopeName.trim()}>
              {isSubmitting ? (
                <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {isEditMode ? 'Saving...' : 'Creating...'} </>
              ) : ( isEditMode ? 'Save Changes' : 'Create Envelope' )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddEditEnvelopeForm;