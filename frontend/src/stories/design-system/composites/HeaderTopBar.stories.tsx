import type { Meta, StoryObj } from '@storybook/react'
import { useLocation } from 'react-router-dom'
import { useMemo } from 'react'

import { TopBar } from '@/components/layout/top-bar'

const meta = {
  title: 'Design System/Composites/Header TopBar',
  component: TopBar,
  parameters: {
    layout: 'fullscreen',
    chromatic: { disableSnapshot: true },
  },
  decorators: [
    (Story) => (
      <div className="[&_header>div]:!h-16">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TopBar>

export default meta
type Story = StoryObj<typeof meta>

function RouteAwareTopBarDemo() {
  const location = useLocation()

  const scope = useMemo(() => {
    if (location.pathname.startsWith('/profile')) {
      return 'account' as const
    }
    return 'workspace' as const
  }, [location.pathname])

  return (
    <TopBar
      scope={scope}
      onOpenLeftNav={() => undefined}
      showLeftNavButton
    />
  )
}

function HeaderTopBarStory() {
  return <RouteAwareTopBarDemo />
}

export const Default: Story = {
  args: {
    scope: 'workspace',
    onOpenLeftNav: () => undefined,
    showLeftNavButton: true,
  },
  render: () => <HeaderTopBarStory />,
}
