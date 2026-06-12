// components/allowance/CombinedBalanceDisplay.tsx
import React, { useState, useCallback, useMemo } from 'react';
import { UnitDefinition, formatBalances } from '@/lib/currency-utils';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Loader2, ChevronsUpDown } from 'lucide-react';
// **** NEW: Import DropdownMenu components ****
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"; // Make sure this path is correct

import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from '../ui/scroll-area';

interface CombinedBalanceDisplayProps {
  totalBalances: { [currency: string]: number }; // Original balances
  displayCurrency?: string; // Target currency - Make optional if combined not shown
  combinedMonetaryValue?: number | null; // Final value in displayCurrency, null if calculation pending/failed - Make optional
  nonMonetaryBalances?: { [currency: string]: number }; // Separated non-monetary - Make optional
  tooltipLines?: string[]; // Pre-calculated breakdown lines - Make optional
  unitDefinitions: UnitDefinition[];
  onCurrencyChange?: (currencyCode: string) => void;
  className?: string;
  isLoading: boolean; // Loading state for rates/calculation
  allMonetaryCurrenciesInUse?: string[]; // All monetary codes used across app - Make optional
  // **** NEW PROP to control combined balance display ****
  showCombinedBalance?: boolean; // Defaults to true
}

const CombinedBalanceDisplay: React.FC<CombinedBalanceDisplayProps> = ({
  totalBalances,
  displayCurrency, // May be undefined if showCombinedBalance is false
  combinedMonetaryValue,
  nonMonetaryBalances, // May be undefined if showCombinedBalance is false
  tooltipLines, // May be undefined if showCombinedBalance is false
  unitDefinitions,
  onCurrencyChange,
  className,
  isLoading, // Represents loading state for combined calc OR just general data loading if combined is hidden
  allMonetaryCurrenciesInUse, // May be undefined if showCombinedBalance is false
  showCombinedBalance = true, // Default to true
}) => {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false); // For dropdown

  // Helper to check if a code is monetary
  const isMonetary = useCallback((code: string): boolean => {
    const unitDefMap = new Map(unitDefinitions.map(def => [def.code.toUpperCase(), def]));
    const definition = unitDefMap.get(code.toUpperCase());
    return definition?.isMonetary ?? (code.length === 3);
  }, [unitDefinitions]);

  // Prepare the list for the dropdown - filter and get details
  // Only compute if needed (combined balance is shown)
  const dropdownCurrencyOptions = useMemo(() => {
    if (!showCombinedBalance || !allMonetaryCurrenciesInUse) return []; // Don't compute if not shown or data missing
      const unitDefMap = new Map(unitDefinitions.map(def => [def.code.toUpperCase(), def]));
      return allMonetaryCurrenciesInUse
          .filter(code => isMonetary(code)) // Ensure it's monetary
          .map(code => {
              const def = unitDefMap.get(code.toUpperCase());
              return {
                  code: code,
                  // Display format: "USD ($)" or "NPR (रु)" or just "CODE" if no symbol
                  label: def?.symbol ? `${code} (${def.symbol})` : code,
              };
          })
          .sort((a, b) => a.code.localeCompare(b.code)); // Sort alphabetically
  }, [showCombinedBalance, allMonetaryCurrenciesInUse, unitDefinitions, isMonetary]); 

  const handleOriginalClick = (currencyCode: string) => {
     if (onCurrencyChange && isMonetary(currencyCode)) {
        onCurrencyChange(currencyCode);
     }
  };

  const handleDropdownSelect = (currencyCode: string) => {
    if (onCurrencyChange) {
          onCurrencyChange(currencyCode);
     }
    setIsCurrencyDropdownOpen(false); // Close dropdown after selection
  }

  // --- Format Output Strings ---
  const formattedCombinedMonetary = (!combinedMonetaryValue !== null && combinedMonetaryValue != undefined)
    ? formatBalances({ [displayCurrency]: combinedMonetaryValue }, unitDefinitions)
    : (showCombinedBalance && isLoading) ? "Calculating..." : null; // // Show calculating only if combined is relevant
    
  // Format non-monetary balances (could be shown even if combined is hidden)
  // If combinedMonetaryValue is the only thing loading, nonMonetaryBalances might still be available
  const derivedNonMonetaryBalances = nonMonetaryBalances ?? Object.fromEntries(
      Object.entries(totalBalances).filter(([code]) => !isMonetary(code))
  );
  const formattedNonMonetary = formatBalances(derivedNonMonetaryBalances, unitDefinitions);
  const hasMonetaryBalances = Object.keys(totalBalances).some(isMonetary);
  const hasNonMonetaryBalances = Object.keys(derivedNonMonetaryBalances).length > 0;

  // Determine current display currency details for the label (only if combined shown)
  const currentDisplayUnitDef = useMemo(() => {
      if (!showCombinedBalance || !displayCurrency) return null; // Don't compute if not needed
      const unitDefMap = new Map(unitDefinitions.map(def => [def.code.toUpperCase(), def]));
      return unitDefMap.get(displayCurrency.toUpperCase());
  }, [showCombinedBalance, displayCurrency, unitDefinitions]); 

  const displayCurrencyLabelPart = showCombinedBalance ? (currentDisplayUnitDef?.symbol
      ? `${currentDisplayUnitDef.symbol} ${displayCurrency}` // e.g., "$ USD"
    : displayCurrency) : null; // // Fallback to code

  // Check if displayCurrency exists in *this member's* balances (only relevant if combined shown)
  const displayCurrencyExistsForMember = showCombinedBalance && displayCurrency && totalBalances.hasOwnProperty(displayCurrency); 

  return (
    <div className={cn("space-y-1", className)}>
      <ScrollArea className="whitespace-nowrap rounded-md border">
        {/* Original Balances (Clickable, with adjusted highlighting) */}
        {/* Render this section regardless of showCombinedBalance */}
        <p className="font-medium">
            {Object.entries(totalBalances).map(([code, amount], index, arr) => {
                const monetary = isMonetary(code);
                // Highlight only if combined section is shown and it's the selected display currency
                const isHighlighted = showCombinedBalance && monetary && code === displayCurrency && displayCurrencyExistsForMember; 
                const isClickable = monetary && !!onCurrencyChange; // Clickable if monetary and handler exists
                const balanceStr = formatBalances({ [code]: amount }, unitDefinitions);
                
                return (
                  <React.Fragment key={code}>
                    {isClickable ? (
                      <button
                        onClick={() => handleOriginalClick(code)}
                        className={cn(
                          "hover:underline focus:underline focus:outline-none rounded py-0.5 transition-colors",
                          isHighlighted ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted" // Use isHighlighted flag
                          )}
                          title={showCombinedBalance ? `Show total in ${code}`: `Balance in ${code}`}
                          disabled={isLoading && showCombinedBalance} // Disable only if combined section is loading
                      >
                        {balanceStr}
                      </button>
                    ) : (
                      <span className="px-1 py-0.5">{balanceStr}</span>
                    )}
                    {index < arr.length - 1 && <span className="text-muted-foreground ml-0">, </span>}
                  </React.Fragment>
                );
            })}
            {Object.keys(totalBalances).length === 0 && <span className="text-muted-foreground italic">No funds available yet.</span>}
        </p>

        {/* Combined Balance Section (Conditionally Rendered) */}
        {showCombinedBalance && (hasMonetaryBalances || isLoading) && ( // Only show if prop is true AND monetary balances exist OR loading rates
            <div className="flex items-center space-x-1 text-sm "> {/* Reduced space-x */}
                  {/* **** UPDATED Label Structure **** */}
                  <span className="text-muted-foreground">Combined, in</span>
                  {/* Dropdown Trigger Button */}
                  <DropdownMenu open={isCurrencyDropdownOpen} onOpenChange={setIsCurrencyDropdownOpen}>
                      <DropdownMenuTrigger asChild>
                          <Button
                              variant="ghost"
                              size="sm" // Smaller size
                              className="m-0 pl-0.5 px-0 py-0.5 h-auto font-semibold hover:bg-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-ring" // Adjust padding/height
                              disabled={isLoading}
                              aria-label={`Change combined balance display currency, currently ${displayCurrencyLabelPart}`}
                          >
                              {displayCurrencyLabelPart}
                              <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                          </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                          {dropdownCurrencyOptions.map(option => (
                              <DropdownMenuItem
                                  key={option.code}
                                  onSelect={() => handleDropdownSelect(option.code)}
                                  className={cn(option.code === displayCurrency && "bg-accent")} // Highlight selected in dropdown
                              >
                                  {option.label}
                              </DropdownMenuItem>
                          ))}
                          {dropdownCurrencyOptions.length === 0 && <DropdownMenuItem disabled>No other currencies</DropdownMenuItem>}
                      </DropdownMenuContent>
                  </DropdownMenu>
                  <span className="text-muted-foreground">:</span>

                  {/* Value and Tooltip */}
                  {isLoading ? (
                      <span className="flex items-center space-x-1 font-semibold">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Calculating...</span>
                      </span>
                  ) : combinedMonetaryValue !== null ? (
                    <Popover open={isTooltipOpen} onOpenChange={setIsTooltipOpen}>
                        <PopoverTrigger asChild>
                            <button className="font-semibold hover:underline focus:underline focus:outline-none rounded py-0.5 hover:bg-muted">
                                {formattedCombinedMonetary}
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2 text-xs" align="start">
                            <ul className="space-y-0.5">
                              {(tooltipLines && tooltipLines.length > 0) 
                                ? tooltipLines.map((line, i) => <li key={i}>{line}</li>)
                                : <li>Breakdown unavailable.</li>
                              }
                          </ul>
                      </PopoverContent>
                  </Popover>
                  ) : (
                      <span className="font-semibold text-muted-foreground italic">Unavailable</span>
                  )}
                  {/* Add non-monetary part if exists and not loading */}
                  {hasNonMonetaryBalances && !isLoading && (
                      <>
                          <span className="text-muted-foreground ml-0">,</span>
                          <span className="font-semibold">{formattedNonMonetary}</span>
                      </>
                  )}
            </div>
        )}
        <ScrollBar orientation="horizontal" />
       </ScrollArea>
    </div>
  );
};

export default CombinedBalanceDisplay;