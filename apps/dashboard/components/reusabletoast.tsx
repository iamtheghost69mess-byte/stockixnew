import type { CSSProperties, ReactNode } from 'react'
import { toast as sonnerToast, type ExternalToast } from 'sonner'

// ─── Shared style builders ────────────────────────────────────────────────────

type ToastId = string | number

type PromiseToastOptions<T> = Omit<ExternalToast, 'description'> & {
  loading?: ReactNode
  success?: ReactNode | string | ((data: T) => ReactNode | string | Promise<ReactNode | string>)
  error?: ReactNode | string | ((err: unknown) => ReactNode | string | Promise<ReactNode | string>)
  description?: ReactNode | string | ((data: T) => ReactNode | string | Promise<ReactNode | string>)
  finally?: () => void | Promise<void>
}

interface ReusableToast {
  success(message: string, options?: ExternalToast): ToastId
  warning(message: string, options?: ExternalToast): ToastId
  error(message: string, options?: ExternalToast): ToastId
  promise<T>(promise: Promise<T> | (() => Promise<T>), options?: PromiseToastOptions<T>): { unwrap: () => Promise<T> }
  raw: typeof sonnerToast
}

const softStyle = (color: string): CSSProperties =>
  ({
    '--normal-bg': `color-mix(in oklab, ${color} 10%, var(--background))`,
    '--normal-text': color,
    '--normal-border': color,
  }) as CSSProperties

const successColor = 'light-dark(var(--color-green-600), var(--color-green-400))'
const warningColor = 'light-dark(var(--color-amber-600), var(--color-amber-400))'
const errorColor   = 'var(--destructive)'

// ─── Toast helpers ────────────────────────────────────────────────────────────

export const toast: ReusableToast = {
  /**
   * Green soft success toast.
   * @example toast.success('Saved successfully!')
   */
  success(message: string, options?: ExternalToast) {
    return sonnerToast.success(message, {
      ...options,
      style: { ...softStyle(successColor), ...options?.style },
    })
  },

  /**
   * Amber soft warning toast.
   * @example toast.warning('Please review your input.')
   */
  warning(message: string, options?: ExternalToast) {
    return sonnerToast.warning(message, {
      ...options,
      style: { ...softStyle(warningColor), ...options?.style },
    })
  },

  /**
   * Red soft error/destructive toast.
   * @example toast.error('Something went wrong.')
   */
  error(message: string, options?: ExternalToast) {
    return sonnerToast.error(message, {
      ...options,
      style: { ...softStyle(errorColor), ...options?.style },
    })
  },

  /**
   * Promise toast — shows loading → success or error automatically.
   * @example
   * toast.promise(saveData(), {
   *   loading: 'Saving...',
   *   success: 'Saved!',
   *   error: 'Failed to save.',
   * })
   */
  promise<T>(promise: Promise<T> | (() => Promise<T>), options?: PromiseToastOptions<T>) {
    return sonnerToast.promise(promise, options) as { unwrap: () => Promise<T> }
  },

  /** Pass-through to raw sonner for anything not covered above. */
  raw: sonnerToast,
}