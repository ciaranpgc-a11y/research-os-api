import type { Meta, StoryObj } from '@storybook/react-vite'
import { Bell, BookOpen, ChartColumn, FolderOpen, Home, LifeBuoy, Settings, Users } from 'lucide-react'
import {
  NavigationPrimitive,
  NavigationHeader,
  NavigationSection,
  NavigationItem,
  NavigationFooter,
} from '@/components/primitives/NavigationPrimitive'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Composites/Navigation Primitive',
  component: NavigationPrimitive,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Sidebar navigation composite with grouped sections, active-route highlighting, optional badges, and collapsed icon rail with tooltips.',
      },
    },
  },
} satisfies Meta<typeof NavigationPrimitive>

export default meta
type Story = StoryObj<typeof meta>

function FullSidebar() {
  return (
    <NavigationPrimitive currentPath="/workspace/home" className="min-h-[34rem]">
      <NavigationHeader>
        <p className="text-label font-semibold">Research OS</p>
      </NavigationHeader>

      <NavigationSection>
        <NavigationSection.Label>Workspace</NavigationSection.Label>
        <NavigationItem href="/workspace/home">
          <NavigationItem.Icon><Home className="h-5 w-5" /></NavigationItem.Icon>
          <NavigationItem.Label>Home</NavigationItem.Label>
        </NavigationItem>
        <NavigationItem href="/workspace/library">
          <NavigationItem.Icon><FolderOpen className="h-5 w-5" /></NavigationItem.Icon>
          <NavigationItem.Label>Data Library</NavigationItem.Label>
          <NavigationItem.Badge value={3} />
        </NavigationItem>
        <NavigationItem href="/workspace/publications">
          <NavigationItem.Icon><BookOpen className="h-5 w-5" /></NavigationItem.Icon>
          <NavigationItem.Label>Publications</NavigationItem.Label>
        </NavigationItem>
        <NavigationItem href="/workspace/analytics">
          <NavigationItem.Icon><ChartColumn className="h-5 w-5" /></NavigationItem.Icon>
          <NavigationItem.Label>Analytics</NavigationItem.Label>
          <NavigationItem.Badge variant="success" value="Live" />
        </NavigationItem>
      </NavigationSection>

      <NavigationSection>
        <NavigationSection.Label>Team</NavigationSection.Label>
        <NavigationItem href="/workspace/team">
          <NavigationItem.Icon><Users className="h-5 w-5" /></NavigationItem.Icon>
          <NavigationItem.Label>Collaborators</NavigationItem.Label>
        </NavigationItem>
        <NavigationItem href="/workspace/notifications">
          <NavigationItem.Icon><Bell className="h-5 w-5" /></NavigationItem.Icon>
          <NavigationItem.Label>Notifications</NavigationItem.Label>
          <NavigationItem.Badge variant="danger" value={5} />
        </NavigationItem>
      </NavigationSection>

      <NavigationFooter>
        <div className="space-y-2">
          <NavigationItem href="/workspace/settings">
            <NavigationItem.Icon><Settings className="h-5 w-5" /></NavigationItem.Icon>
            <NavigationItem.Label>Settings</NavigationItem.Label>
          </NavigationItem>
          <NavigationItem href="/workspace/support">
            <NavigationItem.Icon><LifeBuoy className="h-5 w-5" /></NavigationItem.Icon>
            <NavigationItem.Label>Support</NavigationItem.Label>
          </NavigationItem>
        </div>
      </NavigationFooter>
    </NavigationPrimitive>
  )
}

function CollapsedSidebar() {
  return (
    <NavigationPrimitive variant="collapsed" currentPath="/workspace/home" className="min-h-[26rem]">
      <NavigationHeader className="flex justify-center">
        <p className="text-caption font-semibold">RO</p>
      </NavigationHeader>
      <NavigationSection>
        <NavigationItem href="/workspace/home">
          <NavigationItem.Icon><Home className="h-5 w-5" /></NavigationItem.Icon>
          <NavigationItem.Label>Home</NavigationItem.Label>
        </NavigationItem>
        <NavigationItem href="/workspace/library">
          <NavigationItem.Icon><FolderOpen className="h-5 w-5" /></NavigationItem.Icon>
          <NavigationItem.Label>Data Library</NavigationItem.Label>
          <NavigationItem.Badge value={3} />
        </NavigationItem>
        <NavigationItem href="/workspace/notifications">
          <NavigationItem.Icon><Bell className="h-5 w-5" /></NavigationItem.Icon>
          <NavigationItem.Label>Notifications</NavigationItem.Label>
          <NavigationItem.Badge variant="danger" value={5} />
        </NavigationItem>
      </NavigationSection>
      <NavigationFooter className="flex justify-center">
        <NavigationItem href="/workspace/settings">
          <NavigationItem.Icon><Settings className="h-5 w-5" /></NavigationItem.Icon>
          <NavigationItem.Label>Settings</NavigationItem.Label>
        </NavigationItem>
      </NavigationFooter>
    </NavigationPrimitive>
  )
}

export const Showcase: Story = {
  render: () => (
    <StoryFrame
      title="NavigationPrimitive"
      subtitle="Full sidebar, collapsed icon rail, active states, and badge integration"
    >
      <div className="space-y-6" data-ui="navigation-primitive-story">
        <section className="space-y-2" data-ui="navigation-primitive-full-section">
          <p className="text-label text-muted-foreground" data-ui="navigation-primitive-full-label">
            Full sidebar (grouped sections, badges, active route)
          </p>
          <FullSidebar />
        </section>

        <section className="space-y-2" data-ui="navigation-primitive-collapsed-section">
          <p className="text-label text-muted-foreground" data-ui="navigation-primitive-collapsed-label">
            Collapsed variant (icon-only, tooltip labels)
          </p>
          <CollapsedSidebar />
        </section>

        <section
          className="rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--tone-neutral-50))] p-3"
          data-ui="navigation-primitive-a11y-note"
        >
          <p className="text-label text-[hsl(var(--foreground))]">Accessibility</p>
          <p className="text-body text-[hsl(var(--muted-foreground))]">
            Uses semantic `nav` + heading structure, active item exposes `aria-current="page"`, and links remain keyboard
            navigable across default and collapsed variants.
          </p>
        </section>
      </div>
    </StoryFrame>
  ),
}
