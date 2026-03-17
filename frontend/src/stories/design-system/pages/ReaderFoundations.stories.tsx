import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react'

const meta = {
  title: 'Design System / Pages / Reader Foundations',
  parameters: {
    layout: 'fullscreen',
    withRouter: false,
  },
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function ReaderFoundationsPreview() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,hsl(var(--tone-neutral-50)/0.86)_0%,hsl(var(--tone-neutral-100)/0.38)_100%)] px-8 py-10">
      <div className="mx-auto grid max-w-[90rem] grid-cols-[16rem_minmax(0,1fr)_24rem] gap-6">
        <aside className="px-3 pb-6 pt-14">
          <div className="reader-nav-shell sticky top-8">
            <div className="reader-nav-groups">
              <div className="space-y-1.5">
                <div
                  className="reader-nav-group-row reader-nav-group-row--active"
                  style={{ backgroundColor: 'rgba(36, 87, 166, 0.095)' }}
                >
                  <span className="reader-nav-group-rail" style={{ backgroundColor: '#2457a6' }} />
                  <button type="button" className="min-w-0 flex-1 text-left">
                    <span className="reader-nav-group-label">Abstract</span>
                  </button>
                </div>
                <div className="reader-nav-group-row" style={{ ['--reader-nav-hover-fill' as string]: 'rgba(66, 82, 107, 0.045)' }}>
                  <span className="reader-nav-group-rail" />
                  <button type="button" className="min-w-0 flex-1 text-left">
                    <span className="reader-nav-group-label">Introduction</span>
                  </button>
                </div>
                <div className="space-y-1.5">
                  <div className="reader-nav-group-row" style={{ ['--reader-nav-hover-fill' as string]: 'rgba(33, 112, 74, 0.045)' }}>
                    <span className="reader-nav-group-rail" />
                    <button type="button" className="min-w-0 flex-1 text-left">
                      <span className="reader-nav-group-label">Methods</span>
                    </button>
                    <button type="button" className="reader-nav-toggle">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div
                    className="reader-nav-group-row reader-nav-group-row--active"
                    style={{ backgroundColor: 'rgba(154, 90, 11, 0.095)' }}
                  >
                    <span className="reader-nav-group-rail" style={{ backgroundColor: '#9a5a0b' }} />
                    <button type="button" className="min-w-0 flex-1 text-left">
                      <span className="reader-nav-group-label">Results</span>
                    </button>
                    <button type="button" className="reader-nav-toggle rotate-90" style={{ color: '#9a5a0b' }}>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="reader-nav-subtree ml-4 space-y-1" style={{ borderColor: 'rgba(154, 90, 11, 0.18)' }}>
                    <button
                      type="button"
                      className="reader-nav-subitem reader-nav-subitem--active"
                      style={{ backgroundColor: 'rgba(154, 90, 11, 0.065)' }}
                    >
                      <span className="reader-nav-subitem-rail" style={{ backgroundColor: 'rgba(154, 90, 11, 0.9)' }} />
                      <span className="reader-nav-subitem-label" style={{ color: '#9a5a0b' }}>Study population</span>
                    </button>
                    <button type="button" className="reader-nav-subitem">
                      <span className="reader-nav-subitem-rail" />
                      <span className="reader-nav-subitem-label">CMR findings</span>
                    </button>
                  </div>
                </div>
                <div className="reader-nav-group-row">
                  <span className="reader-nav-group-rail" />
                  <button type="button" className="min-w-0 flex-1 text-left">
                    <span className="reader-nav-group-label">Discussion</span>
                  </button>
                  <button type="button" className="reader-nav-toggle">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="reader-nav-group-row">
                  <span className="reader-nav-group-rail" />
                  <button type="button" className="min-w-0 flex-1 text-left">
                    <span className="reader-nav-group-label">Conclusions</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="reader-nav-divider">
              <div className="reader-nav-groups">
                <div className="reader-nav-group-row">
                  <span className="reader-nav-group-rail" />
                  <button type="button" className="min-w-0 flex-1 text-left">
                    <span className="reader-nav-group-label">Tables</span>
                  </button>
                </div>
                <div className="reader-nav-group-row">
                  <span className="reader-nav-group-rail" />
                  <button type="button" className="min-w-0 flex-1 text-left">
                    <span className="reader-nav-group-label">Figures</span>
                  </button>
                </div>
                <div className="reader-nav-group-row">
                  <span className="reader-nav-group-rail" />
                  <button type="button" className="min-w-0 flex-1 text-left">
                    <span className="reader-nav-group-label">References</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="space-y-8">
          <section className="reader-major-panel-shell">
            <div className="reader-major-panel-accent bg-[#2457a6]" />
            <div className="reader-major-panel-header">
              <div className="reader-major-panel-header-inner" data-reader-measure="narrative">
                <h2 className="reader-major-panel-title">Abstract</h2>
              </div>
            </div>
            <div className="reader-major-panel-body">
              <div className="reader-major-panel-body-inner" data-reader-measure="narrative">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-[1.02rem] font-semibold text-[hsl(var(--tone-neutral-800))]">Objectives</h3>
                    <p className="text-[0.96rem] leading-[1.85] text-[hsl(var(--tone-neutral-700))]">
                      To evaluate the incremental diagnostic value and sub-phenotyping capability of cardiovascular magnetic resonance compared with transthoracic echocardiography in patients with elevated left ventricular filling pressure.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-[1.02rem] font-semibold text-[hsl(var(--tone-neutral-800))]">Results</h3>
                    <p className="text-[0.96rem] leading-[1.85] text-[hsl(var(--tone-neutral-700))]">
                      CMR demonstrated diagnostic discordance with TTE in 74% of cases and revealed HFpEF, ischaemic heart disease, and cardiomyopathy in patients whose echocardiographic findings were normal or non-diagnostic.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="reader-supplement-panel-shell">
            <div className="reader-supplement-panel-header">
              <div className="reader-supplement-panel-header-inner">
                <div className="reader-supplement-panel-header-row">
                  <span className="reader-supplement-panel-icon">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="reader-supplement-panel-eyebrow">Journal note</p>
                    <h2 className="reader-supplement-panel-title">Strengths and limitations of this study</h2>
                  </div>
                </div>
              </div>
            </div>
            <div className="reader-supplement-panel-body">
              <div className="reader-supplement-panel-body-inner">
                <p className="text-[0.94rem] leading-[1.85] text-[hsl(var(--tone-neutral-700))]">
                  Prospective design with data from a real-world clinical registry, balanced against a single-centre cohort and a non-invasive filling-pressure equation without invasive validation.
                </p>
              </div>
            </div>
          </section>

          <section className="reader-major-panel-shell">
            <div className="reader-major-panel-accent bg-[#6b5946]" />
            <div className="reader-major-panel-header">
              <div className="reader-major-panel-header-inner" data-reader-measure="full">
                <h2 className="reader-major-panel-title">References</h2>
              </div>
            </div>
            <div className="reader-major-panel-body">
              <div className="reader-major-panel-body-inner" data-reader-measure="full">
                <ol className="reader-reference-list">
                  <li className="reader-reference-item">
                    <span className="reader-reference-index">1</span>
                    <div className="reader-reference-content">
                      <p className="reader-reference-title">The year in cardiovascular medicine 2021: heart failure and cardiomyopathies.</p>
                      <p className="reader-reference-authors">Bauersachs J, de Boer RA, Lindenfeld J, et al.</p>
                      <p className="reader-reference-source">European Heart Journal. 2022;43:367-76.</p>
                      <div className="reader-reference-links">
                        <a href="/" className="reader-reference-link">DOI: 10.1093/eurheartj/ehab887</a>
                        <a href="/" className="reader-reference-link">PMID: 34974611</a>
                      </div>
                    </div>
                  </li>
                  <li className="reader-reference-item">
                    <span className="reader-reference-index">2</span>
                    <div className="reader-reference-content">
                      <p className="reader-reference-title">2022 AHA/ACC/HFSA Guideline for the Management of Heart Failure: A Report of the American College of Cardiology/American Heart Association Joint Committee on Clinical Practice Guidelines.</p>
                      <p className="reader-reference-authors">Heidenreich PA, Bozkurt B, Aguilar D, et al.</p>
                      <p className="reader-reference-source">Circulation. 2022;145:e895-1032.</p>
                      <div className="reader-reference-links">
                        <a href="/" className="reader-reference-link">DOI: 10.1161/CIR.0000000000001063</a>
                        <a href="/" className="reader-reference-link">PMID: 35363499</a>
                      </div>
                    </div>
                  </li>
                </ol>
              </div>
            </div>
          </section>
        </main>

        <aside className="reader-inspector-shell">
          <div className="reader-inspector-expanded">
            <div className="flex items-center justify-end">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--tone-neutral-250))] bg-white text-[hsl(var(--tone-neutral-600))]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="reader-inspector-scroll">
              <section className="reader-inspector-section">
                <p className="reader-inspector-label">Tools</p>
                <p className="reader-inspector-copy">Reader tools will live here.</p>
              </section>
              <section className="reader-inspector-section">
                <p className="reader-inspector-reference-title">2022 AHA/ACC/HFSA Guideline for the Management of Heart Failure.</p>
                <p className="reader-inspector-reference-authors">Heidenreich PA, Bozkurt B, Aguilar D, et al.</p>
                <p className="reader-inspector-reference-source">Circulation. 2022;145:e895-1032.</p>
                <div className="reader-inspector-reference-links">
                  <a href="/" className="reader-inspector-reference-link">DOI: 10.1161/CIR.0000000000001063</a>
                  <a href="/" className="reader-inspector-reference-link">PMID: 35363499</a>
                </div>
                <div className="reader-inspector-usage">
                  <div className="reader-inspector-usage-row">
                    <p className="reader-inspector-usage-text">
                      Mention 1 of 2 in <button type="button" className="reader-inspector-usage-link">Introduction</button>
                    </p>
                    <div className="reader-inspector-usage-actions">
                      <button type="button" className="inline-flex h-7 items-center gap-1 px-1 text-[0.75rem] text-[hsl(var(--tone-neutral-650))]">
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Previous
                      </button>
                      <button type="button" className="inline-flex h-7 items-center gap-1 px-1 text-[0.75rem] text-[hsl(var(--tone-neutral-650))]">
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export const ApprovedReaderVisualContract: Story = {
  render: () => <ReaderFoundationsPreview />,
}
