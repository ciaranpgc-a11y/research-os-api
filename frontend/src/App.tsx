import { useEffect } from 'react'

import { AppRouter } from '@/AppRouter'
import { installHouseElementTagging } from '@/lib/house-element-tagging'
import { installHouseTableResize } from '@/lib/house-table-resize'
import { useAaweStore } from '@/store/use-aawe-store'

function App() {
  const clearSelection = useAaweStore((state) => state.clearSelection)
  const theme = useAaweStore((state) => state.theme)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearSelection()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [clearSelection])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem('aawe-theme', theme)
  }, [theme])

  useEffect(() => {
    const disposeTagging = installHouseElementTagging()
    const disposeTableResize = installHouseTableResize()
    return () => {
      disposeTagging()
      disposeTableResize()
    }
  }, [])

  return <AppRouter />
}

export default App
