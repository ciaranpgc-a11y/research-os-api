import { create } from 'zustand'

import type { SelectionItem } from '@/types/selection'

type AaweStore = {
  selectedItem: SelectionItem
  rightPanelOpen: boolean
  leftPanelOpen: boolean
  claimMapView: boolean
  setSelectedItem: (item: SelectionItem) => void
  clearSelection: () => void
  setRightPanelOpen: (open: boolean) => void
  setLeftPanelOpen: (open: boolean) => void
  toggleClaimMapView: () => void
}

export const useAaweStore = create<AaweStore>((set) => ({
  selectedItem: null,
  rightPanelOpen: false,
  leftPanelOpen: false,
  claimMapView: false,
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
}))
