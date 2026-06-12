import React, { useState, useEffect, useRef } from 'react'; // Import useRef
import { RRule, Frequency, Weekday, ByWeekday } from 'rrule'; // Keep ByWeekday
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox'; // Use Checkbox for Weekly and Monthly
import { Button } from "@/components/ui/button";

type DayOfWeekString = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

// Mapping from DayOfWeek string literal to RRule Weekday constant
const dayOfWeekMap: Record<DayOfWeekString, Weekday> = {
    MO: RRule.MO as unknown as Weekday,
    TU: RRule.TU as unknown as Weekday,
    WE: RRule.WE as unknown as Weekday,
    TH: RRule.TH as unknown as Weekday,
    FR: RRule.FR as unknown as Weekday,
    SA: RRule.SA as unknown as Weekday,
    SU: RRule.SU as unknown as Weekday,
};
// Use this array for rendering checkboxes
const daysOfWeekCheckboxes: { value: DayOfWeekString; label: string }[] = [
    { value: 'MO', label: 'Mon' },
    { value: 'TU', label: 'Tue' },
    { value: 'WE', label: 'Wed' },
    { value: 'TH', label: 'Thu' },
    { value: 'FR', label: 'Fri' },
    { value: 'SA', label: 'Sat' },
    { value: 'SU', label: 'Sun' },
];
type FrequencyType = 'once' | 'daily' | 'weekly' | 'monthly';

interface RecurrenceRuleFormProps {
  onSave: (rule: { freq: Frequency } & Partial<Omit<RRule.Options, 'freq'>> | null) => void;
  initialOptions?: ({ freq: Frequency } & Partial<Omit<RRule.Options, 'freq'>>) | null;
}

const frequencyMap: Record<FrequencyType, Frequency | null> = {
  once: null,
  daily: Frequency.DAILY,
  weekly: Frequency.WEEKLY,
  monthly: Frequency.MONTHLY,
};
const freqMapReverse: { [key in Frequency]?: FrequencyType } = {
  [Frequency.DAILY]: 'daily',
  [Frequency.WEEKLY]: 'weekly',
  [Frequency.MONTHLY]: 'monthly',
};


const RecurrenceRuleForm: React.FC<RecurrenceRuleFormProps> = ({ onSave, initialOptions }) => {
  // Initialize state using useState initializers
  const [frequency, setFrequency] = useState<FrequencyType>(() => {
        // If initialOptions exist and have a valid freq, map it back, otherwise default to 'once'
        return (initialOptions && initialOptions.freq !== undefined && freqMapReverse[initialOptions.freq])
            ? freqMapReverse[initialOptions.freq]!
      : 'once'; 
  });
  const [interval, setInterval] = useState(() => initialOptions?.interval || 1);

    // *** REVERTED: State for MULTIPLE weekly day selection ***
    const [weeklyDays, setWeeklyDays] = useState<DayOfWeekString[]>(() => {
         if (initialOptions?.freq === Frequency.WEEKLY && initialOptions.byweekday) {
             // Extract the *first* day if it exists (allowance should only have one)
             const weekdays = Array.isArray(initialOptions.byweekday) ? initialOptions.byweekday : [initialOptions.byweekday];
            return weekdays
                .map((weekday) => {
                    if (weekday instanceof Weekday) {
                        return weekday.toString() as DayOfWeekString; // e.g., "MO"
                    } else if (typeof weekday === 'number') {
                        const dayCodes: DayOfWeekString[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
                        return dayCodes[weekday] ?? undefined;
         }
                    return undefined;
                })
                .filter((d): d is DayOfWeekString => d !== undefined); // Ensure correct type and filter out undefined
        }
        return [];
  });

  const [monthlyDays, setMonthlyDays] = useState<number[]>(() => {
    if (initialOptions?.bymonthday) {
      return Array.isArray(initialOptions.bymonthday)
        ? initialOptions.bymonthday
        : [initialOptions.bymonthday];
    }
    return [];
  });

  // Ref to track if the initial save (on mount without initialOptions) has happened
  const initialSaveDoneRef = useRef(false);

  // Handle saving the recurrence rule
  const handleSave = () => {
    if (frequency === 'once') {
            onSave(null);
            return;
        }

        const freqValue = frequencyMap[frequency];
        if (freqValue === null) {
      onSave(null);
      return;
    }

    const rruleOptions: { freq: Frequency } & Partial<Omit<RRule.Options, 'freq'>> = {
            freq: freqValue,
            interval: interval > 0 ? interval : 1,
    };

        // *** REVERTED: Handle multiple weekly days ***
        if (frequency === 'weekly' && weeklyDays.length > 0) {
            // Map the string day codes back to RRule Weekday constants
            rruleOptions.byweekday = weeklyDays.map(dayStr => dayOfWeekMap[dayStr]);
    }

    if (frequency === 'monthly' && monthlyDays.length > 0) {
      rruleOptions.bymonthday = monthlyDays;
    }

        // Clear irrelevant options based on frequency
        if (frequency !== 'weekly') delete rruleOptions.byweekday;
        if (frequency !== 'monthly') delete rruleOptions.bymonthday;


    onSave(rruleOptions);
  };

  // Effect to handle the initial save when no initialOptions are provided
  useEffect(() => {
    if (!initialOptions && !initialSaveDoneRef.current) {
        // Only call handleSave on the very first render if there were no initial options
        handleSave();
        initialSaveDoneRef.current = true; // Mark initial save as done
    }
    // This effect only needs to run once based on initialOptions
  }, [initialOptions, handleSave]); // handleSave is stable if defined outside useEffect

  // Effect to handle saves on subsequent state changes *after* the initial mount/save
  useEffect(() => {
    // If initialOptions were provided OR the initial save for null options is done,
    // then proceed with saving on state changes.
    if (initialOptions || initialSaveDoneRef.current) {
        handleSave();
    }
    // This effect runs whenever the state influencing the rule changes
  }, [frequency, interval, weeklyDays, monthlyDays]);


    // State update handlers (no longer call handleSave directly)
  const handleFrequencyChange = (value: FrequencyType) => {
    setFrequency(value);
        if (value !== 'weekly') setWeeklyDays([]);
         if (value !== 'monthly') setMonthlyDays([]);
        if (value === 'once') setInterval(1);
  };

  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value);
        setInterval(val >= 1 ? val : 1);
    };

     // *** REVERTED: Handle MULTIPLE weekly day selection via checkboxes ***
     const handleWeeklyDayToggle = (day: DayOfWeekString) => {
         setWeeklyDays((prev) =>
             prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => daysOfWeekCheckboxes.findIndex(opt => opt.value === a) - daysOfWeekCheckboxes.findIndex(opt => opt.value === b)) // Keep order consistent
         );
  };

  const handleMonthlyDayToggle = (day: number) => {
    setMonthlyDays((prev) => {
      const newDays = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day];
            return newDays.sort((a, b) => a - b);
    });
  };


  return (
    <div className="space-y-4 p-3 border rounded-md bg-muted/50">
      <RadioGroup value={frequency} onValueChange={handleFrequencyChange} className="flex flex-wrap gap-x-4 gap-y-2">
        {/* Radio buttons for Once, Daily, Weekly, Monthly */}
        <div className="flex items-center space-x-2"> <RadioGroupItem value="once" id="once" /> <Label htmlFor="once">Once</Label> </div>
        <div className="flex items-center space-x-2"> <RadioGroupItem value="daily" id="daily" /> <Label htmlFor="daily">Daily</Label> </div>
        <div className="flex items-center space-x-2"> <RadioGroupItem value="weekly" id="weekly" /> <Label htmlFor="weekly">Weekly</Label> </div>
        <div className="flex items-center space-x-2"> <RadioGroupItem value="monthly" id="monthly" /> <Label htmlFor="monthly">Monthly</Label> </div>
      </RadioGroup>

      {frequency !== 'once' && (
        <div className="flex items-center space-x-2 pt-2">
          <Label htmlFor="interval">Every</Label>
          <Input id="interval" type="number" value={interval} onChange={handleIntervalChange} className="w-16 h-8 text-sm" min={1}/>
          <span className="text-sm">
            {frequency === 'daily' ? 'day(s)' : frequency === 'weekly' ? 'week(s)' : 'month(s)'}
          </span>
        </div>
      )}

       {/* *** REVERTED: Weekly Section uses Checkboxes *** */}
      {frequency === 'weekly' && (
        <div className="space-y-2 pt-2">
               <Label>Repeat on:</Label>
               <div className="flex flex-wrap gap-x-3 gap-y-2"> {/* Adjusted gap */}
                   {daysOfWeekCheckboxes.map((dayInfo) => (
                       <div key={dayInfo.value} className="flex items-center space-x-1.5"> {/* Reduced space */}
                           <Checkbox
                               id={`weekly-${dayInfo.value}`}
                               checked={weeklyDays.includes(dayInfo.value)}
                               onCheckedChange={() => handleWeeklyDayToggle(dayInfo.value)}
                           />
                           <Label htmlFor={`weekly-${dayInfo.value}`} className="text-xs font-normal"> {/* Smaller label */}
                               {dayInfo.label}
                           </Label>
                       </div>
            ))}
               </div>
        </div>
      )}

      {frequency === 'monthly' && (
        <div className="space-y-2 pt-2">
          <Label>Repeat on day(s):</Label>
          <div className="grid grid-cols-7 gap-2">
             {/* Only show days 1-31, maybe add 'Last Day' option later if needed */}
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <div key={day} className="flex items-center justify-center space-x-1">
                 <Checkbox id={`monthly-${day}`} checked={monthlyDays.includes(day)} onCheckedChange={() => handleMonthlyDayToggle(day)} />
                 <Label htmlFor={`monthly-${day}`} className="text-xs">{day}</Label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecurrenceRuleForm;