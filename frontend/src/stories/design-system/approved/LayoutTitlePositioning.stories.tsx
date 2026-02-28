import type { Meta, StoryObj } from '@storybook/react'

const meta: Meta = {
  title: 'Design System/APPROVED/Layout/Title Positioning',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Approved title positioning reference. Values are sourced directly from CSS layout tokens.',
      },
    },
  },
}

export default meta

type Story = StoryObj

function TitlePositioningReference() {
  return (
    <div className="min-h-screen bg-white p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Approved Layout</h1>
          <p className="text-sm text-neutral-600">Title positioning (CSS source-of-truth)</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-neutral-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Desktop top offset</p>
            <p className="mt-1 text-sm font-medium text-neutral-900">
              <code>--content-container-anchor-offset</code>
            </p>
          </div>
          <div className="rounded-md border border-neutral-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Desktop +md top offset</p>
            <p className="mt-1 text-sm font-medium text-neutral-900">
              <code>--content-container-anchor-offset-md</code>
            </p>
          </div>
          <div className="rounded-md border border-neutral-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Fluid top offset</p>
            <p className="mt-1 text-sm font-medium text-neutral-900">
              <code>--content-container-fluid-anchor-offset</code>
            </p>
          </div>
          <div className="rounded-md border border-neutral-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Fluid +md top offset</p>
            <p className="mt-1 text-sm font-medium text-neutral-900">
              <code>--content-container-fluid-anchor-offset-md</code>
            </p>
          </div>
          <div className="rounded-md border border-neutral-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Title marker inset</p>
            <p className="mt-1 text-sm font-medium text-neutral-900">
              <code>--page-title-marker-inset-block</code>
            </p>
          </div>
        </div>

        <div className="rounded-md border border-neutral-200 bg-card p-4">
          <p className="text-xs text-neutral-600 mb-3">
            Preview: title anchor alignment against header and left panel.
          </p>
          <div className="grid grid-cols-[280px_1fr] gap-4">
            <aside className="rounded-md border border-border bg-background p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Left panel</p>
            </aside>
            <main className="rounded-md border border-border bg-background p-3">
              <div className="approved-layout-title-anchor house-page-header house-left-border house-left-border-workspace">
                <h3 data-house-role="page-title" className="house-title text-[1.35rem] leading-[1.5rem]">Publications</h3>
                <p className="text-xs text-neutral-600">Canonical content title placement</p>
              </div>
            </main>
          </div>
        </div>
      </div>
      <style>{`
        .approved-layout-title-anchor {
          margin-top: var(--content-container-anchor-offset);
        }
        @media (min-width: 768px) {
          .approved-layout-title-anchor {
            margin-top: var(--content-container-anchor-offset-md);
          }
        }
      `}</style>
    </div>
  )
}

export const Approved: Story = {
  render: () => <TitlePositioningReference />,
}
