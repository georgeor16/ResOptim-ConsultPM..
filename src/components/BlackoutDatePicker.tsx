import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { WorkingDay } from '@/lib/types';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

interface BlackoutDatePickerProps {
  blackoutDates: string[];
  onChange: (dates: string[]) => void;
  workingDays: WorkingDay[];
}

function toDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toDateStr(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function BlackoutDatePicker({ blackoutDates, onChange, workingDays }: BlackoutDatePickerProps) {
  const [month, setMonth] = useState<Date>(new Date());

  const selected: Date[] = blackoutDates.map(toDate);

  const handleDayClick = (day: Date) => {
    const dateStr = toDateStr(day);
    if (blackoutDates.includes(dateStr)) {
      onChange(blackoutDates.filter(d => d !== dateStr));
    } else {
      onChange([...blackoutDates, dateStr].sort());
    }
  };

  // Grey out days that are already non-working (no need to block them out)
  const nonWorkingDayNumbers = [0, 1, 2, 3, 4, 5, 6].filter(
    d => !workingDays.includes(d as WorkingDay)
  );

  const isNonWorkingDay = (date: Date) => nonWorkingDayNumbers.includes(date.getDay());

  return (
    <div className="space-y-2">
      <DayPicker
        mode="multiple"
        selected={selected}
        onDayClick={handleDayClick}
        month={month}
        onMonthChange={setMonth}
        showOutsideDays={false}
        classNames={{
          months: 'flex flex-col',
          month: 'space-y-3',
          caption: 'flex justify-center relative items-center pt-1',
          caption_label: 'text-sm font-medium',
          nav: 'space-x-1 flex items-center',
          nav_button: cn(
            buttonVariants({ variant: 'outline' }),
            'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100'
          ),
          nav_button_previous: 'absolute left-1',
          nav_button_next: 'absolute right-1',
          table: 'w-full border-collapse space-y-1',
          head_row: 'flex',
          head_cell: 'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
          row: 'flex w-full mt-1',
          cell: 'h-9 w-9 text-center text-sm p-0',
          day: cn(
            buttonVariants({ variant: 'ghost' }),
            'h-9 w-9 p-0 font-normal'
          ),
          day_selected:
            'bg-destructive/80 text-destructive-foreground hover:bg-destructive/70 line-through',
          day_today: 'bg-accent text-accent-foreground',
          day_outside: 'text-muted-foreground opacity-30',
          day_disabled: 'text-muted-foreground opacity-30',
          day_hidden: 'invisible',
        }}
        components={{
          IconLeft: () => <ChevronLeft className="h-4 w-4" />,
          IconRight: () => <ChevronRight className="h-4 w-4" />,
        }}
        modifiers={{ nonWorking: isNonWorkingDay }}
        modifiersClassNames={{ nonWorking: 'opacity-40 text-muted-foreground' }}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Click a date to toggle it as a blackout/holiday</span>
        {blackoutDates.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-destructive hover:underline"
          >
            Clear all ({blackoutDates.length})
          </button>
        )}
      </div>
    </div>
  );
}
