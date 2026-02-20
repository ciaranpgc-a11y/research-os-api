import { Menu, Moon, PanelRight, Search, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAaweStore } from '@/store/use-aawe-store'

type TopBarProps = {
  onOpenLeftNav: () => void
  onOpenRightPanel: () => void
}

export function TopBar({ onOpenLeftNav, onOpenRightPanel }: TopBarProps) {
  const theme = useAaweStore((state) => state.theme)
  const toggleTheme = useAaweStore((state) => state.toggleTheme)

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
        <Input placeholder="Search claims, results, citations..." className="h-8" />
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
        <Button variant="outline" size="sm">
          Export
        </Button>
        <Button size="sm">Run QC</Button>
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
      </div>
    </header>
  )
}
