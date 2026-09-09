import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths, format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { currentMonth, formatMonthLong } from '@/lib/format'

interface MonthPickerProps {
  month: string
  onChange: (month: string) => void
}

export function MonthPicker({ month, onChange }: MonthPickerProps) {
  const shift = (delta: number) =>
    onChange(format(addMonths(parseISO(`${month}-01`), delta), 'yyyy-MM'))

  const isCurrent = month === currentMonth()

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5">
      <Button variant="ghost" size="icon" className="size-7" onClick={() => shift(-1)}>
        <ChevronLeft className="size-4" />
        <span className="sr-only">Previous month</span>
      </Button>

      <button
        type="button"
        onClick={() => onChange(currentMonth())}
        className="min-w-[112px] rounded-md px-1 text-[12.5px] font-medium tabular-nums transition-[color,scale] duration-150 ease-[var(--ease-out-brand)] hover:text-accent-ink active:scale-[0.97]"
      >
        {formatMonthLong(month)}
      </button>

      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        disabled={isCurrent}
        onClick={() => shift(1)}
      >
        <ChevronRight className="size-4" />
        <span className="sr-only">Next month</span>
      </Button>
    </div>
  )
}
