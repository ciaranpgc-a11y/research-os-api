import { ScrollArea } from '@/components/ui'
import { houseLayout, houseNavigation, houseSurfaces, houseTypography } from '@/lib/house-style'
import { getHouseLeftBorderToneClass, getHouseNavToneClass } from '@/lib/section-tone'
import { cn } from '@/lib/utils'

export type WorkspacesHomeSidebarItem = 'workspaces' | 'invitations' | 'data-library' | 'inbox'

type WorkspacesHomeSidebarProps = {
  activeItem: WorkspacesHomeSidebarItem
  canOpenInbox: boolean
  onOpenWorkspaces: () => void
  onOpenInvitations: () => void
  onOpenDataLibrary: () => void
  onOpenInbox: () => void
  onNavigate?: () => void
}

const HOUSE_SECTION_TITLE_CLASS = houseTypography.sectionTitle
const HOUSE_PAGE_HEADER_CLASS = houseLayout.pageHeader
const HOUSE_SIDEBAR_FRAME_CLASS = houseLayout.sidebarFrame
const HOUSE_SIDEBAR_CLASS = houseLayout.sidebar
const HOUSE_SIDEBAR_SCROLL_CLASS = houseLayout.sidebarScroll
const HOUSE_SIDEBAR_HEADER_CLASS = houseLayout.sidebarHeader
const HOUSE_SIDEBAR_BODY_CLASS = houseLayout.sidebarBody
const HOUSE_SIDEBAR_SECTION_CLASS = houseLayout.sidebarSection
const HOUSE_LEFT_BORDER_CLASS = cn(houseSurfaces.leftBorder, getHouseLeftBorderToneClass('workspace'))
const HOUSE_NAV_SECTION_LABEL_CLASS = houseNavigation.sectionLabel
const HOUSE_NAV_LIST_CLASS = houseNavigation.list
const HOUSE_NAV_ITEM_CLASS = houseNavigation.item
const HOUSE_NAV_ITEM_ACTIVE_CLASS = houseNavigation.itemActive
const HOUSE_NAV_ITEM_WORKSPACE_CLASS = getHouseNavToneClass('workspace')
const HOUSE_NAV_ITEM_LABEL_CLASS = houseNavigation.itemLabel

function WorkspacesHomeSidebarItemButton({
  active,
  disabled = false,
  label,
  onClick,
}: {
  active: boolean
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  const className = cn(
    HOUSE_NAV_ITEM_CLASS,
    HOUSE_NAV_ITEM_WORKSPACE_CLASS,
    active && HOUSE_NAV_ITEM_ACTIVE_CLASS,
    disabled && 'cursor-not-allowed opacity-60',
  )

  if (active) {
    return (
      <div className={className}>
        <span className={HOUSE_NAV_ITEM_LABEL_CLASS}>{label}</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      disabled={disabled}
    >
      <span className={HOUSE_NAV_ITEM_LABEL_CLASS}>{label}</span>
    </button>
  )
}

export function WorkspacesHomeSidebar({
  activeItem,
  canOpenInbox,
  onOpenWorkspaces,
  onOpenInvitations,
  onOpenDataLibrary,
  onOpenInbox,
  onNavigate,
}: WorkspacesHomeSidebarProps) {
  const navigateTo = (action: () => void) => {
    action()
    onNavigate?.()
  }

  return (
    <aside className={cn(HOUSE_SIDEBAR_FRAME_CLASS, HOUSE_SIDEBAR_CLASS)} data-house-role="left-nav-shell">
      <div className={HOUSE_SIDEBAR_HEADER_CLASS}>
        <div className={cn(HOUSE_PAGE_HEADER_CLASS, HOUSE_LEFT_BORDER_CLASS)}>
          <h2 data-house-role="section-title" className={HOUSE_SECTION_TITLE_CLASS}>My Workspace</h2>
        </div>
      </div>
      <ScrollArea className={HOUSE_SIDEBAR_SCROLL_CLASS}>
        <div className={HOUSE_SIDEBAR_BODY_CLASS}>
          <section className={HOUSE_SIDEBAR_SECTION_CLASS}>
            <p className={HOUSE_NAV_SECTION_LABEL_CLASS}>
              Workspace hub
            </p>
            <div className={HOUSE_NAV_LIST_CLASS}>
              <WorkspacesHomeSidebarItemButton
                active={activeItem === 'workspaces'}
                label="My Workspaces"
                onClick={() => navigateTo(onOpenWorkspaces)}
              />
              <WorkspacesHomeSidebarItemButton
                active={activeItem === 'invitations'}
                label="Invitations"
                onClick={() => navigateTo(onOpenInvitations)}
              />
              <WorkspacesHomeSidebarItemButton
                active={activeItem === 'data-library'}
                label="Data library"
                onClick={() => navigateTo(onOpenDataLibrary)}
              />
              <WorkspacesHomeSidebarItemButton
                active={activeItem === 'inbox'}
                disabled={!canOpenInbox}
                label="Inbox"
                onClick={() => navigateTo(onOpenInbox)}
              />
            </div>
          </section>
        </div>
      </ScrollArea>
    </aside>
  )
}
