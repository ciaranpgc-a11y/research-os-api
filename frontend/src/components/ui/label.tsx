import * as React from 'react'

import { houseTypography } from '@/lib/house-style'
import { cn } from '@/lib/utils'

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(houseTypography.fieldLabelInline, className)}
    {...props}
  />
))

Label.displayName = 'Label'

export { Label }
