"use client";

import { addMonths, format, setMonth, setYear } from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import * as React from "react";
import { DayPicker, type DayPickerProps } from "react-day-picker";

import { AppSelect } from "@/components/patterns/app-select";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import "react-day-picker/style.css";

export type CalendarProps = DayPickerProps;

const CURRENT_YEAR = new Date().getFullYear();
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index),
  label: format(new Date(2020, index, 1), "MMMM"),
}));

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  month: monthProp,
  defaultMonth,
  onMonthChange,
  startMonth = new Date(CURRENT_YEAR - 50, 0),
  endMonth = new Date(CURRENT_YEAR + 20, 11),
  ...props
}: CalendarProps) {
  const [internalMonth, setInternalMonth] = React.useState<Date>(
    () => monthProp ?? defaultMonth ?? new Date(),
  );
  const displayMonth = monthProp ?? internalMonth;

  function changeMonth(next: Date) {
    if (!monthProp) setInternalMonth(next);
    onMonthChange?.(next);
  }

  const yearStart = startMonth.getFullYear();
  const yearEnd = endMonth.getFullYear();
  const yearOptions = Array.from(
    { length: yearEnd - yearStart + 1 },
    (_, index) => {
      const year = yearStart + index;
      return { value: String(year), label: String(year) };
    },
  );

  return (
    <div data-slot="calendar" className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Previous month"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "size-8 shrink-0",
          )}
          onClick={() => changeMonth(addMonths(displayMonth, -1))}
        >
          <ChevronLeftIcon className="size-4" />
        </button>

        <AppSelect
          size="sm"
          aria-label="Month"
          className="min-w-0 flex-1"
          value={String(displayMonth.getMonth())}
          onValueChange={(next) =>
            changeMonth(setMonth(displayMonth, Number(next)))
          }
          options={MONTH_OPTIONS}
        />

        <AppSelect
          size="sm"
          aria-label="Year"
          className="w-[5.5rem] shrink-0"
          value={String(displayMonth.getFullYear())}
          onValueChange={(next) =>
            changeMonth(setYear(displayMonth, Number(next)))
          }
          options={yearOptions}
        />

        <button
          type="button"
          aria-label="Next month"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "size-8 shrink-0",
          )}
          onClick={() => changeMonth(addMonths(displayMonth, 1))}
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      <DayPicker
        {...props}
        // Force label caption (hidden) so DayPicker never mounts native month/year <select>s.
        captionLayout="label"
        hideNavigation
        month={displayMonth}
        onMonthChange={changeMonth}
        showOutsideDays={showOutsideDays}
        startMonth={startMonth}
        endMonth={endMonth}
        className={cn(
          "rdp-root p-0 [--rdp-accent-color:var(--primary)] [--rdp-accent-background-color:var(--accent)] [--rdp-day-height:2.25rem] [--rdp-day-width:2.25rem] [--rdp-day_button-height:2.125rem] [--rdp-day_button-width:2.125rem]",
          className,
        )}
        classNames={{
          months: "flex flex-col",
          month: "flex w-full flex-col gap-2",
          month_caption: "hidden",
          dropdowns: "hidden",
          dropdown: "hidden",
          dropdown_root: "hidden",
          months_dropdown: "hidden",
          years_dropdown: "hidden",
          month_grid: "w-full border-collapse",
          weekdays: "flex",
          weekday: "w-9 text-[0.7rem] font-medium text-muted-foreground",
          week: "mt-1 flex w-full",
          day: "relative p-0 text-center text-sm",
          day_button: cn(
            buttonVariants({ variant: "ghost" }),
            "size-9 rounded-lg p-0 font-normal aria-selected:opacity-100",
          ),
          selected:
            "rounded-lg bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
          today: "rounded-lg bg-accent text-accent-foreground",
          outside: "text-muted-foreground opacity-50",
          disabled: "text-muted-foreground opacity-40",
          hidden: "invisible",
          ...classNames,
        }}
      />
    </div>
  );
}

export { Calendar };
