import { useEffect, useState } from 'react'

import { Button } from '@/components/ui'
import { Input } from '@/components/ui'
import { Label } from '@/components/ui'
import { Select } from '@/components/ui'
import { Sheet, SheetContent } from '@/components/ui'
import { houseForms, houseTypography } from '@/lib/house-style'
import type { WorkingTableColumnMeta, WorkingTableColumnType } from '@/types/data-workspace'

type AddColumnModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingColumns: string[]
  onAddColumn: (payload: { name: string; meta: WorkingTableColumnMeta }) => void
}

const DATA_TYPE_OPTIONS: Array<{ value: WorkingTableColumnType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number (decimal)' },
  { value: 'integer', label: 'Integer' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date' },
]

const ROLE_OPTIONS = ['Identifier', 'Dimension', 'Measure', 'Grouping', 'Derived', 'Other']

function uniqueColumnName(baseName: string, existingColumns: string[]): string {
  const cleaned = baseName.trim() || 'Column'
  if (!existingColumns.includes(cleaned)) {
    return cleaned
  }
  let suffix = 2
  while (existingColumns.includes(`${cleaned} ${suffix}`)) {
    suffix += 1
  }
  return `${cleaned} ${suffix}`
}

export function AddColumnModal({ open, onOpenChange, existingColumns, onAddColumn }: AddColumnModalProps) {
  const [name, setName] = useState('')
  const [dataType, setDataType] = useState<WorkingTableColumnType>('text')
  const [unit, setUnit] = useState('')
  const [roleTag, setRoleTag] = useState('')

  useEffect(() => {
    if (!open) {
      return
    }
    setName('')
    setDataType('text')
    setUnit('')
    setRoleTag('')
  }, [open])

  const onSubmit = () => {
    const columnName = uniqueColumnName(name || `Column ${existingColumns.length + 1}`, existingColumns)
    onAddColumn({
      name: columnName,
      meta: {
        dataType,
        unit: unit.trim() || undefined,
        roleTag: roleTag.trim() || undefined,
      },
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-sz-420" data-house-role="modal-sheet">
        <div className="space-y-4 pr-6" data-house-role="modal-content">
          <div className="space-y-1" data-house-role="modal-header">
            <h3 className={houseTypography.sectionTitle} data-house-role="section-title">Add Column</h3>
            <p className={houseTypography.sectionSubtitle} data-house-role="section-subtitle">Define column metadata before adding it to the working table.</p>
          </div>

          <div className="space-y-1" data-house-role="field-group">
            <Label htmlFor="add-column-name">Column name</Label>
            <Input
              id="add-column-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`Column ${existingColumns.length + 1}`}
            />
          </div>

          <div className="space-y-1" data-house-role="field-group">
            <Label htmlFor="add-column-type">Data type</Label>
            <Select
              id="add-column-type"
              className="w-full"
              value={dataType}
              onChange={(event) => setDataType(event.target.value as WorkingTableColumnType)}
            >
              {DATA_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1" data-house-role="field-group">
            <Label htmlFor="add-column-unit">Unit (optional)</Label>
            <Input
              id="add-column-unit"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              placeholder="e.g., %, mmol/L, days"
            />
          </div>

          <div className="space-y-1" data-house-role="field-group">
            <Label htmlFor="add-column-role">Role tag (optional)</Label>
            <input
              id="add-column-role"
              list="add-column-role-options"
              data-house-role="form-input"
              className={`flex h-9 w-full rounded-md px-3 py-1 text-sm ${houseForms.input}`}
              value={roleTag}
              onChange={(event) => setRoleTag(event.target.value)}
              placeholder="Select or enter role"
            />
            <datalist id="add-column-role-options">
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role} />
              ))}
            </datalist>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2" data-house-role="action-row">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="housePrimary" onClick={onSubmit}>Add column</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
