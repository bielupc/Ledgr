import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useImportOrders } from '@/features/investments/hooks'
import { parseOrdersXls } from '@/features/investments/parseOrdersXls'
import { BrokerOrderParseError } from '@shared/brokerOrders.ts'
import { cn } from '@/lib/utils'

/**
 * A hidden file input behind a styled button — the browser's own picker
 * dialog, not a drag-and-drop zone, since this is a one-off upload of a
 * single broker export rather than a recurring workflow. Re-uploading the
 * same (or an overlapping) export is safe: import is keyed on the broker's
 * own operation id.
 */
export function ImportOrdersButton({
  variant = 'default',
  size = 'sm',
  label = 'Import orders',
  className,
}: {
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'sm' | 'default'
  label?: string
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)
  const importOrders = useImportOrders()

  const pick = () => inputRef.current?.click()

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setPending(true)
    try {
      const orders = await parseOrdersXls(file)
      const result = await importOrders.mutateAsync(orders)
      if (result.inserted === 0) {
        toast.info('Nothing new to import', {
          description: `All ${orders.length} orders were already in the ledger.`,
        })
      } else {
        toast.success(`${result.inserted} new order${result.inserted === 1 ? '' : 's'} imported`, {
          description:
            result.skipped > 0
              ? `${result.skipped} already imported${result.newFunds > 0 ? ` · ${result.newFunds} new fund${result.newFunds === 1 ? '' : 's'}` : ''}`
              : result.newFunds > 0
                ? `${result.newFunds} new fund${result.newFunds === 1 ? '' : 's'}`
                : undefined,
        })
      }
    } catch (error) {
      const message =
        error instanceof BrokerOrderParseError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Could not read that file'
      toast.error('Import failed', { description: message })
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xls,text/html"
        className="sr-only"
        onChange={(e) => void onFile(e)}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={pending}
        onClick={pick}
        className={cn(className)}
      >
        <Upload className="size-3.5" strokeWidth={1.75} />
        {pending ? 'Importing…' : label}
      </Button>
    </>
  )
}
