// filename: components/CurrencySelector.tsx
import React, { useState, useRef } from 'react'; // Removed useEffect, will try focus in onOpenAutoFocus
import { Button } from '@/components/ui/button';

// For now, assuming they are not strictly needed by CurrencySelector's direct JSX:
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import DefineUnitForm from '@/components/allowance/DefineUnitForm'; // Import DefineUnitForm

interface CurrencyOption {
    value: string;
    label: string;
}

interface CurrencySelectorProps {
    db: any; // InstantDB instance
    value: string | null | undefined; // Currently selected currency code
    onChange: (value: string) => void; // Callback to update parent state
    currencyOptions: CurrencyOption[]; // Array of { value, label } options, including '__DEFINE_NEW__'
    unitDefinitions: any[]; // Pass unit definitions if needed by DefineUnitForm or future enhancements
    disabled?: boolean;
    placeholder?: string;
}

const CurrencySelector: React.FC<CurrencySelectorProps> = ({
    db,
    value,
    onChange,
    currencyOptions,
    unitDefinitions, // Keep this prop, might be needed later or by DefineUnitForm implicitly
    disabled = false,
    placeholder = 'Select or type unit...',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchInput, setSearchInput] = useState('');
    const [isDefineUnitModalOpen, setIsDefineUnitModalOpen] = useState(false);
    const itemSelectedRef = useRef(false); // Track if selection was made from list
    const commandInputRef = useRef<HTMLInputElement>(null); // Create a ref for the CommandInput

    const handleSelect = (currentValue: string) => {
        itemSelectedRef.current = true;
        if (currentValue === '__DEFINE_NEW__') {
            setIsDefineUnitModalOpen(true);
        } else {
            const finalValue = currentValue.toUpperCase();
            onChange(finalValue); // Update parent state
            setSearchInput(finalValue); // Sync search input visually
        }
        setIsOpen(false); // Close popover
    };

    const handleUnitDefined = (newCode: string) => {
        setIsDefineUnitModalOpen(false);
        onChange(newCode); // Update parent state with the new code
        setSearchInput(newCode); // Sync search input visually
    };

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open);
        if (open) {
            // Clear search input when opening
            setSearchInput('');
            itemSelectedRef.current = false;
        } else if (!itemSelectedRef.current) {
            // Handle typed value on close if no item was selected
            const typedValue = searchInput.trim().toUpperCase();
            // Basic validation: non-empty, not the special value, maybe check against options?
            const isKnownOption = currencyOptions.some((opt) => opt.value === typedValue);
            // You might want more robust validation based on unitDefinitions or a regex
            const isValidCode = /^[A-Z0-9_\-]{1,10}$/.test(typedValue); // Example regex

            if (typedValue && typedValue !== '__DEFINE_NEW__' && (isKnownOption || isValidCode)) {
                console.log('Using typed value:', typedValue);
                onChange(typedValue);
            }
            // Else: maybe revert to previous value or do nothing
        }
    };

    const displayLabel = value && value !== '__DEFINE_NEW__' ? currencyOptions.find((opt) => opt.value === value)?.label ?? value : placeholder;

    return (
        <>
            {/* Pass modal={true} to the Popover root */}
            <Popover open={isOpen} onOpenChange={handleOpenChange} modal>
                <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={isOpen} className="w-full justify-between font-normal" disabled={disabled}>
                        {displayLabel}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] max-h-[--radix-popover-content-available-height] p-0">
                    <Command>
                        <CommandInput
                            ref={commandInputRef} // Assign the ref here
                            placeholder="Type or select..."
                            value={searchInput}
                            onValueChange={setSearchInput}
                            disabled={disabled}
                        />
                        <CommandList>
                            <CommandEmpty>No unit found.</CommandEmpty>
                            <CommandGroup>
                                {currencyOptions.map((option) => (
                                    <CommandItem
                                        key={option.value}
                                        value={option.value}
                                        onSelect={handleSelect}
                                        className={option.value === '__DEFINE_NEW__' ? 'italic text-primary' : ''}
                                    >
                                        <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                                        {option.label}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>

            {/* Define Unit Modal */}
            <DefineUnitForm db={db} isOpen={isDefineUnitModalOpen} onClose={() => setIsDefineUnitModalOpen(false)} onUnitDefined={handleUnitDefined} />
        </>
    );
};

export default CurrencySelector;
