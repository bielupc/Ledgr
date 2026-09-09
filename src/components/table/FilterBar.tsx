import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ANY, type Filters } from '@/components/table/filters'
import { resolveIcon } from '@/lib/icons'

interface Option {
  id: string
  name: string
  icon: string | null
}

export function FilterBar({
  filters,
  onChange,
  accounts,
  categories,
  active,
  placeholder = 'Search',
}: {
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
  accounts: Option[]
  /** Omitted where a list has no category to filter on, as transfers do not. */
  categories?: Option[]
  active: boolean
  placeholder?: string
}) {
  // The field is typed into far faster than a round-trip, so it holds its own
  // value and hands it to the URL once the typing pauses.
  const [draft, setDraft] = useState(filters.search)

  useEffect(() => setDraft(filters.search), [filters.search])

  useEffect(() => {
    if (draft === filters.search) return
    const timer = setTimeout(() => onChange({ search: draft }), 220)
    return () => clearTimeout(timer)
  }, [draft, filters.search, onChange])

  return (
    /* One row from `sm` up. Below it the search takes its own line and the
       selects share the next: wrapped onto a 390px screen they left the search
       about 120px, which truncates its own placeholder. */
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full sm:w-auto sm:min-w-[180px] sm:flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-subtle-foreground"
          strokeWidth={2}
        />
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="pl-8.5"
        />
      </div>

      <div className="flex items-center gap-2">
        <FilterSelect
          value={filters.accountId}
          onValueChange={(accountId) => onChange({ accountId })}
          options={accounts}
          allLabel="All accounts"
        />

        {categories && (
          <FilterSelect
            value={filters.categoryId}
            onValueChange={(categoryId) => onChange({ categoryId })}
            options={categories}
            allLabel="All categories"
          />
        )}
      </div>

      {active && (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => onChange({ search: '', accountId: ANY, categoryId: ANY })}
        >
          <X className="size-3.5" strokeWidth={2.25} />
          Clear
        </Button>
      )}
    </div>
  )
}

function FilterSelect({
  value,
  onValueChange,
  options,
  allLabel,
}: {
  value: string
  onValueChange: (value: string) => void
  options: Option[]
  allLabel: string
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="min-w-0 flex-1 *:data-[slot=select-value]:min-w-0 sm:w-[164px] sm:flex-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{allLabel}</SelectItem>
        {options.map((option) => {
          const Icon = resolveIcon(option.icon)
          return (
            <SelectItem key={option.id} value={option.id}>
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">{option.name}</span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
