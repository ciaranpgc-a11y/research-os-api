import { useMemo, useState } from 'react'
import { Download, Loader2, Menu, Moon, PanelRight, Search, Sun } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { API_BASE_URL } from '@/lib/api'
import { qcItems } from '@/mock/qc'
import { useAaweStore } from '@/store/use-aawe-store'
import type { ApiErrorPayload } from '@/types/insight'
import type { QCRunResponse } from '@/types/qc-run'

type TopBarProps = {
  onOpenLeftNav: () => void
  onOpenRightPanel: () => void
  showRightPanelButton?: boolean
}

export function TopBar({ onOpenLeftNav, onOpenRightPanel, showRightPanelButton = true }: TopBarProps) {
  const navigate = useNavigate()
  const theme = useAaweStore((state) => state.theme)
  const toggleTheme = useAaweStore((state) => state.toggleTheme)
  const selectedItem = useAaweStore((state) => state.selectedItem)
  const setSelectedItem = useAaweStore((state) => state.setSelectedItem)
  const setRightPanelOpen = useAaweStore((state) => state.setRightPanelOpen)
  const searchQuery = useAaweStore((state) => state.searchQuery)
  const setSearchQuery = useAaweStore((state) => state.setSearchQuery)
  const [isRunningQc, setIsRunningQc] = useState(false)
  const [qcStatus, setQcStatus] = useState('')

  const canExport = useMemo(() => selectedItem !== null, [selectedItem])

  const onExport = () => {
    if (!selectedItem) {
      return
    }
    const payload = JSON.stringify(selectedItem, null, 2)
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const suffix = selectedItem.type === 'claim' ? selectedItem.data.id : selectedItem.data.id
    anchor.href = url
    anchor.download = `aawe-${selectedItem.type}-${suffix}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(url)
  }

  const onRunQc = async () => {
    setIsRunningQc(true)
    setQcStatus('')
    try {
      const response = await fetch(`${API_BASE_URL}/v1/aawe/qc/run`, { method: 'POST' })
      if (!response.ok) {
        let message = `QC run failed (${response.status})`
        try {
          const payload = (await response.json()) as ApiErrorPayload
          message = payload.error?.detail || payload.error?.message || message
        } catch {
          // keep default message
        }
        throw new Error(message)
      }
      const payload = (await response.json()) as QCRunResponse
      setQcStatus(`${payload.total_findings} findings`)
      navigate('/qc')
      const topIssue = payload.issues[0]
      if (topIssue) {
        const matchingItem = qcItems.find((item) => item.id === topIssue.id)
        if (matchingItem) {
          setSelectedItem({ type: 'qc', data: matchingItem })
          setRightPanelOpen(true)
        }
      }
    } catch (error) {
      setQcStatus(error instanceof Error ? error.message : 'QC run failed')
    } finally {
      setIsRunningQc(false)
    }
  }

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-card/80 px-3 backdrop-blur nav:px-4">
      <div className="flex items-center gap-2">
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="nav:hidden" onClick={onOpenLeftNav}>
                <Menu className="h-4 w-4" />
                <span className="sr-only">Open navigator</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open Study Navigator</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold tracking-tight">AAWE</span>
          <span className="hidden text-xs text-muted-foreground md:inline">Autonomous Academic Writing Engine</span>
        </div>
      </div>

      <div className="mx-auto hidden w-full max-w-xl items-center gap-2 md:flex">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search claims, results, citations..."
          className="h-8"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={toggleTheme}>
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span className="sr-only">Toggle theme</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button variant="outline" size="sm" onClick={onExport} disabled={!canExport}>
          <Download className="mr-1 h-3.5 w-3.5" />
          Export
        </Button>
        <Button size="sm" onClick={onRunQc} disabled={isRunningQc}>
          {isRunningQc ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          {isRunningQc ? 'Running...' : 'Run QC'}
        </Button>
        {qcStatus ? <span className="hidden text-xs text-muted-foreground md:inline">{qcStatus}</span> : null}
        {showRightPanelButton ? (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="insight:hidden" onClick={onOpenRightPanel}>
                  <PanelRight className="h-4 w-4" />
                  <span className="sr-only">Open insights</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open Insight Panel</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
    </header>
  )
}
