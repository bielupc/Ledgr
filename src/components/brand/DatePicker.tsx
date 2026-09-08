import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  /** `YYYY-MM-DD`. The wire format never becomes a Date outside this component. */
  value: string
  onChange: (value: string) => void
  id?: string
  className?: string
}

/*
 * A native `type="date"` renders the browser's own locale order (MM/DD/YYYY on
 * an en-US install) and its own control chrome, neither of which the app can
 * style. This keeps the ISO string on the wire and owns the presentation.
 */
export function DatePicker({ value, onChange, id, className }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = value ? parseISO(value) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        className={cn(
          'flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-[13px]',
          'transition-[border-color,background-color,box-shadow] duration-150 ease-[var(--ease-out-brand)]',
          'outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'hoverfine:border-border-strong data-[state=open]:border-ring',
          className,
        )}
      >
        <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
        <span className="tabular truncate">
          {selected ? format(selected, 'dd/MM/yyyy') : 'Pick a date'}
        </span>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-0">
        {/* Brand overrides live here, not in the shadcn file, so `shadcn add`
            can replace that component without losing them. */}
        <Calendar
          mode="single"
          required
          weekStartsOn={1}
          defaultMonth={selected}
          selected={selected}
          onSelect={(date) => {
            if (!date) return
            onChange(format(date, 'yyyy-MM-dd'))
            setOpen(false)
          }}
          className="[--cell-size:--spacing(8.5)] [&_button]:tabular"
          classNames={{
            month_caption:
              'flex h-(--cell-size) w-full items-center justify-center px-(--cell-size) heading-tight text-[14px]',
            weekday: 'label-mono flex-1 select-none pb-1',
            // Emerald marks state, so today is ink and weight, not a filled
            // cell competing with the selection.
            today: 'rounded-md font-semibold text-accent-ink',
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
