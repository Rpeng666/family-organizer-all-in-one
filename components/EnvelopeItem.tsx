// components/EnvelopeItem.tsx
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
// Import UnitDefinition type along with formatBalances
import { formatBalances, UnitDefinition, CachedExchangeRate, calculateEnvelopeProgress, GoalProgressResult  } from '@/lib/currency-utils';
import { Trash2, Edit, ArrowRightLeft, Target, Loader2  } from 'lucide-react';

// **** UPDATED Envelope interface to include goal fields ****
export interface Envelope {
  id: string;
  name: string;
  balances: { [currency: string]: number };
  isDefault?: boolean | null;
  // Add optional goal fields
  goalAmount?: number | null;
  goalCurrency?: string | null;
  // relationships (may not be populated depending on query)
  familyMember?: { id: string, name: string }[];
  transactions?: any[]; // Define more strictly if needed
  outgoingTransfers?: any[];
  incomingTransfers?: any[];
}

// Props for the EnvelopeItem component
interface EnvelopeItemProps {
  db: any; // Pass db instance for calculations if needed by utils
  envelope: Envelope;
  isLastEnvelope: boolean; // New prop to indicate if it's the only one
  // **** NEW: Add unitDefinitions prop ****
  unitDefinitions: UnitDefinition[];
  // **** NEW: Pass cached rates ****
  allCachedRates: CachedExchangeRate[];
  onEdit: (envelopeId: string) => void;
  onTransfer: (sourceEnvelopeId: string) => void;
  onDelete: (envelopeId: string) => void;
}

const EnvelopeItem: React.FC<EnvelopeItemProps> = ({
  db, // Destructure db
  envelope,
  isLastEnvelope,
  unitDefinitions,
  allCachedRates, // Destructure rates
  onEdit,
  onTransfer,
  onDelete,
}) => {
  // Delete button is disabled only if it's the last envelope
  const isDeletable = !isLastEnvelope;
  const hasGoal = !!(envelope.goalAmount && envelope.goalCurrency);

  // State for goal progress calculation result
  const [progress, setProgress] = useState<GoalProgressResult | null>(null);
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);

  // Effect to calculate progress when goal info or balances change
  useEffect(() => {
    if (hasGoal) {
      setIsLoadingProgress(true);
      calculateEnvelopeProgress(db, envelope, unitDefinitions, allCachedRates)
        .then(result => {
          setProgress(result);
        })
        .catch(error => {
          console.error(`Error calculating progress for envelope ${envelope.id}:`, error);
          setProgress({ totalValueInGoalCurrency: null, percentage: null, errors: ["Calculation failed."] }); // Set error state
        })
        .finally(() => {
          setIsLoadingProgress(false);
        });
    } else {
      setProgress(null); // Clear progress if no goal
    }
    // Dependencies: run when goal, balances, definitions, or rates change
  }, [db, envelope, unitDefinitions, allCachedRates, hasGoal]);


  return (
    <Card className="mb-4 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="pb-2 flex flex-row justify-between items-start">
        <div>
        <CardTitle className="text-lg font-semibold flex items-center">
          {envelope.name}
            {envelope.isDefault && (
            <span className="ml-2 text-xs font-normal text-muted-foreground bg-accent px-1.5 py-0.5 rounded">
              Default
            </span>
          )}
        </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pb-4 space-y-2"> {/* Add space-y for vertical spacing */}
        {/* Balance Display */}
        <p className="text-sm text-muted-foreground">
          Balance: <span className="font-medium text-foreground">
            {formatBalances(envelope.balances, unitDefinitions)}
          </span>
        </p>

        {/* Goal Display (Conditional) */}
        {hasGoal && (
          <div className="text-sm border-t pt-2 mt-2">
            <p className="text-muted-foreground flex items-center">
               <Target className="h-4 w-4 mr-1.5 shrink-0" />
               Goal: <span className="font-medium text-foreground ml-1">
                 {formatBalances({ [envelope.goalCurrency!]: envelope.goalAmount! }, unitDefinitions)}
               </span>
            </p>
             {isLoadingProgress ? (
                 <p className="text-xs text-muted-foreground flex items-center mt-1">
                     <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Calculating progress...
                 </p>
             ) : progress ? (
                 <>
                    <p className="text-xs text-muted-foreground mt-1">
                        Progress: <span className="font-medium text-foreground">
                            {progress.percentage !== null ? `${progress.percentage.toFixed(1)}%` : 'N/A'}
                        </span>
                        {progress.totalValueInGoalCurrency !== null && ` (${formatBalances({ [envelope.goalCurrency!]: progress.totalValueInGoalCurrency }, unitDefinitions)} of goal)`}
                     </p>
                     {progress.errors && progress.errors.length > 0 && (
                        <p className="text-xs text-destructive mt-1">
                             {progress.errors.join(' ')}
                        </p>
                     )}
                </>
             ) : null}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-end space-x-2">
        {/* Edit Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEdit(envelope.id)}
          aria-label={`Edit ${envelope.name} envelope`}
        >
          <Edit className="h-4 w-4 mr-1" /> Edit
        </Button>

        {/* Transfer Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onTransfer(envelope.id)}
          aria-label={`Transfer funds from ${envelope.name} envelope`}
        >
          <ArrowRightLeft className="h-4 w-4 mr-1" /> Transfer
        </Button>

        {/* Delete Button - Conditionally disabled */}
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onDelete(envelope.id)}
          disabled={!isDeletable} // Disable based on isLastEnvelope
          aria-label={`Delete ${envelope.name} envelope`}
        >
          <Trash2 className="h-4 w-4 mr-1" /> Delete
        </Button>
      </CardFooter>
    </Card>
  );
};

export default EnvelopeItem;