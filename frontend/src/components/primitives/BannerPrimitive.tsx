import * as React from 'react'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

type BannerVariant = 'default' | 'info' | 'success' | 'warning' | 'danger'
type BannerTone = {
  container: string
  text: string
  icon: string
}

const toneByVariant: Record<BannerVariant, BannerTone> = {
  default: {
    container:
      'border-[hsl(var(--border))] bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--foreground))]',
    text: 'text-[hsl(var(--foreground))]',
    icon: 'text-[hsl(var(--tone-neutral-700))]',
  },
  info: {
    container:
      'border-[hsl(var(--tone-accent-700))] bg-[hsl(var(--tone-accent-50))] text-[hsl(var(--tone-accent-900))]',
    text: 'text-[hsl(var(--tone-accent-900))]',
    icon: 'text-[hsl(var(--tone-accent-700))]',
  },
  success: {
    container:
      'border-[hsl(var(--tone-positive-700))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-900))]',
    text: 'text-[hsl(var(--tone-positive-900))]',
    icon: 'text-[hsl(var(--tone-positive-700))]',
  },
  warning: {
    container:
      'border-[hsl(var(--tone-warning-700))] bg-[hsl(var(--tone-warning-100))] text-[hsl(var(--tone-warning-900))]',
    text: 'text-[hsl(var(--tone-warning-900))]',
    icon: 'text-[hsl(var(--tone-warning-700))]',
  },
  danger: {
    container:
      'border-[hsl(var(--tone-danger-700))] bg-[hsl(var(--tone-danger-50))] text-[hsl(var(--tone-danger-900))]',
    text: 'text-[hsl(var(--tone-danger-900))]',
    icon: 'text-[hsl(var(--tone-danger-700))]',
  },
}

const iconByVariant: Record<BannerVariant, LucideIcon> = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
}

const bannerPrimitiveVariants = cva(
  [
    'grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-[var(--radius-sm)] border',
    'shadow-[var(--elevation-1)] text-body',
    'motion-reduce:animate-none',
  ].join(' '),
  {
    variants: {
      variant: {
        default: toneByVariant.default.container,
        info: toneByVariant.info.container,
        success: toneByVariant.success.container,
        warning: toneByVariant.warning.container,
        danger: toneByVariant.danger.container,
      },
      closeable: {
        true: '',
        false: '',
      },
      action: {
        true: '',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      closeable: false,
      action: false,
    },
  },
)

const BannerVariantContext = React.createContext<BannerVariant>('default')

/**
 * BannerPrimitive token contract:
 * - Radius: --radius-sm
 * - Spacing: --space-3
 * - Elevation: --elevation-1
 * - Motion: --motion-entrance (enter), --motion-slow (exit), --ease-decelerate, --ease-accelerate
 * - Typography: text-h3 (title), text-body (description)
 * - Semantic tones: neutral/accent/positive/warning/danger scales
 *
 * Usage:
 * - API/network errors: variant="danger" with closeable
 * - Validation warnings: variant="warning"
 * - Success confirmations: variant="success"
 * - Informational notices: variant="info" or "default"
 */
interface BannerPrimitiveProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof bannerPrimitiveVariants> {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  onClose?: () => void
  hideIcon?: boolean
}

const BannerPrimitive = React.forwardRef<HTMLDivElement, BannerPrimitiveProps>(
  (
    {
      className,
      variant = 'default',
      closeable = false,
      action = false,
      open,
      defaultOpen = true,
      onOpenChange,
      onClose,
      hideIcon = false,
      children,
      style,
      role,
      ...props
    },
    ref,
  ) => {
    const isControlled = open !== undefined
    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
    const [isClosing, setIsClosing] = React.useState(false)
    const [isEntering, setIsEntering] = React.useState(true)
    const closeTimeout = React.useRef<number | null>(null)
    const isOpen = isControlled ? Boolean(open) : uncontrolledOpen
    const closeDurationMs = 150

    React.useEffect(() => {
      return () => {
        if (closeTimeout.current !== null) {
          window.clearTimeout(closeTimeout.current)
        }
      }
    }, [])

    React.useEffect(() => {
      if (isOpen) {
        setIsClosing(false)
        setIsEntering(true)
        const frame = window.requestAnimationFrame(() => setIsEntering(false))
        return () => window.cancelAnimationFrame(frame)
      }
      return undefined
    }, [isOpen])

    const handleClose = React.useCallback(() => {
      if (!isOpen || isClosing) {
        return
      }
      setIsClosing(true)
      closeTimeout.current = window.setTimeout(() => {
        if (!isControlled) {
          setUncontrolledOpen(false)
        }
        onOpenChange?.(false)
        onClose?.()
        setIsClosing(false)
      }, closeDurationMs)
    }, [isClosing, isControlled, isOpen, onClose, onOpenChange])

    if (!isOpen && !isClosing) {
      return null
    }

    const resolvedVariant: BannerVariant = variant ?? 'default'
    const semanticRole =
      role ??
      (resolvedVariant === 'success' || resolvedVariant === 'warning' || resolvedVariant === 'danger'
        ? 'alert'
        : 'status')
    const iconTone = toneByVariant[resolvedVariant].icon
    const rootTone = toneByVariant[resolvedVariant].text
    const childrenArray = React.Children.toArray(children)
    let iconNode: React.ReactNode = null
    let explicitContent: React.ReactNode = null
    let actionNode: React.ReactNode = null
    let closeNode: React.ReactNode = null
    const contentNodes: React.ReactNode[] = []

    for (const child of childrenArray) {
      if (!React.isValidElement(child)) {
        contentNodes.push(child)
        continue
      }
      if (child.type === BannerIcon) {
        iconNode = child
        continue
      }
      if (child.type === BannerContent) {
        explicitContent = child
        continue
      }
      if (child.type === BannerAction) {
        actionNode = child
        continue
      }
      if (child.type === BannerClose) {
        closeNode = child
        continue
      }
      contentNodes.push(child)
    }

    const contentNode = explicitContent ?? <BannerContent>{contentNodes}</BannerContent>
    const showAction = Boolean(action || actionNode)
    const showClose = Boolean(closeable || closeNode)
    const showTrailing = showAction || showClose

    return (
      <BannerVariantContext.Provider value={resolvedVariant}>
        <div
          ref={ref}
          data-ui="banner-primitive"
          data-house-role="banner"
          data-ui-variant={resolvedVariant}
          data-ui-state={isClosing ? 'closing' : 'open'}
          role={semanticRole}
          aria-live={semanticRole === 'alert' ? 'assertive' : 'polite'}
          className={cn(
            bannerPrimitiveVariants({ variant: resolvedVariant, closeable, action }),
            rootTone,
            'transition-[opacity,transform] motion-reduce:transition-none',
            className,
          )}
          style={{
            padding: 'var(--space-3)',
            opacity: isClosing || isEntering ? 0 : 1,
            transform: `translateY(${isClosing || isEntering ? '-4px' : '0'})`,
            transitionDuration: isClosing ? 'var(--motion-slow)' : 'var(--motion-micro)',
            transitionTimingFunction: isClosing ? 'ease-in' : 'var(--ease-decelerate)',
            ...style,
          }}
          {...props}
        >
          {hideIcon ? (
            <span data-ui="banner-primitive-icon-placeholder" className="w-5" />
          ) : (
            iconNode ?? <BannerIcon className={iconTone} />
          )}
          {contentNode}
          {showTrailing ? (
            <div data-ui="banner-primitive-trailing" className="flex items-start gap-2">
              {showAction ? actionNode : null}
              {showClose ? closeNode ?? <BannerClose onClick={handleClose} /> : null}
            </div>
          ) : (
            <span data-ui="banner-primitive-trailing-placeholder" className="w-0" />
          )}
        </div>
      </BannerVariantContext.Provider>
    )
  },
)
BannerPrimitive.displayName = 'BannerPrimitive'

interface BannerIconProps extends React.HTMLAttributes<HTMLSpanElement> {
  icon?: React.ReactNode
}

const BannerIcon = React.forwardRef<HTMLSpanElement, BannerIconProps>(
  ({ className, icon, ...props }, ref) => {
    const variant = React.useContext(BannerVariantContext)
    const Icon = iconByVariant[variant]
    return (
      <span
        ref={ref}
        data-ui="banner-primitive-icon"
        data-house-role="banner-icon"
        className={cn('mt-0.5 inline-flex h-5 w-5 items-center justify-center', className)}
        {...props}
      >
        {icon ?? <Icon className="h-4 w-4" aria-hidden="true" />}
      </span>
    )
  },
)
BannerIcon.displayName = 'BannerIcon'

const BannerContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="banner-primitive-content"
      data-house-role="banner-content"
      className={cn('min-w-0 space-y-1', className)}
      {...props}
    />
  ),
)
BannerContent.displayName = 'BannerContent'

const BannerTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      data-ui="banner-primitive-title"
      data-house-role="banner-title"
      className={cn('text-h3 font-semibold leading-tight', className)}
      {...props}
    />
  ),
)
BannerTitle.displayName = 'BannerTitle'

const BannerDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      data-ui="banner-primitive-description"
      data-house-role="banner-description"
      className={cn('text-body leading-normal', className)}
      {...props}
    />
  ),
)
BannerDescription.displayName = 'BannerDescription'

const BannerAction = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="banner-primitive-action"
      data-house-role="banner-action"
      className={cn('inline-flex items-center', className)}
      {...props}
    >
      {children}
    </div>
  ),
)
BannerAction.displayName = 'BannerAction'

type BannerCloseProps = React.ButtonHTMLAttributes<HTMLButtonElement>

const BannerClose = React.forwardRef<HTMLButtonElement, BannerCloseProps>(
  ({ className, children, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      data-ui="banner-primitive-close"
      data-house-role="banner-close"
      type={type}
      aria-label="Close notification"
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)]',
        'text-[hsl(var(--muted-foreground))] transition-[background-color,color,box-shadow]',
        'duration-[var(--motion-micro)] ease-[var(--ease-decelerate)]',
        'hover:bg-[hsl(var(--tone-neutral-100)/0.72)] hover:text-[hsl(var(--foreground))]',
        'focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]',
        className,
      )}
      {...props}
    >
      {children ?? <X className="h-4 w-4" aria-hidden="true" />}
    </button>
  ),
)
BannerClose.displayName = 'BannerClose'

export {
  BannerPrimitive as Banner,
  BannerPrimitive,
  BannerIcon,
  BannerContent,
  BannerTitle,
  BannerDescription,
  BannerAction,
  BannerClose,
}
