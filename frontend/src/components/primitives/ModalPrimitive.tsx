import * as React from 'react'
import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * ModalPrimitive token contract:
 * - Radius: --radius-md
 * - Spacing: --space-4
 * - Elevation: --elevation-3 (highest available elevation token in current foundation)
 * - Overlay: tone-neutral-900 / 0.34
 * - Motion: entry uses duration-150 (mapped to motion fast), exit uses duration-320 (mapped to motion slow)
 * - Typography: text-h2 (title), text-body (content)
 * - Width scale: sz-420 (sm), sz-560 (md), sz-720 (lg)
 *
 * Usage examples:
 * - Confirmation dialog: title + short body + footer actions.
 * - Form modal: scrollable body with fixed header/footer.
 * - Alert modal: destructive variant driven by content semantics.
 */

const modalContentVariants = cva(
  [
    'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
    'rounded-[var(--radius-md)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]',
    'shadow-[var(--elevation-3)]',
    'focus:outline-none',
    'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
    'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
    'data-[state=open]:duration-150 data-[state=closed]:duration-320',
  ].join(' '),
  {
    variants: {
      size: {
        sm: 'max-w-sz-420',
        md: 'max-w-sz-560',
        lg: 'max-w-sz-720',
      },
      scrollable: {
        true: 'max-h-[85vh] overflow-hidden',
        false: '',
      },
    },
    defaultVariants: {
      size: 'md',
      scrollable: false,
    },
  },
)

const ModalPrimitive = RadixDialog.Root
const ModalTrigger = RadixDialog.Trigger
const ModalPortal = RadixDialog.Portal

const ModalOverlay = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Overlay>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Overlay>
>(({ className, ...props }, ref) => (
  <RadixDialog.Overlay
    ref={ref}
    data-ui="modal-primitive-overlay"
    data-house-role="modal-overlay"
    aria-hidden="true"
    className={cn(
      'fixed inset-0 z-40 bg-[hsl(var(--tone-neutral-900)/0.34)]',
      'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
      'data-[state=open]:duration-150 data-[state=closed]:duration-320',
      className,
    )}
    {...props}
  />
))
ModalOverlay.displayName = RadixDialog.Overlay.displayName

type ModalContentProps = React.ComponentPropsWithoutRef<typeof RadixDialog.Content> &
  VariantProps<typeof modalContentVariants> & {
    closeOnOverlayClick?: boolean
  }

const ModalContent = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Content>,
  ModalContentProps
>(
  (
    {
      className,
      children,
      size = 'md',
      scrollable = false,
      closeOnOverlayClick = true,
      onInteractOutside,
      ...props
    },
    ref,
  ) => (
    <ModalPortal>
      <ModalOverlay />
      <RadixDialog.Content
        ref={ref}
        data-ui="modal-primitive-content"
        data-house-role="modal-content"
        className={cn(modalContentVariants({ size, scrollable }), className)}
        onInteractOutside={(event) => {
          if (!closeOnOverlayClick) {
            event.preventDefault()
          }
          onInteractOutside?.(event)
        }}
        style={{
          transitionTimingFunction: 'var(--ease-decelerate)',
        }}
        {...props}
      >
        {children}
      </RadixDialog.Content>
    </ModalPortal>
  ),
)
ModalContent.displayName = RadixDialog.Content.displayName

const ModalHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="modal-primitive-header"
      data-house-role="modal-header"
      className={cn('space-y-1 border-b border-[hsl(var(--border))]', className)}
      style={{ padding: 'var(--space-4)', ...style }}
      {...props}
    />
  ),
)
ModalHeader.displayName = 'ModalHeader'

const ModalTitle = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Title>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Title>
>(({ className, ...props }, ref) => (
  <RadixDialog.Title
    ref={ref}
    data-ui="modal-primitive-title"
    data-house-role="modal-title"
    className={cn('text-h2 font-semibold leading-tight', className)}
    {...props}
  />
))
ModalTitle.displayName = RadixDialog.Title.displayName

const ModalDescription = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Description>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Description>
>(({ className, ...props }, ref) => (
  <RadixDialog.Description
    ref={ref}
    data-ui="modal-primitive-description"
    data-house-role="modal-description"
    className={cn('text-body text-[hsl(var(--muted-foreground))]', className)}
    {...props}
  />
))
ModalDescription.displayName = RadixDialog.Description.displayName

const ModalBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { scrollable?: boolean }
>(({ className, style, scrollable = false, ...props }, ref) => (
  <div
    ref={ref}
    data-ui="modal-primitive-body"
    data-house-role="modal-body"
    className={cn('text-body', scrollable ? 'max-h-[52vh] overflow-y-auto' : '', className)}
    style={{ padding: 'var(--space-4)', ...style }}
    {...props}
  />
))
ModalBody.displayName = 'ModalBody'

const ModalFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="modal-primitive-footer"
      data-house-role="modal-footer"
      className={cn('flex items-center justify-end gap-2 border-t border-[hsl(var(--border))]', className)}
      style={{ padding: 'var(--space-4)', ...style }}
      {...props}
    />
  ),
)
ModalFooter.displayName = 'ModalFooter'

const ModalClose = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Close>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Close>
>(({ className, children, ...props }, ref) => (
  <RadixDialog.Close
    ref={ref}
    data-ui="modal-primitive-close"
    data-house-role="modal-close"
    className={cn(
      'absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)]',
      'text-[hsl(var(--muted-foreground))] transition-[background-color,color,box-shadow] duration-150',
      'hover:bg-[hsl(var(--tone-neutral-100))] hover:text-[hsl(var(--foreground))]',
      'focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]',
      className,
    )}
    {...props}
  >
    {children ?? <X className="h-4 w-4" aria-hidden="true" />}
    <span className="sr-only">Close</span>
  </RadixDialog.Close>
))
ModalClose.displayName = RadixDialog.Close.displayName

export {
  ModalPrimitive,
  ModalTrigger,
  ModalPortal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  ModalClose,
}
