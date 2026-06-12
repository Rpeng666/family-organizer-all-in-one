// components/allowance/DefineUnitForm.tsx
import React, { useState, useEffect, FormEvent } from 'react';
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

// Assuming UnitDefinition type is available or redefine here based on schema
// import { UnitDefinition } from '@/lib/currency-utils';

interface DefineUnitFormProps {
  db: any; // InstantDB instance
  isOpen: boolean;
  onClose: () => void;
  // Callback to notify parent when a unit is successfully defined
  onUnitDefined: (newCode: string) => void;
}

const DefineUnitForm: React.FC<DefineUnitFormProps> = ({
  db,
  isOpen,
  onClose,
  onUnitDefined,
}) => {
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [isMonetary, setIsMonetary] = useState(false);
  const [placement, setPlacement] = useState<'before' | 'after' | undefined>(undefined);
  const [useSpace, setUseSpace] = useState<boolean | undefined>(undefined); // Using undefined for 'default'
  const [decimals, setDecimals] = useState<string>(''); // Store as string for input, allow 'auto'
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setCode('');
      setName('');
      setSymbol('');
      setIsMonetary(false);
      setPlacement(undefined);
      setUseSpace(undefined);
      setDecimals(''); // Reset to empty or default like 'auto'
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();
    const trimmedSymbol = symbol.trim();

    // --- Basic Validation ---
    if (!trimmedCode || !trimmedName) {
      toast({ title: "Validation Error", description: "Code and Name are required.", variant: "destructive" });
      return;
    }
    // Potentially add validation for code format (e.g., 3 chars if desired, though spec allows flexibility)

    let decimalPlacesValue: number | null = null;
    if (decimals.trim().toLowerCase() === 'auto' || decimals.trim() === '') {
        decimalPlacesValue = null; // Represent 'auto' or 'default' as null in the DB
    } else {
        const parsedDecimals = parseInt(decimals, 10);
        if (isNaN(parsedDecimals) || parsedDecimals < 0) {
             toast({ title: "Validation Error", description: "Decimal Places must be 'auto' or a non-negative number.", variant: "destructive" });
             return;
        }
        decimalPlacesValue = parsedDecimals;
    }

    // Use provided values or null for optional fields if not set
    const definitionData = {
        code: trimmedCode,
        name: trimmedName,
        symbol: trimmedSymbol, // Allow empty symbol? Or require it? Assume optional for now.
        isMonetary: isMonetary,
        symbolPlacement: placement || null,
        symbolSpacing: useSpace === undefined ? null : useSpace, // Store undefined as null
        decimalPlaces: decimalPlacesValue,
    };

    setIsSubmitting(true);

    try {
      // TODO: Add check if code already exists in unitDefinitions before creating?

      const newId = id();
      await db.transact([
        tx.unitDefinitions[newId].update(definitionData)
      ]);

      toast({
        title: "Success",
        description: `Unit '${trimmedName}' (${trimmedCode}) defined.`,
      });
      onUnitDefined(trimmedCode); // Notify parent with the new code
      onClose(); // Close modal on success
    } catch (err: any) {
      console.error("Failed to define unit:", err);
      toast({
        title: "Error",
        description: err.message || "Could not define unit.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    // Increase modal width using sm:max-w-lg or sm:max-w-xl
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg"> {/* <-- Increased width */}
        <DialogHeader>
          <DialogTitle>Define New Currency/Unit</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          {/* Use spacing utilities (space-y-4) instead of grid for overall layout */}
          <div className="space-y-4 py-4">

            {/* Code (Label above Input) */}
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="unit-code">Code*</Label>
              <Input
                id="unit-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g., STARS (unique)"
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Name (Label above Input) */}
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="unit-name">Name*</Label>
              <Input
                id="unit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Star Points"
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Symbol (Label above Input) */}
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="unit-symbol">Symbol</Label>
              <Input
                id="unit-symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="e.g., ⭐, Pts, Min (optional)"
                disabled={isSubmitting}
              />
            </div>

             {/* Is Monetary? (Flex layout for label and switch) */}
             <div className="flex items-center justify-between space-x-2 pt-2">
                <Label htmlFor="unit-ismonetary" className="flex flex-col space-y-1">
                    <span>Is Monetary?</span>
                    <span className="font-normal leading-snug text-muted-foreground">
                        Is this regular money (USD, EUR) or a point/custom unit?
                    </span>
                 </Label>
                 <Switch
                    id="unit-ismonetary"
                    checked={isMonetary}
                    onCheckedChange={setIsMonetary}
                    disabled={isSubmitting}
                />
             </div>

            {/* --- Formatting Options Section --- */}
            <div className="space-y-4 pt-4 border-t">
                <h4 className="text-sm font-medium text-muted-foreground">Formatting (Optional Defaults)</h4>

                {/* Symbol Placement */}
                <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="unit-placement">Symbol Placement</Label>
                    <Select
                        value={placement}
                        onValueChange={(value: 'before' | 'after') => setPlacement(value)}
                        disabled={isSubmitting}
                        name="unit-placement" // Add name for accessibility/forms if needed
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Default" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="before">Before Amount (e.g., $10)</SelectItem>
                            <SelectItem value="after">After Amount (e.g., 10 Pts)</SelectItem>
                        </SelectContent>
                    </Select>
                     <p className="text-xs text-muted-foreground">Default: Before for monetary, After for non-monetary.</p>
                </div>

                {/* Symbol Spacing */}
                <div className="flex items-center justify-between space-x-2">
                    <Label htmlFor="unit-spacing" className="flex flex-col space-y-1">
                        <span>Space Between Symbol & Amount?</span>
                         <span className="font-normal leading-snug text-muted-foreground">
                            (Default: No space if symbol before, Space if symbol after)
                         </span>
                    </Label>
                    <Switch
                        id="unit-spacing"
                        checked={useSpace === undefined ? false : useSpace} // Provide a controlled default visually
                        onCheckedChange={setUseSpace}
                        disabled={isSubmitting}
                    />
                </div>


                {/* Decimal Places */}
                <div className="grid w-full items-center gap-1.5">
                  <Label htmlFor="unit-decimals">Decimal Places</Label>
                  <Input
                    id="unit-decimals"
                    value={decimals}
                    onChange={(e) => setDecimals(e.target.value)}
                    placeholder="e.g., 0, 2, or 'auto'"
                    disabled={isSubmitting}
                  />
                   <p className="text-xs text-muted-foreground">Default: 2 for monetary, 0 for non-monetary. 'auto' uses decimals only if needed.</p>
                </div>
            </div>

          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting || !code.trim() || !name.trim()}>
              {isSubmitting ? (
                <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving... </>
              ) : ( 'Save Definition' )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DefineUnitForm;