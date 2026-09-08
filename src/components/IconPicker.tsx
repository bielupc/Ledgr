import { createElement, useState } from 'react'
import { Sparkle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ICON_NAMES, resolveIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'

/*
 * A popover rather than an inline grid: the dialogs that use this already carry
 * an amount panel and four fields, and 130px of icon grid pushes them past the
 * viewport. Null is a real value here, meaning "inherit from the category".
 */
/** `createElement` rather than a capitalised local, which reads as defining a
 *  component inside render; `resolveIcon` only looks a reference up. */
function PickerIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  return createElement(resolveIcon(name), { className, strokeWidth: 1.75 })
}

export function IconPicker({
  value,
  onChange,
  fallback,
  inheritLabel = 'Use category icon',
}: {
  value: string | null
  onChange: (icon: string | null) => void
  fallback?: string | null
  inheritLabel?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Choose an icon"
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-lg border transition-[background-color,border-color,color,scale] duration-150 ease-[var(--ease-out-brand)] active:scale-[0.96]',
            value
              ? 'border-emerald/45 bg-emerald/10 text-accent-ink'
              : 'border-dashed border-border-strong text-muted-foreground hoverfine:border-border-strong hoverfine:text-foreground',
          )}
        >
          <PickerIcon name={value ?? fallback} className="size-4" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[292px] p-2">
        <button
          type="button"
          onClick={() => {
            onChange(null)
            setOpen(false)
          }}
          className={cn(
            'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] transition-colors duration-150',
            value ? 'text-muted-foreground hoverfine:text-foreground' : 'text-accent-ink',
          )}
        >
          <Sparkle className="size-3.5" strokeWidth={1.75} />
          {inheritLabel}
        </button>

        <ScrollArea className="h-[168px]">
          <div className="grid grid-cols-7 gap-1 pr-2">
            {ICON_NAMES.map((option) => {
              const Icon = resolveIcon(option)
              const selected = option === value
              return (
                <button
                  key={option}
                  type="button"
                  aria-label={option}
                  aria-pressed={selected}
                  onClick={() => {
                    onChange(option)
                    setOpen(false)
                  }}
                  className={cn(
                    'grid aspect-square place-items-center rounded-md border transition-[background-color,border-color,color,scale] duration-150 ease-[var(--ease-out-brand)] active:scale-[0.94]',
                    selected
                      ? 'border-emerald bg-emerald/10 text-accent-ink'
                      : 'border-transparent text-muted-foreground hoverfine:border-border hoverfine:text-foreground',
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
