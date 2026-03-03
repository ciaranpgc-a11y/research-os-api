import type { ComponentProps, ReactNode } from 'react'

import { Section, SectionHeader, Stack } from '@/components/primitives'
import { cn } from '@/lib/utils'

type SectionComponentProps = ComponentProps<typeof Section>
type StackComponentProps = ComponentProps<typeof Stack>

export interface PanelShellProps extends Omit<SectionComponentProps, 'children'> {
  children?: ReactNode
  heading?: string
  description?: string
  eyebrow?: string
  actions?: ReactNode
  bodyClassName?: string
  bodySpace?: StackComponentProps['space']
}

export function PanelShell({
  className,
  children,
  heading,
  description,
  eyebrow,
  actions,
  bodyClassName,
  bodySpace = 'md',
  surface = 'card',
  inset = 'md',
  spaceY = 'md',
  ...props
}: PanelShellProps) {
  return (
    <Section
      data-ui="panel-shell"
      data-house-role="panel-shell"
      className={className}
      surface={surface}
      inset={inset}
      spaceY={spaceY}
      {...props}
    >
      {heading ? (
        <SectionHeader eyebrow={eyebrow} heading={heading} description={description} actions={actions} />
      ) : null}
      <Stack space={bodySpace} className={cn('w-full', bodyClassName)}>
        {children}
      </Stack>
    </Section>
  )
}
