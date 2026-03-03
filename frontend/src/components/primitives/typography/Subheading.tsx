import * as React from 'react'

import { houseTypography } from '@/lib/house-style'
import { cn } from '@/lib/utils'

export interface SubheadingProps extends React.HTMLAttributes<HTMLParagraphElement> {}

const Subheading = React.forwardRef<HTMLParagraphElement, SubheadingProps>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      data-ui="subheading"
      data-house-role="subheading"
      className={cn('m-0', houseTypography.subheading, className)}
      {...props}
    />
  ),
)

Subheading.displayName = 'Subheading'

export { Subheading }
