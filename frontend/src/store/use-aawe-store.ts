import { create } from 'zustand'

import type { SelectionItem } from '@/types/selection'

export type UiTheme = 'light' | 'dark'

function getInitialTheme(): UiTheme {
  if (typeof window === 'undefined') {
    return 'light'
  }
  const stored = window.localStorage.getItem('aawe-theme')
  if (stored === 'light' || stored === 'dark') {
    return stored
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

type AaweStore = {
  selectedItem: SelectionItem
  rightPanelOpen: boolean
  leftPanelOpen: boolean
  claimMapView: boolean
  theme: UiTheme
  searchQuery: string
  setSelectedItem: (item: SelectionItem) => void
  clearSelection: () => void
  setRightPanelOpen: (open: boolean) => void
  setLeftPanelOpen: (open: boolean) => void
  toggleClaimMapView: () => void
  setTheme: (theme: UiTheme) => void
  toggleTheme: () => void
  setSearchQuery: (value: string) => void
}

export const useAaweStore = create<AaweStore>((set) => ({
  selectedItem: null,
  rightPanelOpen: false,
  leftPanelOpen: false,
  claimMapView: false,
  theme: getInitialTheme(),
  searchQuery: "",
  setSelectedItem: (item) => {
    set({ selectedItem: item, rightPanelOpen: item !== null })
  },
  clearSelection: () => {
    set({ selectedItem: null })
  },
  setRightPanelOpen: (open) => {
    set({ rightPanelOpen: open })
  },
  setLeftPanelOpen: (open) => {
    set({ leftPanelOpen: open })
  },
  toggleClaimMapView: () => {
    set((state) => ({ claimMapView: !state.claimMapView }))
  },
  setTheme: (theme) => {
    set({ theme })
  },
  toggleTheme: () => {
    set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' }))
  },
  setSearchQuery: (value) => {
    set({ searchQuery: value })
  },
}))
