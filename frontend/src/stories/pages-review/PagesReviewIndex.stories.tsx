import type { Meta, StoryObj } from '@storybook/react'

const reviewLinks = [
  { label: 'Workspaces List', path: '/story/pages-review-workspaces-list--default' },
  { label: 'Workspaces Data Library', path: '/story/pages-review-workspaces-data-library--default' },
  { label: 'Manuscript', path: '/story/pages-review-manuscript--default' },
  { label: 'Manuscript Tables', path: '/story/pages-review-manuscript-tables--default' },
  { label: 'Profile Publications', path: '/story/pages-review-profile-publications--default' },
  { label: 'Profile Collaboration', path: '/story/pages-review-profile-collaboration--default' },
  { label: 'Study Core Wizard', path: '/story/pages-review-study-core-wizard--default' },
  { label: 'Results Data', path: '/story/pages-review-results-data--default' },
]

const checklist = [
  'Layout',
  'Spacing',
  'Buttons',
  'Inputs',
  'Select/Textarea',
  'Table headers',
  'Toolbars',
]

const meta = {
  title: 'Pages Review/Index',
  parameters: {
    layout: 'fullscreen',
    withRouter: false,
  },
} satisfies Meta

export default meta
type Story = StoryObj

export const Overview: Story = {
  render: () => (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
        <section className="rounded-md border border-border bg-card p-4">
          <h1 className="text-lg font-semibold">Pages Review</h1>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {reviewLinks.map((item) => (
              <a
                key={item.path}
                href={`?path=${item.path}`}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
              >
                {item.label}
              </a>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Checklist</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {checklist.map((item) => (
              <span key={item} className="rounded border border-border bg-background px-2 py-1 text-xs">
                {item}
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  ),
}
