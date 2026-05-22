"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "../lib/utils"
import { Button } from "./button"
import { Calendar } from "./calendar"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

function parseIsoDateString(value: string): Date | undefined {
  if (!value?.trim()) {
    return undefined
  }
  const [y, m, d] = value.split("-").map(Number)
  if (!y || !m || !d) {
    return undefined
  }
  return new Date(y, m - 1, d)
}

function toIsoDateString(date: Date): string {
  const y = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${y}-${mo}-${day}`
}

export type DatePickerProps = {
  readonly id?: string
  /** Local calendar date as `YYYY-MM-DD` (same as `<input type="date">`). */
  readonly value: string
  readonly onValueChange: (next: string) => void
  readonly placeholder?: string
  readonly disabled?: boolean
  /** Applied to the trigger button (e.g. `w-full`). */
  readonly className?: string
  readonly contentClassName?: string
  readonly align?: React.ComponentProps<typeof PopoverContent>["align"]
}

/**
 * Single-date picker using shadcn Calendar inside a Popover (replaces native date inputs).
 */
function DatePicker(props: DatePickerProps) {
  const {
    id,
    value,
    onValueChange,
    placeholder = "Pick a date",
    disabled,
    className,
    contentClassName,
    align = "start",
  } = props
  const [open, setOpen] = React.useState(false)
  const selected = React.useMemo(() => parseIsoDateString(value), [value])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "justify-start text-left font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {selected ? format(selected, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-auto p-0", contentClassName)} align={align}>
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (date) {
              onValueChange(toIsoDateString(date))
            }
            setOpen(false)
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
