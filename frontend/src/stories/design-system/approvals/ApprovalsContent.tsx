import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronUp, ChevronsUpDown, Download, Eye, EyeOff, FileText, Filter, Hammer, Pencil, Plus, Search, Settings, Share2, X } from 'lucide-react'

import {
  Container,
  Grid,
  PageHeader,
  Row,
  Section,
  SectionHeader,
  Stack,
  Subheading,
} from '@/components/primitives'
import {
  Badge,
  Banner,
  BannerContent,
  BannerDescription,
  BannerTitle,
  Button,
  DrilldownSheet,
  IconButton,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  Toolbar,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui'
import {
  ChartFrame,
  HelpTooltipIconButton,
  InsightsGlyph,
  PanelShell,
  SectionMarker,
  SectionToolDivider,
  SectionToolIconButton,
  SectionTools,
  useChartMotion,
  useChartTheme,
} from '@/components/patterns'

type RGB = { r: number; g: number; b: number }

const CORE_COLOR_TOKENS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--muted',
  '--muted-foreground',
  '--border',
  '--ring',
  '--primary',
  '--primary-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--status-ok',
  '--status-warn',
  '--status-danger',
] as const

const NEUTRAL_RAMP_TOKENS = [
  '--tone-neutral-50',
  '--tone-neutral-100',
  '--tone-neutral-200',
  '--tone-neutral-300',
  '--tone-neutral-400',
  '--tone-neutral-500',
  '--tone-neutral-600',
  '--tone-neutral-700',
  '--tone-neutral-800',
  '--tone-neutral-900',
  '--tone-neutral-950',
] as const

const ACCENT_RAMP_TOKENS = [
  '--tone-accent-50',
  '--tone-accent-100',
  '--tone-accent-200',
  '--tone-accent-300',
  '--tone-accent-400',
  '--tone-accent-500',
  '--tone-accent-600',
  '--tone-accent-700',
  '--tone-accent-800',
  '--tone-accent-900',
] as const

const STATUS_RAMP_TOKENS = [
  '--tone-positive-50',
  '--tone-positive-100',
  '--tone-positive-200',
  '--tone-positive-300',
  '--tone-positive-400',
  '--tone-positive-500',
  '--tone-positive-600',
  '--tone-warning-200',
  '--tone-warning-400',
  '--tone-warning-600',
  '--tone-danger-200',
  '--tone-danger-400',
  '--tone-danger-600',
] as const

const SPACING_TOKENS = [
  '--space-0',
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--space-7',
  '--space-8',
] as const

const BASE_SEPARATOR_TOKENS = [
  '--separator-page-header-to-section-header',
  '--separator-section-header-to-section-content',
  '--separator-section-content-to-section-header',
  '--separator-drilldown-header-to-content',
  '--separator-drilldown-heading-block-to-content',
  '--separator-drilldown-controls-row-to-chart',
  '--separator-drilldown-content-to-heading-block',
  '--separator-drilldown-summary-grid-to-content-top',
  '--separator-left-panel-subheading-to-content',
  '--separator-left-panel-content-to-subheading',
] as const

const SEPARATOR_TOKENS = [...BASE_SEPARATOR_TOKENS] as const
type SeparatorToken = (typeof SEPARATOR_TOKENS)[number]

const SEPARATOR_TOKEN_DEFINITIONS: Record<SeparatorToken, string> = {
  '--separator-page-header-to-section-header': 'Main page: PageHeader (title block) → first SectionHeader (heading block)',
  '--separator-section-header-to-section-content': 'Main page: SectionHeader (heading block) → section body content',
  '--separator-section-content-to-section-header': 'Main page: section body content → next SectionHeader (heading block)',
  '--separator-drilldown-header-to-content': 'Drilldown: header navigation block → first content block (including first section heading)',
  '--separator-drilldown-heading-block-to-content': 'Drilldown: section heading block → section content block',
  '--separator-drilldown-controls-row-to-chart': 'Drilldown: controls row (window + visual toggles) → trend chart block',
  '--separator-drilldown-content-to-heading-block': 'Drilldown: section content block → next section heading block',
  '--separator-drilldown-summary-grid-to-content-top': 'Drilldown: summary grid → top content area',
  '--separator-left-panel-subheading-to-content': 'Left panel: subheading block → content block',
  '--separator-left-panel-content-to-subheading': 'Left panel: content block → subheading block',
}

const RADIUS_TOKENS = ['--radius-xs', '--radius-sm', '--radius-md', '--radius-lg', '--radius-full'] as const
const ELEVATION_TOKENS = ['--elevation-none', '--elevation-xs', '--elevation-sm', '--elevation-md', '--elevation-lg'] as const
const MOTION_DURATION_TOKENS = [
  '--motion-duration-fast',
  '--motion-duration-ui',
  '--motion-duration-base',
  '--motion-duration-slow',
  '--motion-duration-slower',
  '--motion-duration-emphasis',
] as const
const MOTION_EASE_TOKENS = ['--motion-ease-default', '--motion-ease-elastic', '--motion-ease-chart-series'] as const

const APPROVAL_CONTRACT_ITEMS = [
  'Single source of truth: this page is the only active approval surface in Storybook.',
  'Canonical imports only: primitives, ui, and patterns barrels.',
  'No ad-hoc tokens, no deep imports, and no legacy composition in approval examples.',
  'Each control is reviewed as a state matrix, not an isolated happy-path sample.',
]

const CANONICAL_SPACING_ELEMENTS = [
  {
    element: 'PageHeader',
    role: 'Title block',
    canonicalUse: 'Primary page title + description block that anchors top rhythm.',
    dimensions: '--separator-page-header-to-section-header',
  },
  {
    element: 'SectionHeader',
    role: 'Heading block',
    canonicalUse: 'Section heading + helper text immediately above section body content.',
    dimensions: '--separator-section-header-to-section-content + --separator-section-content-to-section-header',
  },
  {
    element: 'Section body (first non-header child)',
    role: 'Content block',
    canonicalUse: 'Content area after SectionHeader, typically Stack/Grid/Table/PanelShell.',
    dimensions: 'Inherits adjacent separator tokens + local content padding',
  },
  {
    element: 'Drilldown heading block',
    role: 'Drilldown section heading',
    canonicalUse: 'Subsection heading inside drilldowns (e.g., Headline results, Publication trends).',
    dimensions: '--separator-drilldown-heading-block-to-content + --separator-drilldown-content-to-heading-block',
  },
  {
    element: 'Drilldown controls row',
    role: 'Toggle controls → chart separation',
    canonicalUse: 'Controls line above trend chart in drilldown content (e.g., window + visual mode toggles).',
    dimensions: '--separator-drilldown-controls-row-to-chart',
  },
  {
    element: 'Drilldown tab panel root',
    role: 'Drilldown nav-to-content bridge',
    canonicalUse: 'First content container immediately under drilldown navigation tabs.',
    dimensions: '--separator-drilldown-header-to-content',
  },
  {
    element: 'Section',
    role: 'Scaffold',
    canonicalUse: 'Container for heading + content; manages surface, inset, and internal spacing.',
    dimensions: 'Section spaceY + separator tokens',
  },
  {
    element: 'Container',
    role: 'Page scaffold',
    canonicalUse: 'Outer page width and gutter scaffold; not part of title→heading semantic pair.',
    dimensions: 'Container size + gutter tokens',
  },
] as const

const APPROVAL_SECTION_LINKS = [
  { id: 'approvals-control-bar', label: '0. Sticky Controls', note: 'Theme, motion, baseline grid' },
  { id: 'approvals-foundations', label: '1. Foundations', note: 'Color, type, spacing, motion tokens' },
  { id: 'approvals-icons', label: '2. Icons', note: 'Sizes, currentColor, icon button states' },
  { id: 'approvals-recipes', label: '3. Recipes', note: 'Page + drilldown scaffolds' },
  { id: 'approvals-controls', label: '4. Controls', note: 'State matrices and compounds' },
  { id: 'approvals-metrics-motion', label: '5. Metric + Motion', note: 'Chart/toggle patterns + audit' },
  { id: 'approvals-glossary', label: '6. Glossary', note: 'Element definitions + governance' },
] as const

const PUBLICATION_LIBRARY_DEMO_COLUMNS = [
  { key: 'title', label: 'Title', width: 360 },
  { key: 'year', label: 'Year', width: 92 },
  { key: 'journal', label: 'Journal', width: 260 },
  { key: 'citations', label: 'Citations', width: 136 },
] as const

const PUBLICATION_LIBRARY_DEMO_ROWS = [
  {
    id: 'pub-row-1',
    title: 'Predictive modeling in translational cardiology',
    year: '2025',
    journal: 'Journal of Clinical Modelling',
    citations: '34',
    publicationType: 'Journal article',
    articleType: 'Original research',
  },
  {
    id: 'pub-row-2',
    title: 'Adaptive trial design with multimodal endpoints',
    year: '2024',
    journal: 'BMJ Digital Health',
    citations: '19',
    publicationType: 'Journal article',
    articleType: 'Clinical trial',
  },
  {
    id: 'pub-row-3',
    title: 'Open data quality indicators for publication analytics',
    year: '2023',
    journal: 'Data Systems Review',
    citations: '11',
    publicationType: 'Review',
    articleType: 'Systematic review',
  },
] as const

const PUBLICATION_DRILLDOWN_SUMMARY_TABLE_ROWS = [
  { id: 'summary-table-row-1', journal: 'Wellcome Open Research', count: 7, share: '14.6%', avgCites: '8.3' },
  { id: 'summary-table-row-2', journal: 'Open Heart', count: 6, share: '12.5%', avgCites: '6.1' },
  { id: 'summary-table-row-3', journal: 'European Heart Journal', count: 5, share: '10.4%', avgCites: '12.2' },
  { id: 'summary-table-row-4', journal: 'BMJ Open', count: 4, share: '8.3%', avgCites: '5.8' },
] as const

type PublicationLibraryDemoColumnKey = (typeof PUBLICATION_LIBRARY_DEMO_COLUMNS)[number]['key']
type PublicationLibraryDemoSortDirection = 'asc' | 'desc'

const PUBLICATION_LIBRARY_DEMO_COLUMN_MIN_WIDTH: Record<PublicationLibraryDemoColumnKey, number> = {
  title: 240,
  year: 88,
  journal: 220,
  citations: 128,
}

const PUBLICATION_LIBRARY_DEMO_COLUMN_DEFAULTS: Record<PublicationLibraryDemoColumnKey, { visible: boolean; width: number }> = {
  title: { visible: true, width: 360 },
  year: { visible: true, width: 92 },
  journal: { visible: true, width: 260 },
  citations: { visible: true, width: 136 },
}

const METRIC_TILE_CONTRACT_ITEMS = [
  'Tile shell uses house-metric-tile-shell with tokenized background, border, and selected states.',
  'Tile chart surface uses house-metric-tile-chart-surface and follows shell hover/selected inheritance.',
  'Motion timing must use --motion-duration-* tokens and --motion-ease-* tokens only.',
  'Window-mode chart transitions (1y/3y/5y/life) are class/token-driven; avoid per-bar inline transition duration/delay overrides.',
  'Publication trends line mode represents cumulative total publications over the selected period (growing over time).',
  'Reduced-motion mode must disable choreography and preserve immediate state clarity.',
  'Chart tooltips use canonical Tooltip primitives and are keyboard-focusable.',
  'Banners and segmented toggles are approved as reusable controls outside publications.',
] as const

const FIELD_THRESHOLD_OPTIONS = [50, 75, 90, 95, 99] as const

const FIELD_THRESHOLD_THUMB_CLASS: Record<(typeof FIELD_THRESHOLD_OPTIONS)[number], string> = {
  50: 'house-toggle-thumb-threshold-50',
  75: 'house-toggle-thumb-threshold-75',
  90: 'house-toggle-thumb-threshold-90',
  95: 'house-toggle-thumb-threshold-95',
  99: 'house-toggle-thumb-threshold-99',
}

const ANIMATION_AUDIT_ROWS = [
  {
    status: 'Pass',
    item: 'Tokenized duration and easing',
    requirement: 'All transitions reference --motion-duration-* and --motion-ease-* tokens.',
    scope: 'Tile shell, chart surface, drilldown controls',
    evidence: 'Computed styles from approvals and live page probes',
  },
  {
    status: 'Pass',
    item: 'Reduced-motion compliance',
    requirement: 'No staggered choreography when reduced motion is enabled.',
    scope: 'Tile entry, chart morphing, tooltip transitions',
    evidence: 'Approvals reduced-motion toggle + visual check',
  },
  {
    status: 'Partial',
    item: 'Interaction latency budget',
    requirement: 'Primary feedback starts within 150ms and completes within 700ms.',
    scope: 'Hover, selection, tab toggles, panel reveal',
    evidence: 'Most transitions are tokenized; tile entry currently uses a 1000ms JS constant.',
  },
  {
    status: 'Pass',
    item: 'Tooltip accessibility',
    requirement: 'Tooltip trigger supports hover and keyboard focus with visible content.',
    scope: 'Bars, points, interactive chart marks',
    evidence: 'Canonical chart-tooltip sample in approvals',
  },
  {
    status: 'Partial',
    item: 'Timing source consistency',
    requirement: 'Avoid hard-coded timing constants in JS where token mapping can drift.',
    scope: 'Chart refresh/toggle orchestration hooks',
    evidence: 'PublicationsTopStrip defines TILE_MOTION_* constants and mirrors them into CSS vars at runtime.',
  },
  {
    status: 'Pass',
    item: 'Cross-feature reusability',
    requirement: 'Toggle and banner patterns are represented without publications-only copy.',
    scope: 'Workspace, profile, and future drilldown variants',
    evidence: 'Matrix rows in approvals canonical controls',
  },
] as const

const GLOSSARY_ROWS = [
  {
    element: 'Container',
    category: 'Primitive',
    maySet: 'size, gutter',
    mustNotSet: 'custom widths outside tokenized container scales',
    whereUsed: 'Page scaffold, panel wrappers',
  },
  {
    element: 'Section / Stack / Row / Grid',
    category: 'Primitive',
    maySet: 'surface, inset, spacing, layout density',
    mustNotSet: 'ad-hoc spacing tokens or unapproved display hacks',
    whereUsed: 'All approval matrices and recipe compositions',
  },
  {
    element: 'PageHeader / SectionHeader / Subheading',
    category: 'Semantic block',
    maySet: 'eyebrow, heading, description, actions',
    mustNotSet: 'unstyled heading stacks that bypass semantic primitives',
    whereUsed: 'Foundations typography and scaffold recipes',
  },
  {
    element: 'Button, Input, Select, Textarea, Tooltip, Badge, Banner, Modal',
    category: 'Canonical controls',
    maySet: 'variants, disabled/loading/error/open states',
    mustNotSet: 're-styled uncontrolled forks of base controls',
    whereUsed: 'Canonical controls matrix',
  },
  {
    element: 'SectionMarker, PanelShell, ChartFrame',
    category: 'Pattern',
    maySet: 'tone, heading, description, tokenized shell actions',
    mustNotSet: 'legacy panel composition or non-canonical shells',
    whereUsed: 'Structural recipes and patterns showcase',
  },
  {
    element: 'Toolbar',
    category: 'Compound',
    maySet: 'density, justify, Toolbar.Group, Toolbar.Actions, Toolbar.Spacer, Toolbar.Divider',
    mustNotSet: 'manual flex layouts with house-page-toolbar class',
    whereUsed: 'Page-level action bars, filter toolbars',
  },
  {
    element: 'DrilldownSheet',
    category: 'Compound',
    maySet: 'open, onOpenChange, DrilldownSheet.Title, DrilldownSheet.Heading, DrilldownSheet.Content, DrilldownSheet.StatCard, DrilldownSheet.Row, DrilldownSheet.Alert, DrilldownSheet.Placeholder',
    mustNotSet: 'raw Sheet with manual houseDrilldown classes',
    whereUsed: 'Side-panel detail views, publication/profile drilldowns',
  },
] as const

function parseRgb(input: string): RGB | null {
  const match = input.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) {
    return null
  }
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
  }
}

function rgbToHex(rgb: RGB | null): string {
  if (!rgb) {
    return '—'
  }
  const toHex = (value: number) => value.toString(16).padStart(2, '0').toUpperCase()
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
}

function luminance(rgb: RGB): number {
  const transform = (value: number) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }
  return (0.2126 * transform(rgb.r)) + (0.7152 * transform(rgb.g)) + (0.0722 * transform(rgb.b))
}

function contrastRatio(left: RGB, right: RGB): number {
  const light = Math.max(luminance(left), luminance(right))
  const dark = Math.min(luminance(left), luminance(right))
  return (light + 0.05) / (dark + 0.05)
}

function parseLengthPx(value: string, rootFontPx: number): number | null {
  const raw = String(value || '').trim()
  if (!raw) {
    return null
  }
  if (raw.endsWith('rem')) {
    return Number.parseFloat(raw) * rootFontPx
  }
  if (raw.endsWith('px')) {
    return Number.parseFloat(raw)
  }
  return null
}

function formatLength(value: string, rootFontPx: number): string {
  const px = parseLengthPx(value, rootFontPx)
  if (px === null || !Number.isFinite(px)) {
    return value || '—'
  }
  const rem = px / rootFontPx
  return `${px.toFixed(px % 1 === 0 ? 0 : 2)}px (${rem.toFixed(rem % 1 === 0 ? 0 : 3)}rem)`
}

function resolveCssVars(tokens: readonly string[]): Record<string, string> {
  if (typeof document === 'undefined') {
    return {}
  }
  const styles = getComputedStyle(document.documentElement)
  return tokens.reduce<Record<string, string>>((acc, token) => {
    acc[token] = styles.getPropertyValue(token).trim()
    return acc
  }, {})
}

function MatrixCell({
  title,
  note,
  spec,
  children,
}: {
  title: string
  note: string
  spec?: string
  children: ReactNode
}) {
  return (
    <Section surface="card" inset="sm" spaceY="sm">
      <Stack space="sm">
        <Stack space="sm">
          <div className="text-label font-medium text-[hsl(var(--foreground))]">{title}</div>
          <div className="text-caption text-[hsl(var(--muted-foreground))]">{note}</div>
          {spec ? <div className="text-caption text-[hsl(var(--foreground))]">Spec cue: {spec}</div> : null}
        </Stack>
        {children}
      </Stack>
    </Section>
  )
}

function BackToTopLink() {
  return (
    <div className="pt-[var(--space-2)]">
      <a
        href="#approvals-top"
        className="text-caption text-[hsl(var(--accent-foreground))] underline-offset-2 hover:underline"
      >
        Back to top
      </a>
    </div>
  )
}

function DrilldownSheetDemo() {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('summary')
  return (
    <Stack space="md">
      {/* Open Button */}
      <Button variant="outline" onClick={() => setIsOpen(true)}>
        Open Drilldown (Publications)
      </Button>

      {/* Drilldown Sheet (scaled title with canonical expander) */}
      <DrilldownSheet open={isOpen} onOpenChange={setIsOpen}>
        <DrilldownSheet.Header
          title="Total publication insights"
          subtitle="A summary of your publication metrics"
          variant="publications"
          alert={activeTab === 'summary' ? <p className="text-sm text-amber-700">Showing 2024 data</p> : undefined}
        >
          <DrilldownSheet.Tabs activeTab={activeTab} onTabChange={setActiveTab} tone="profile">
            <DrilldownSheet.Tab id="summary">Summary</DrilldownSheet.Tab>
            <DrilldownSheet.Tab id="breakdown">Breakdown</DrilldownSheet.Tab>
            <DrilldownSheet.Tab id="trajectory">Trajectory</DrilldownSheet.Tab>
            <DrilldownSheet.Tab id="context">Context</DrilldownSheet.Tab>
          </DrilldownSheet.Tabs>
        </DrilldownSheet.Header>

        <DrilldownSheet.TabPanel id={activeTab} isActive={activeTab === 'summary'}>
          <DrilldownSheet.Heading>Metric Overview</DrilldownSheet.Heading>
          <DrilldownSheet.Row>
            <DrilldownSheet.StatCard title="Citations" value="342" emphasis />
            <DrilldownSheet.StatCard title="Publications" value="18" />
          </DrilldownSheet.Row>
          <DrilldownSheet.Alert variant="info">Data refreshed 2 hours ago</DrilldownSheet.Alert>
        </DrilldownSheet.TabPanel>

        <DrilldownSheet.TabPanel id={activeTab} isActive={activeTab === 'breakdown'}>
          <DrilldownSheet.Heading>By Publication Type</DrilldownSheet.Heading>
          <DrilldownSheet.Row>
            <DrilldownSheet.StatCard title="Journal Articles" value="12" />
            <DrilldownSheet.StatCard title="Conferences" value="6" />
          </DrilldownSheet.Row>
          <DrilldownSheet.Placeholder>Detailed breakdown visualization goes here</DrilldownSheet.Placeholder>
        </DrilldownSheet.TabPanel>

        <DrilldownSheet.TabPanel id={activeTab} isActive={activeTab === 'trajectory'}>
          <DrilldownSheet.Heading>Citation Growth Trend</DrilldownSheet.Heading>
          <Stack space="sm">
            <DrilldownSheet.Row active>
              <div className="flex-1 text-sm">Last 12 months</div>
              <div className="text-sm font-semibold text-green-700">+28%</div>
            </DrilldownSheet.Row>
            <DrilldownSheet.Row>
              <div className="flex-1 text-sm">Previous year</div>
              <div className="text-sm">+12%</div>
            </DrilldownSheet.Row>
          </Stack>
          <DrilldownSheet.Placeholder>Chart visualization goes here</DrilldownSheet.Placeholder>
        </DrilldownSheet.TabPanel>

        <DrilldownSheet.TabPanel id={activeTab} isActive={activeTab === 'context'}>
          <DrilldownSheet.Heading>Field Percentiles</DrilldownSheet.Heading>
          <Stack space="sm">
            <DrilldownSheet.Row>
              <div className="flex-1 text-sm">Top 25% (75th percentile)</div>
              <div className="text-sm font-semibold">185 citations</div>
            </DrilldownSheet.Row>
            <DrilldownSheet.Row>
              <div className="flex-1 text-sm">Top 50% (median)</div>
              <div className="text-sm font-semibold">42 citations</div>
            </DrilldownSheet.Row>
          </Stack>
        </DrilldownSheet.TabPanel>
      </DrilldownSheet>

      {/* Typography Scale Reference */}
      <div className="rounded border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">Typography Scaling:</p>
        <p>Drilldown header scales only the title via <code>--drilldown-title-scale</code>; subtitle uses canonical <code>house-title-expander</code></p>
      </div>
    </Stack>
  )
}

function ColorTokenSwatch({
  token,
  rawValue,
  backgroundRgb,
  modeKey,
}: {
  token: string
  rawValue: string
  backgroundRgb: RGB | null
  modeKey: string
}) {
  const swatchRef = useRef<HTMLDivElement | null>(null)
  const [computedRgb, setComputedRgb] = useState<string>('—')
  const [computedHex, setComputedHex] = useState<string>('—')
  const [contrast, setContrast] = useState<string>('—')

  useEffect(() => {
    const swatch = swatchRef.current
    if (!swatch) {
      return
    }
    const styles = getComputedStyle(swatch)
    const rgbValue = styles.backgroundColor
    const parsed = parseRgb(rgbValue)
    setComputedRgb(rgbValue || '—')
    setComputedHex(rgbToHex(parsed))
    if (parsed && backgroundRgb) {
      setContrast(`${contrastRatio(parsed, backgroundRgb).toFixed(2)}:1`)
    } else {
      setContrast('—')
    }
  }, [backgroundRgb, modeKey, token])

  return (
    <Section surface="muted" inset="sm" spaceY="sm">
      <div
        ref={swatchRef}
        className="h-10 w-full rounded-[var(--radius-sm)] border border-[hsl(var(--border))]"
        style={{ backgroundColor: `hsl(var(${token}))` }}
      />
      <Stack space="sm">
        <div className="text-label font-medium">{token}</div>
        <div className="text-caption text-[hsl(var(--muted-foreground))]">Var: {rawValue || '—'}</div>
        <div className="text-caption">RGB: {computedRgb}</div>
        <div className="text-caption">HEX: {computedHex}</div>
        <div className="text-caption">Contrast vs background: {contrast}</div>
      </Stack>
    </Section>
  )
}

function MotionChip({
  label,
  durationVar,
  easeVar,
  reducedMotion,
}: {
  label: string
  durationVar: string
  easeVar: string
  reducedMotion: boolean
}) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (reducedMotion) {
      setActive(false)
      return
    }
    const timer = window.setInterval(() => {
      setActive((previous) => !previous)
    }, 1200)
    return () => window.clearInterval(timer)
  }, [reducedMotion])

  return (
    <div className="rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-[var(--space-2)]">
      <div className="text-caption text-[hsl(var(--muted-foreground))]">{label}</div>
      <div className="mt-[var(--space-2)] h-7 w-full rounded-[var(--radius-sm)] bg-[hsl(var(--background))] p-[var(--space-1)]">
        <div
          className="h-5 w-5 rounded-full bg-[hsl(var(--accent))]"
          style={{
            transform: active ? 'translateX(2.5rem)' : 'translateX(0rem)',
            transitionProperty: 'transform',
            transitionDuration: reducedMotion ? '0ms' : `var(${durationVar})`,
            transitionTimingFunction: `var(${easeVar})`,
          }}
        />
      </div>
    </div>
  )
}

function IconGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M7 12h10" />
    </svg>
  )
}

function PublicationLibraryTableDemo() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [visible, setVisible] = useState(true)
  const [stripedRows, setStripedRows] = useState(true)
  const [metricHighlights, setMetricHighlights] = useState(true)
  const [sortField, setSortField] = useState<PublicationLibraryDemoColumnKey>('year')
  const [sortDirection, setSortDirection] = useState<PublicationLibraryDemoSortDirection>('desc')
  const [columnWidths, setColumnWidths] = useState<Record<PublicationLibraryDemoColumnKey, number>>({
    title: PUBLICATION_LIBRARY_DEMO_COLUMN_DEFAULTS.title.width,
    year: PUBLICATION_LIBRARY_DEMO_COLUMN_DEFAULTS.year.width,
    journal: PUBLICATION_LIBRARY_DEMO_COLUMN_DEFAULTS.journal.width,
    citations: PUBLICATION_LIBRARY_DEMO_COLUMN_DEFAULTS.citations.width,
  })
  const [tableRefreshTick, setTableRefreshTick] = useState(0)

  const sortedRows = useMemo(() => {
    const rows = [...PUBLICATION_LIBRARY_DEMO_ROWS]
    rows.sort((left, right) => {
      const direction = sortDirection === 'asc' ? 1 : -1
      if (sortField === 'year' || sortField === 'citations') {
        const leftValue = Number.parseInt(left[sortField], 10)
        const rightValue = Number.parseInt(right[sortField], 10)
        if (leftValue === rightValue) {
          return left.title.localeCompare(right.title)
        }
        return (leftValue - rightValue) * direction
      }
      const leftValue = String(left[sortField]).toLowerCase()
      const rightValue = String(right[sortField]).toLowerCase()
      if (leftValue === rightValue) {
        return left.title.localeCompare(right.title)
      }
      return leftValue > rightValue ? direction : -direction
    })
    return rows
  }, [sortDirection, sortField])

  const onSortColumn = (column: PublicationLibraryDemoColumnKey) => {
    if (sortField === column) {
      setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSortField(column)
    setSortDirection(column === 'year' || column === 'citations' ? 'desc' : 'asc')
  }

  const onAutoFit = () => {
    setColumnWidths({
      title: PUBLICATION_LIBRARY_DEMO_COLUMN_DEFAULTS.title.width,
      year: PUBLICATION_LIBRARY_DEMO_COLUMN_DEFAULTS.year.width,
      journal: PUBLICATION_LIBRARY_DEMO_COLUMN_DEFAULTS.journal.width,
      citations: PUBLICATION_LIBRARY_DEMO_COLUMN_DEFAULTS.citations.width,
    })
    setTableRefreshTick((current) => current + 1)
  }

  const onResetTableSettings = () => {
    setStripedRows(true)
    setMetricHighlights(true)
    setSortField('year')
    setSortDirection('desc')
    onAutoFit()
  }

  return (
    <Stack space="sm">
      <Row align="center" gap="sm">
        <Badge>Canonical ui.Table</Badge>
        <Badge variant="outline">Publication library heading + table contract</Badge>
      </Row>

      <div className="ml-auto flex h-8 w-full items-center justify-end gap-1 overflow-visible self-center md:w-auto">
        <SectionTools tone="publications" framed={false} className="order-1">
          <SectionToolIconButton
            icon={<Search className="h-4 w-4" strokeWidth={2.1} />}
            aria-label={searchOpen ? 'Hide search' : 'Show search'}
            tooltip="Search"
            active={searchOpen}
            onClick={() => setSearchOpen((current) => !current)}
          />
          <SectionToolIconButton
            icon={<Filter className="h-4 w-4" strokeWidth={2.1} />}
            aria-label={filterOpen ? 'Hide filters' : 'Show filters'}
            tooltip="Filters"
            active={filterOpen}
            onClick={() => setFilterOpen((current) => !current)}
          />
        </SectionTools>

        <div
          className={[
            'relative order-2 overflow-visible transition-[max-width,opacity,transform] duration-[var(--motion-duration-ui)] ease-out',
            visible && toolsOpen
              ? 'z-30 max-w-[20rem] translate-x-0 opacity-100'
              : 'pointer-events-none z-0 max-w-0 translate-x-1 opacity-0',
          ].join(' ')}
          aria-hidden={!visible || !toolsOpen}
        >
          <div className="flex min-w-0 flex-nowrap gap-1 whitespace-nowrap">
            <div className="relative inline-flex">
              <Button type="button" variant="house" size="icon" className="peer h-8 w-8 house-publications-toolbox-item" aria-label="Generate publication library report">
                <FileText className="h-4 w-4" strokeWidth={2.1} />
              </Button>
            </div>
            <SectionToolDivider />
            <div className="relative inline-flex">
              <Button type="button" variant="house" size="icon" className="peer h-8 w-8 house-publications-toolbox-item" aria-label="Download publication library">
                <Download className="h-4 w-4" strokeWidth={2.1} />
              </Button>
            </div>
            <SectionToolDivider />
            <div className="relative inline-flex">
              <Button type="button" variant="house" size="icon" className="peer h-8 w-8 house-publications-toolbox-item" aria-label="Share publication library">
                <Share2 className="h-4 w-4" strokeWidth={2.1} />
              </Button>
            </div>
          </div>
        </div>

        <SectionTools tone="publications" framed={false} className="order-3">
          {visible ? (
            <button
              type="button"
              data-state={toolsOpen ? 'open' : 'closed'}
              className={[
                'order-4 h-8 w-8 shrink-0 house-publications-action-icon house-publications-top-control house-section-tool-button inline-flex items-center justify-center transition-[background-color,border-color,box-shadow] duration-[var(--motion-duration-ui)] ease-out',
                toolsOpen ? 'house-publications-tools-toggle-open' : '',
              ].join(' ')}
              onClick={() => setToolsOpen((current) => !current)}
              aria-pressed={toolsOpen}
              aria-expanded={toolsOpen}
              aria-label={toolsOpen ? 'Hide publication library tools' : 'Show publication library tools'}
            >
              <Hammer className="house-publications-tools-toggle-icon h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />
            </button>
          ) : null}
          {visible ? (
            <div className="relative order-5 shrink-0">
              <button
                type="button"
                data-state={settingsOpen ? 'open' : 'closed'}
                className={[
                  'h-8 w-8 house-publications-action-icon house-publications-top-control house-publications-settings-toggle house-section-tool-button inline-flex items-center justify-center transition-[background-color,border-color,box-shadow] duration-[var(--motion-duration-ui)] ease-out',
                  settingsOpen ? 'house-publications-tools-toggle-open' : '',
                ].join(' ')}
                onClick={() => setSettingsOpen((current) => !current)}
                aria-pressed={settingsOpen}
                aria-expanded={settingsOpen}
                aria-label={settingsOpen ? 'Hide publication library settings' : 'Show publication library settings'}
              >
                <Settings className="house-publications-tools-toggle-icon house-publications-settings-toggle-icon h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />
              </button>
              {settingsOpen ? (
                <div className="house-publications-filter-popover absolute right-[calc(100%+0.5rem)] top-0 z-30 w-[18.75rem]">
                  <div className="house-publications-filter-header">
                    <p className="house-publications-filter-title">Table settings</p>
                    <div className="inline-flex items-center gap-2">
                      <button type="button" className="house-publications-filter-clear" onClick={onAutoFit}>
                        Auto fit
                      </button>
                      <button type="button" className="house-publications-filter-clear" onClick={onResetTableSettings}>
                        Reset
                      </button>
                    </div>
                  </div>
                  <details className="house-publications-filter-group" open>
                    <summary className="house-publications-filter-summary">
                      <span>Visuals</span>
                      <span className="house-publications-filter-count">{(stripedRows ? 1 : 0) + (metricHighlights ? 1 : 0)}/2</span>
                    </summary>
                    <div className="house-publications-filter-options">
                      <label className="house-publications-filter-option">
                        <input type="checkbox" className="house-publications-filter-checkbox" checked={stripedRows} onChange={() => setStripedRows((current) => !current)} />
                        <span className="house-publications-filter-option-label">Alternate row shading</span>
                      </label>
                      <label className="house-publications-filter-option">
                        <input type="checkbox" className="house-publications-filter-checkbox" checked={metricHighlights} onChange={() => setMetricHighlights((current) => !current)} />
                        <span className="house-publications-filter-option-label">Metric highlights (citations)</span>
                      </label>
                    </div>
                  </details>
                </div>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            data-state={visible ? 'open' : 'closed'}
            className="order-6 h-8 w-8 shrink-0 house-publications-action-icon house-publications-top-control house-publications-eye-toggle house-section-tool-button inline-flex items-center justify-center"
            onClick={() => setVisible((current) => !current)}
            aria-pressed={visible}
            aria-label={visible ? 'Set publication library not visible' : 'Set publication library visible'}
          >
            {visible ? (
              <Eye className="house-publications-eye-toggle-icon h-[1.2rem] w-[1.2rem]" strokeWidth={2.1} />
            ) : (
              <EyeOff className="house-publications-eye-toggle-icon h-[1.2rem] w-[1.2rem]" strokeWidth={2.1} />
            )}
          </button>
        </SectionTools>
      </div>

      {visible ? (
        <div className="relative w-full house-table-context-profile">
          <Table key={`publication-library-demo-table-${tableRefreshTick}`} className="w-full table-fixed house-table-resizable" data-house-no-column-resize="true" data-house-no-column-controls="true">
          <colgroup>
            {PUBLICATION_LIBRARY_DEMO_COLUMNS.map((column) => (
              <col
                key={column.key}
                style={{
                  width: `${Math.max(columnWidths[column.key], PUBLICATION_LIBRARY_DEMO_COLUMN_MIN_WIDTH[column.key])}px`,
                  minWidth: `${Math.max(columnWidths[column.key], PUBLICATION_LIBRARY_DEMO_COLUMN_MIN_WIDTH[column.key])}px`,
                }}
              />
            ))}
          </colgroup>
          <TableHeader className="house-table-head text-left">
            <TableRow style={{ backgroundColor: 'transparent' }}>
              {PUBLICATION_LIBRARY_DEMO_COLUMNS.map((column) => (
                <TableHead key={column.key} className={`house-table-head-text ${column.key === 'citations' ? 'text-right' : 'text-left'}`}>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 text-inherit ${column.key === 'citations' ? 'ml-auto' : ''}`}
                    onClick={() => onSortColumn(column.key)}
                  >
                    <span>{column.label}</span>
                    {sortField === column.key ? (
                      sortDirection === 'desc' ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronUp className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
                    )}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => (
              <TableRow
                key={row.id}
                className={[
                  'cursor-pointer hover:bg-accent/30',
                  stripedRows ? 'odd:bg-[hsl(var(--tone-neutral-50))] even:bg-[hsl(var(--tone-neutral-100))]' : '',
                ].join(' ')}
              >
                <TableCell className="house-table-cell-text align-top font-medium whitespace-normal break-words leading-tight">
                  {row.title}
                </TableCell>
                <TableCell className="house-table-cell-text align-top whitespace-nowrap">{row.year}</TableCell>
                <TableCell className="house-table-cell-text align-top whitespace-normal break-words leading-tight">{row.journal}</TableCell>
                <TableCell className={`house-table-cell-text align-top text-right whitespace-nowrap tabular-nums ${metricHighlights ? 'font-semibold text-[hsl(var(--tone-accent-800))]' : ''}`}>
                  {row.citations}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      ) : (
        <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-[var(--space-3)] text-body text-[hsl(var(--muted-foreground))]">
          Publication library hidden by user.
        </div>
      )}

      <p className="text-caption text-[hsl(var(--muted-foreground))]">
        Matches the canonical publication library setup: heading controls, sortable headers, and auto-fit table settings.
      </p>
    </Stack>
  )
}

function PublicationDrilldownSummaryTableDemo() {
  return (
    <Stack space="sm">
      <Row align="center" gap="sm">
        <Badge>Canonical drilldown table</Badge>
        <Badge variant="outline">Publication insights summary-table pattern</Badge>
      </Row>

      <div className="w-full overflow-visible">
        <div
          className="house-table-shell house-publications-trend-table-shell-plain h-auto w-full overflow-hidden rounded-md bg-background"
          style={{ overflowX: 'hidden', overflowY: 'visible', maxWidth: '100%' }}
        >
          <table className="w-full border-collapse" data-house-no-column-resize="true" data-house-no-column-controls="true">
            <thead className="house-table-head">
              <tr>
                <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">Journal</th>
                <th className="house-table-head-text h-10 px-1.5 text-center align-middle font-semibold whitespace-nowrap" style={{ width: '1%' }}>Count</th>
                <th className="house-table-head-text h-10 px-1.5 text-center align-middle font-semibold whitespace-nowrap" style={{ width: '1%' }}>Share</th>
                <th className="house-table-head-text h-10 px-1.5 text-right align-middle font-semibold whitespace-nowrap" style={{ width: '1%' }}>Avg Cites</th>
              </tr>
            </thead>
            <tbody>
              {PUBLICATION_DRILLDOWN_SUMMARY_TABLE_ROWS.map((row) => (
                <tr key={row.id} className="house-table-row">
                  <td className="house-table-cell-text px-2 py-2">
                    <span className="block max-w-full break-words leading-snug">{row.journal}</span>
                  </td>
                  <td className="house-table-cell-text px-1.5 py-2 text-center whitespace-nowrap tabular-nums">{row.count}</td>
                  <td className="house-table-cell-text px-1.5 py-2 text-center whitespace-nowrap tabular-nums">{row.share}</td>
                  <td className="house-table-cell-text px-1.5 py-2 text-right whitespace-nowrap tabular-nums">{row.avgCites}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-caption text-[hsl(var(--muted-foreground))]">
        Mirrors the plain drilldown table style used by publication insights summary tables.
      </p>
    </Stack>
  )
}

function SectionToolsDemo() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [visible, setVisible] = useState(true)

  return (
    <Stack space="sm">
      <Row align="center" gap="sm">
        <Badge>Canonical toolbar</Badge>
        <Badge variant="outline">Tone: publications</Badge>
      </Row>
      <SectionTools tone="publications" framed={false}>
        <SectionToolIconButton
          icon={<Search className="h-4 w-4" strokeWidth={2.1} />}
          aria-label={searchOpen ? 'Hide search' : 'Show search'}
          tooltip="Search"
          active={searchOpen}
          onClick={() => setSearchOpen((current) => !current)}
        />
        <SectionToolIconButton
          icon={<Filter className="h-4 w-4" strokeWidth={2.1} />}
          aria-label={filterOpen ? 'Hide filters' : 'Show filters'}
          tooltip="Filters"
          active={filterOpen}
          onClick={() => setFilterOpen((current) => !current)}
        />
        <SectionToolIconButton
          icon={<Hammer className="h-4 w-4" strokeWidth={2.1} />}
          aria-label={toolsOpen ? 'Hide tools' : 'Show tools'}
          tooltip="Tools"
          active={toolsOpen}
          onClick={() => setToolsOpen((current) => !current)}
        />
        <SectionToolIconButton
          icon={<Settings className="h-4 w-4" strokeWidth={2.1} />}
          aria-label={settingsOpen ? 'Hide settings' : 'Show settings'}
          tooltip="Settings"
          active={settingsOpen}
          onClick={() => setSettingsOpen((current) => !current)}
        />
        <SectionToolIconButton
          icon={<Eye className="h-4 w-4" strokeWidth={2.1} />}
          aria-label={visible ? 'Set not visible' : 'Set visible'}
          tooltip={visible ? 'Visible' : 'Hidden'}
          active={visible}
          onClick={() => setVisible((current) => !current)}
        />
      </SectionTools>
      <p className="text-caption text-[hsl(var(--muted-foreground))]">
        Reusable `SectionTools` + `SectionToolIconButton` contract for section-level icon toolbars where hover/open state follows section tone.
      </p>
    </Stack>
  )
}

function DrilldownSectionHeadingDemo() {
  const [headlineExpanded, setHeadlineExpanded] = useState(true)
  const [trendsExpanded, setTrendsExpanded] = useState(false)

  return (
    <Stack space="sm">
      <Row align="center" gap="sm">
        <Badge>Canonical drilldown heading</Badge>
        <Badge variant="outline">Spacing + collapse toggle contract</Badge>
      </Row>
      <div className="house-drilldown-panel-no-pad rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-[var(--space-3)]">
        <div className="house-drilldown-heading-block flex items-center justify-between gap-[var(--space-2)]">
          <p className="house-drilldown-heading-block-title">Headline results</p>
          <DrilldownSheet.HeadingToggle
            expanded={headlineExpanded}
            expandedLabel="Collapse headline results"
            collapsedLabel="Expand headline results"
            onClick={() => setHeadlineExpanded((current) => !current)}
          />
        </div>
        {headlineExpanded ? (
          <div className="house-drilldown-content-block rounded-[var(--radius-xs)] border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-[var(--space-2)] text-caption">
            Heading to content spacing uses <strong>--separator-drilldown-heading-block-to-content</strong>
          </div>
        ) : null}
        <div className="house-drilldown-heading-block mt-[var(--separator-drilldown-content-to-heading-block)] flex items-center justify-between gap-[var(--space-2)]">
          <p className="house-drilldown-heading-block-title">Publication trends</p>
          <DrilldownSheet.HeadingToggle
            expanded={trendsExpanded}
            expandedLabel="Collapse publication trends"
            collapsedLabel="Expand publication trends"
            onClick={() => setTrendsExpanded((current) => !current)}
          />
        </div>
        {trendsExpanded ? (
          <div className="house-drilldown-content-block rounded-[var(--radius-xs)] border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-[var(--space-2)] text-caption">
            Content to next heading spacing uses <strong>--separator-drilldown-content-to-heading-block</strong>
          </div>
        ) : null}
      </div>
      <p className="text-caption text-[hsl(var(--muted-foreground))]">
        Collapse and expand toggles for drilldown subsection headings are approved as plus and minus via `DrilldownSheet.HeadingToggle`.
      </p>
    </Stack>
  )
}

export function ApprovalsContent() {
  const [isDark, setIsDark] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [gridMode, setGridMode] = useState<'off' | '8' | '16'>('off')
  const [metricWindow, setMetricWindow] = useState<'12m' | '5y'>('12m')
  const [insightsVisibility, setInsightsVisibility] = useState<'visible' | 'hidden'>('visible')
  const [chartVisualMode, setChartVisualMode] = useState<'bars' | 'line'>('bars')
  const [fieldThreshold, setFieldThreshold] = useState<(typeof FIELD_THRESHOLD_OPTIONS)[number]>(75)
  const chartTheme = useChartTheme()
  const chartMotion = useChartMotion('default')

  const initialThemeRef = useRef<{ dark: boolean; reduced: boolean } | null>(null)
  const backgroundProbeRef = useRef<HTMLDivElement | null>(null)
  const pageHeaderRef = useRef<HTMLDivElement | null>(null)
  const sectionHeaderRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const subheadingRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const selectRef = useRef<HTMLSelectElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const [rootVars, setRootVars] = useState<Record<string, string>>({})
  const [rootFontPx, setRootFontPx] = useState(16)
  const [backgroundRgb, setBackgroundRgb] = useState<RGB | null>(null)
  const [typographyRows, setTypographyRows] = useState<Array<Record<string, string>>>([])
  const [controlHeights, setControlHeights] = useState<Record<string, string>>({})

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }
    const root = document.documentElement
    const initialDark = root.classList.contains('dark')
    const initialReduced = root.dataset.reducedMotion === 'true'
    initialThemeRef.current = { dark: initialDark, reduced: initialReduced }
    setIsDark(initialDark)
    setReducedMotion(initialReduced)
    return () => {
      const initial = initialThemeRef.current
      if (!initial) {
        return
      }
      root.classList.toggle('dark', initial.dark)
      if (initial.reduced) {
        root.dataset.reducedMotion = 'true'
      } else {
        delete root.dataset.reducedMotion
      }
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }
    const root = document.documentElement
    root.classList.toggle('dark', isDark)
  }, [isDark])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }
    const root = document.documentElement
    if (reducedMotion) {
      root.dataset.reducedMotion = 'true'
    } else {
      delete root.dataset.reducedMotion
    }
  }, [reducedMotion])

  const modeKey = `${isDark ? 'dark' : 'light'}|${reducedMotion ? 'reduced' : 'motion'}`

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }
    const rootStyle = getComputedStyle(document.documentElement)
    const rootFont = Number.parseFloat(rootStyle.fontSize || '16')
    if (Number.isFinite(rootFont)) {
      setRootFontPx(rootFont)
    }
    setRootVars(
      resolveCssVars([
        ...CORE_COLOR_TOKENS,
        ...NEUTRAL_RAMP_TOKENS,
        ...ACCENT_RAMP_TOKENS,
        ...STATUS_RAMP_TOKENS,
        ...SPACING_TOKENS,
        ...SEPARATOR_TOKENS,
        ...RADIUS_TOKENS,
        ...ELEVATION_TOKENS,
        ...MOTION_DURATION_TOKENS,
        ...MOTION_EASE_TOKENS,
      ]),
    )
  }, [modeKey])

  useEffect(() => {
    const probe = backgroundProbeRef.current
    if (!probe) {
      return
    }
    const rgb = parseRgb(getComputedStyle(probe).backgroundColor)
    setBackgroundRgb(rgb)
  }, [modeKey])

  useEffect(() => {
    const readTypography = (selector: string, container: HTMLDivElement | null) => {
      const node = container?.querySelector(selector)
      if (!node) {
        return {
          fontSize: '—',
          lineHeight: '—',
          letterSpacing: '—',
          fontWeight: '—',
        }
      }
      const styles = getComputedStyle(node)
      const fontSizePx = Number.parseFloat(styles.fontSize || '0')
      const fontSizeRem = rootFontPx > 0 ? fontSizePx / rootFontPx : 0
      return {
        fontSize: `${fontSizePx.toFixed(fontSizePx % 1 === 0 ? 0 : 2)}px (${fontSizeRem.toFixed(3)}rem)`,
        lineHeight: styles.lineHeight,
        letterSpacing: styles.letterSpacing,
        fontWeight: styles.fontWeight,
      }
    }

    setTypographyRows([
      {
        role: 'PageHeader heading',
        ...readTypography('[data-ui="page-header-heading"]', pageHeaderRef.current),
      },
      {
        role: 'SectionHeader heading',
        ...readTypography('[data-ui="section-header-heading"]', sectionHeaderRef.current),
      },
      {
        role: 'Subheading',
        ...readTypography('[data-ui="approvals-subheading-sample"]', subheadingRef.current),
      },
      {
        role: 'Body sample',
        ...readTypography('[data-ui="approvals-body-sample"]', bodyRef.current),
      },
    ])
  }, [modeKey, rootFontPx])

  useEffect(() => {
    const measureHeight = (element: HTMLElement | null) => {
      if (!element) {
        return '—'
      }
      const { height } = element.getBoundingClientRect()
      const rem = rootFontPx > 0 ? height / rootFontPx : 0
      return `${height.toFixed(height % 1 === 0 ? 0 : 2)}px (${rem.toFixed(3)}rem)`
    }
    setControlHeights({
      button: measureHeight(buttonRef.current),
      input: measureHeight(inputRef.current),
      select: measureHeight(selectRef.current),
      textarea: measureHeight(textareaRef.current),
    })
  }, [modeKey, rootFontPx])

  const spacingRows = useMemo(
    () => SPACING_TOKENS.map((token) => ({ token, value: formatLength(rootVars[token] || '', rootFontPx) })),
    [rootFontPx, rootVars],
  )

  const baseSeparatorRows = useMemo(
    () => BASE_SEPARATOR_TOKENS.map((token) => ({
      token,
      value: formatLength(rootVars[token] || '', rootFontPx),
      definition: SEPARATOR_TOKEN_DEFINITIONS[token],
    })),
    [rootFontPx, rootVars],
  )

  const gridOverlayStyle = useMemo<CSSProperties>(() => {
    if (gridMode === 'off') {
      return {}
    }
    const baseline = Number(gridMode)
    return {
      position: 'fixed',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 20,
      backgroundImage: `repeating-linear-gradient(to right, hsl(var(--accent) / 0.12) 0 1px, transparent 1px ${baseline}px), repeating-linear-gradient(to bottom, hsl(var(--accent) / 0.12) 0 1px, transparent 1px ${baseline}px)`,
    }
  }, [gridMode])

  return (
    <Container id="approvals-top" size="wide" gutter="default" className="relative py-[var(--space-6)]">
      <div ref={backgroundProbeRef} className="sr-only" style={{ backgroundColor: 'hsl(var(--background))' }} />
      {gridMode !== 'off' ? <div aria-hidden="true" style={gridOverlayStyle} /> : null}
      <Stack space="xl">
        <PageHeader
          eyebrow="Design System"
          heading="Approvals"
          description="Single canonical approval surface for foundations, primitives, controls, patterns, and definitions."
        />

        <Section id="approvals-navigation" surface="card" inset="lg" spaceY="sm" className="scroll-mt-24 mt-[var(--separator-page-header-to-section-header)]">
          <SectionHeader
            eyebrow="Guide"
            heading="Quick Navigation + Coverage"
            description="Jump to any approval section and verify canonical coverage at a glance."
          />
          <Grid cols={2} gap="md">
            <Section surface="muted" inset="md" spaceY="sm">
              <SectionHeader heading="Section map" description="Stable anchors for faster review and future updates." />
              <div className="grid gap-[var(--space-2)] md:grid-cols-2">
                {APPROVAL_SECTION_LINKS.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-[var(--space-3)] py-[var(--space-2)] transition-colors duration-[var(--motion-duration-fast)] hover:bg-[hsl(var(--muted))]"
                  >
                    <div className="text-body text-[hsl(var(--foreground))]">{section.label}</div>
                    <div className="text-caption text-[hsl(var(--muted-foreground))]">{section.note}</div>
                  </a>
                ))}
              </div>
            </Section>

            <Section surface="muted" inset="md" spaceY="sm">
              <SectionHeader heading="Canonical status" description="Visual checks to confirm this remains the active source of truth." />
              <Stack space="sm">
                <Row gap="sm" align="start" className="flex-wrap items-center">
                  <Badge variant="secondary">Canonical story</Badge>
                  <Badge variant="outline">Sections: {APPROVAL_SECTION_LINKS.length}</Badge>
                  <Badge variant="outline">Controls contract: {APPROVAL_CONTRACT_ITEMS.length}</Badge>
                  <Badge variant="outline">Metric contract: {METRIC_TILE_CONTRACT_ITEMS.length}</Badge>
                </Row>
                <div className="rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-[var(--space-3)] py-[var(--space-2)] text-caption text-[hsl(var(--muted-foreground))]">
                  Source of truth: Design System → Approvals → Canonical. Archived stories are reference-only and non-canonical.
                </div>
                <div>
                  <a href="#approvals-top" className="text-caption text-[hsl(var(--accent-foreground))] underline-offset-2 hover:underline">
                    Jump to top
                  </a>
                </div>
              </Stack>
            </Section>
          </Grid>
        </Section>

        <Section id="approvals-control-bar" surface="card" inset="lg" spaceY="sm" className="scroll-mt-24">
          <SectionHeader
            eyebrow="0"
            heading="Sticky Control Bar"
            description="Theme, reduced-motion, and baseline-grid controls for this canonical approvals page."
          />
          <div className="sticky top-0 z-30 rounded-[var(--radius-md)] border border-[hsl(var(--border))] bg-[hsl(var(--background)/0.9)] p-[var(--space-3)] backdrop-blur">
            <Row gap="sm" align="start" className="flex-wrap items-center">
              <Button variant={isDark ? 'default' : 'outline'} onClick={() => setIsDark((previous) => !previous)}>
                {isDark ? 'Dark mode: On' : 'Dark mode: Off'}
              </Button>
              <Button variant={reducedMotion ? 'default' : 'outline'} onClick={() => setReducedMotion((previous) => !previous)}>
                {reducedMotion ? 'Reduced motion: On' : 'Reduced motion: Off'}
              </Button>
              <Button variant={gridMode === 'off' ? 'default' : 'outline'} onClick={() => setGridMode('off')}>
                Grid: Off
              </Button>
              <Button variant={gridMode === '8' ? 'default' : 'outline'} onClick={() => setGridMode('8')}>
                Grid: 8px
              </Button>
              <Button variant={gridMode === '16' ? 'default' : 'outline'} onClick={() => setGridMode('16')}>
                Grid: 16px
              </Button>
            </Row>
          </div>
          <BackToTopLink />
        </Section>

        <Section id="approvals-foundations" surface="card" inset="lg" spaceY="sm" className="scroll-mt-24">
          <SectionHeader
            eyebrow="1"
            heading="Foundations: Visual Spec"
            description="Computed token values for colors, typography, spacing, radius/elevation, and motion."
          />

          <Stack space="md">
            <Section surface="muted" inset="md" spaceY="sm">
              <SectionHeader heading="A) Colors" description="Canonical token set rendered as live swatches with computed rgb/hex and contrast ratios." />
              <Grid cols={3} gap="sm">
                {CORE_COLOR_TOKENS.map((token) => (
                  <ColorTokenSwatch key={token} token={token} rawValue={rootVars[token] || ''} backgroundRgb={backgroundRgb} modeKey={modeKey} />
                ))}
              </Grid>
              <SectionHeader heading="Neutral ramp" description="Tone-neutral canonical ramp." />
              <Grid cols={4} gap="sm">
                {NEUTRAL_RAMP_TOKENS.map((token) => (
                  <ColorTokenSwatch key={token} token={token} rawValue={rootVars[token] || ''} backgroundRgb={backgroundRgb} modeKey={modeKey} />
                ))}
              </Grid>
              <SectionHeader heading="Accent ramp" description="Tone-accent canonical ramp." />
              <Grid cols={4} gap="sm">
                {ACCENT_RAMP_TOKENS.map((token) => (
                  <ColorTokenSwatch key={token} token={token} rawValue={rootVars[token] || ''} backgroundRgb={backgroundRgb} modeKey={modeKey} />
                ))}
              </Grid>
              <SectionHeader heading="Status ramps" description="Positive, warning, and danger ramps." />
              <Grid cols={4} gap="sm">
                {STATUS_RAMP_TOKENS.map((token) => (
                  <ColorTokenSwatch key={token} token={token} rawValue={rootVars[token] || ''} backgroundRgb={backgroundRgb} modeKey={modeKey} />
                ))}
              </Grid>
            </Section>

            <Section surface="muted" inset="md" spaceY="sm">
              <SectionHeader heading="B) Typography" description="Computed type metrics from rendered canonical primitives." />
              <Grid cols={3} gap="md">
                <div ref={pageHeaderRef}>
                  <Row align="center" gap="md" wrap={false} className="house-page-title-row">
                    <SectionMarker tone="accent" size="title" className="self-stretch h-auto" />
                    <PageHeader heading="Page heading sample" description="Body copy follows approved text roles." className="!ml-0 !mt-0" />
                  </Row>
                </div>
                <div ref={sectionHeaderRef}>
                  <SectionHeader heading="Section heading sample" description="Compact section heading with helper text." />
                </div>
                <div ref={subheadingRef} className="rounded-[var(--radius-sm)] border border-[hsl(var(--border))] p-[var(--space-3)]">
                  <Subheading data-ui="approvals-subheading-sample">Profile photo</Subheading>
                  <p className="mt-[var(--space-2)] text-caption text-[hsl(var(--muted-foreground))]">Subheading sample</p>
                </div>
                <div ref={bodyRef} className="rounded-[var(--radius-sm)] border border-[hsl(var(--border))] p-[var(--space-3)]">
                  <p data-ui="approvals-body-sample" className="m-0 text-body text-[hsl(var(--foreground))]">
                    Body text sample used for baseline readability and rhythm checks.
                  </p>
                </div>
              </Grid>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Font size</TableHead>
                    <TableHead>Line height</TableHead>
                    <TableHead>Letter spacing</TableHead>
                    <TableHead>Weight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {typographyRows.map((row) => (
                    <TableRow key={row.role}>
                      <TableCell>{row.role}</TableCell>
                      <TableCell>{row.fontSize}</TableCell>
                      <TableCell>{row.lineHeight}</TableCell>
                      <TableCell>{row.letterSpacing}</TableCell>
                      <TableCell>{row.fontWeight}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>

            <Section surface="muted" inset="md" spaceY="sm">
              <SectionHeader heading="C) Spacing" description="Canonical --space-0..--space-8 ladder with computed values." />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Token</TableHead>
                    <TableHead>Computed value</TableHead>
                    <TableHead>Preview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spacingRows.map((row) => (
                    <TableRow key={row.token}>
                      <TableCell>{row.token}</TableCell>
                      <TableCell>{row.value}</TableCell>
                      <TableCell>
                        <div className="rounded-[var(--radius-xs)] bg-[hsl(var(--accent)/0.2)]" style={{ width: rootVars[row.token], height: '0.5rem' }} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Section surface="card" inset="sm" spaceY="sm">
                <SectionHeader heading="Separator definitions" description="Canonical-only separators currently approved for new usage." />
                <Banner>
                  <BannerContent>
                    <BannerTitle>Spacing hierarchy</BannerTitle>
                    <BannerDescription>
                      Canonical rhythm pair: PageHeader (title block) → SectionHeader (heading block) → Section body (content block). Use --space-* as primitives, then canonical separator tokens for transitions between those blocks. For drilldowns, integrated header-tabs is canonical.
                    </BannerDescription>
                  </BannerContent>
                </Banner>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Base token</TableHead>
                      <TableHead>Computed value</TableHead>
                      <TableHead>Definition</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {baseSeparatorRows.map((row) => (
                      <TableRow key={row.token}>
                        <TableCell>{row.token}</TableCell>
                        <TableCell>{row.value}</TableCell>
                        <TableCell>{row.definition}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

              </Section>

              <Section surface="card" inset="sm" spaceY="sm">
                <SectionHeader heading="Canonical spacing elements (current)" description="Key canonical elements for spacing and rhythm decisions." />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Element</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Canonical use</TableHead>
                      <TableHead>Dimensions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {CANONICAL_SPACING_ELEMENTS.map((row) => (
                      <TableRow key={row.element}>
                        <TableCell>{row.element}</TableCell>
                        <TableCell>{row.role}</TableCell>
                        <TableCell>{row.canonicalUse}</TableCell>
                        <TableCell>{row.dimensions}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Section>

              <Section surface="card" inset="sm" spaceY="sm">
                <SectionHeader
                  heading="Layout naming: title block → heading block"
                  description="Canonical names for discussion: Title block (PageHeader), Heading block (first SectionHeader), and Content block (section body)."
                />
                <Grid cols={2} gap="md">
                  <div className="rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-[var(--space-3)]">
                    <Stack space="sm">
                      <div className="rounded-[var(--radius-xs)] border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-[var(--space-2)] text-caption">
                        1) Title block (PageHeader)
                      </div>
                      <div className="rounded-[var(--radius-xs)] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--background))] p-[var(--space-2)] text-caption">
                        Gap token: <strong>--separator-page-header-to-section-header</strong>
                        <div className="text-[hsl(var(--muted-foreground))]">Current: {formatLength(rootVars['--separator-page-header-to-section-header'] || '', rootFontPx)}</div>
                      </div>
                      <div className="rounded-[var(--radius-xs)] border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-[var(--space-2)] text-caption">
                        2) Heading block (SectionHeader)
                      </div>
                      <div className="rounded-[var(--radius-xs)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-[var(--space-2)] text-caption">
                        3) Content block (section body)
                      </div>
                      <div className="rounded-[var(--radius-xs)] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--background))] p-[var(--space-2)] text-caption">
                        Next-section gap token: <strong>--separator-section-content-to-section-header</strong>
                        <div className="text-[hsl(var(--muted-foreground))]">Current: {formatLength(rootVars['--separator-section-content-to-section-header'] || '', rootFontPx)}</div>
                      </div>
                    </Stack>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Canonical primitive</TableHead>
                        <TableHead>Spacing control</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>Title block</TableCell>
                        <TableCell>PageHeader</TableCell>
                        <TableCell>--separator-page-header-to-section-header</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Heading block</TableCell>
                        <TableCell>SectionHeader</TableCell>
                        <TableCell>--separator-section-header-to-section-content + Section spaceY (sm/md/lg)</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Content block</TableCell>
                        <TableCell>Section body</TableCell>
                        <TableCell>--separator-section-content-to-section-header + Section spaceY (sm/md/lg)</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </Grid>
              </Section>
            </Section>

            <Section surface="muted" inset="md" spaceY="sm">
              <SectionHeader heading="D) Dividers" description="Canonical divider treatments, including metric tile separators." />
              <Grid cols={2} gap="md">
                <div className="rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-[var(--space-3)] space-y-[var(--space-2)]">
                  <p className="text-caption text-[hsl(var(--muted-foreground))]">Soft border divider</p>
                  <div className="rounded-md border house-divider-border-soft p-2 text-caption text-[hsl(var(--foreground))]">
                    .house-divider-border-soft
                  </div>
                  <p className="text-caption text-[hsl(var(--muted-foreground))]">Soft fill divider</p>
                  <div className="house-divider-fill-soft h-px w-full" />
                  <p className="text-caption text-[hsl(var(--muted-foreground))]">Strong divider</p>
                  <div className="house-divider-strong" />
                </div>

                <div className="rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-[var(--space-3)] space-y-[var(--space-2)]">
                  <p className="text-caption text-[hsl(var(--muted-foreground))]">Metric tile separator</p>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
                    <div className="text-caption text-[hsl(var(--muted-foreground))]">Primary</div>
                    <div className="house-metric-tile-separator h-10 mx-3" />
                    <div className="text-caption text-[hsl(var(--muted-foreground))]">Secondary</div>
                  </div>
                  <p className="text-caption text-[hsl(var(--muted-foreground))]">Left nav section divider</p>
                  <div className="house-nav-section-separator" />
                </div>
              </Grid>
            </Section>

            <Section surface="muted" inset="md" spaceY="sm">
              <SectionHeader heading="D) Radius + Elevation" description="Numeric token values and visual previews." />
              <Grid cols={2} gap="md">
                <Section surface="card" inset="sm" spaceY="sm">
                  <SectionHeader heading="Radius" description="Corner radius token previews." />
                  <Stack space="sm">
                    {RADIUS_TOKENS.map((token) => (
                      <Row key={token} gap="sm" align="start" className="items-center">
                        <div className="h-8 w-16 border border-[hsl(var(--border))] bg-[hsl(var(--muted))]" style={{ borderRadius: `var(${token})` }} />
                        <div className="text-caption">{token}</div>
                        <div className="text-caption text-[hsl(var(--muted-foreground))]">{formatLength(rootVars[token] || '', rootFontPx)}</div>
                      </Row>
                    ))}
                  </Stack>
                </Section>
                <Section surface="card" inset="sm" spaceY="sm">
                  <SectionHeader heading="Elevation" description="Shadow token previews." />
                  <Stack space="sm">
                    {ELEVATION_TOKENS.map((token) => (
                      <Row key={token} gap="sm" align="start" className="items-center">
                        <div className="h-8 w-16 rounded-[var(--radius-sm)] bg-[hsl(var(--background))]" style={{ boxShadow: `var(${token})` }} />
                        <div className="text-caption">{token}</div>
                        <div className="text-caption text-[hsl(var(--muted-foreground))]">{rootVars[token] || '—'}</div>
                      </Row>
                    ))}
                  </Stack>
                </Section>
              </Grid>
            </Section>

            <Section surface="muted" inset="md" spaceY="sm">
              <SectionHeader heading="E) Motion" description="Duration/easing tokens with demos that respect reduced motion." />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Token</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MOTION_DURATION_TOKENS.map((token) => (
                    <TableRow key={token}>
                      <TableCell>{token}</TableCell>
                      <TableCell>{rootVars[token] || '—'}</TableCell>
                      <TableCell>Duration</TableCell>
                    </TableRow>
                  ))}
                  {MOTION_EASE_TOKENS.map((token) => (
                    <TableRow key={token}>
                      <TableCell>{token}</TableCell>
                      <TableCell>{rootVars[token] || '—'}</TableCell>
                      <TableCell>Easing</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Grid cols={3} gap="sm">
                <MotionChip label="Fast + default" durationVar="--motion-duration-fast" easeVar="--motion-ease-default" reducedMotion={reducedMotion} />
                <MotionChip label="Base + elastic" durationVar="--motion-duration-base" easeVar="--motion-ease-elastic" reducedMotion={reducedMotion} />
                <MotionChip label="Slow + chart-series" durationVar="--motion-duration-slow" easeVar="--motion-ease-chart-series" reducedMotion={reducedMotion} />
              </Grid>
            </Section>
          </Stack>
          <BackToTopLink />
        </Section>

        <Section id="approvals-icons" surface="card" inset="lg" spaceY="sm" className="scroll-mt-24">
          <SectionHeader
            eyebrow="2"
            heading="Icons"
            description="Icon size scale, currentColor behavior, IconButton state samples, and the canonical contextual-help trigger."
          />
          <Grid cols={3} gap="md">
            <PanelShell heading="Size scale" description="sm / md / lg">
              <Row gap="md" align="start" className="items-center">
                <div className="text-[hsl(var(--foreground))]"><IconGlyph size={14} /></div>
                <div className="text-[hsl(var(--foreground))]"><IconGlyph size={18} /></div>
                <div className="text-[hsl(var(--foreground))]"><IconGlyph size={24} /></div>
              </Row>
            </PanelShell>
            <PanelShell heading="currentColor" description="Icons inherit text color on light/dark surfaces.">
              <Stack space="sm">
                <div className="rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-[var(--space-2)] text-[hsl(var(--foreground))]">
                  <IconGlyph size={20} />
                </div>
                <div className="rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--foreground))] p-[var(--space-2)] text-[hsl(var(--background))]">
                  <IconGlyph size={20} />
                </div>
              </Stack>
            </PanelShell>
            <PanelShell heading="IconButton states" description="default / focus target / disabled">
              <Row gap="sm" align="start" className="items-center">
                <IconButton aria-label="Default icon button" variant="outline" size="icon"><IconGlyph size={16} /></IconButton>
                <IconButton aria-label="Focus-visible target" variant="secondary" size="icon" autoFocus><IconGlyph size={16} /></IconButton>
                <IconButton aria-label="Disabled icon button" variant="outline" size="icon" disabled><IconGlyph size={16} /></IconButton>
              </Row>
            </PanelShell>
            <PanelShell heading="Inline action icons" description="Approved add, edit, save, and discard controls for staged inline field editing.">
              <Stack space="sm">
                <Row gap="sm" align="start" className="items-center">
                  <button type="button" className="house-collaborator-action-icon house-collaborator-action-icon-add" aria-label="Add secondary field">
                    <Plus className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                  <button type="button" className="house-collaborator-action-icon house-collaborator-action-icon-edit" aria-label="Edit inline field">
                    <Pencil className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                  <button type="button" className="house-collaborator-action-icon house-collaborator-action-icon-save" aria-label="Save inline field">
                    <Check className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                  <button type="button" className="house-collaborator-action-icon house-collaborator-action-icon-discard" aria-label="Discard inline field changes">
                    <X className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                </Row>
                <p className="max-w-[15rem] text-caption text-[hsl(var(--muted-foreground))]">
                  Use plus to add a new inline field, pencil to enter edit mode, tick to save the draft state, and the red cross to discard it.
                </p>
              </Stack>
            </PanelShell>
            <PanelShell heading="Primary switch badges" description="Approved pairing for author-affiliation lists and similar primary/secondary swaps.">
              <Stack space="sm">
                <Row gap="sm" align="start" className="items-center">
                  <Badge variant="positive" className="w-[6.75rem] justify-center">
                    Primary
                  </Badge>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="w-[6.75rem] min-h-0 h-auto justify-center px-2 py-1 text-micro font-medium leading-tight hover:border-[hsl(var(--tone-neutral-900))] hover:bg-white hover:text-[hsl(var(--tone-neutral-900))] active:border-[hsl(var(--tone-neutral-900))] active:bg-white active:text-[hsl(var(--tone-neutral-900))]"
                  >
                    Set primary
                  </Button>
                </Row>
                <p className="max-w-[20rem] text-caption text-[hsl(var(--muted-foreground))]">
                  Use the positive badge to mark the committed primary item, and the paired small button to promote a secondary item into primary.
                </p>
              </Stack>
            </PanelShell>
            <PanelShell heading="Tile help trigger" description="Reusable question-mark icon for tile and section-level explanatory tooltips.">
              <Row gap="sm" align="start" className="items-center">
                <HelpTooltipIconButton
                  ariaLabel="Explain tile metric"
                  content="Use this question-mark trigger in the top-right corner of tiles and drilldown sections when readers need concise context for how to interpret a metric."
                />
                <p className="max-w-[15rem] text-caption text-[hsl(var(--muted-foreground))]">
                  Uses the canonical tooltip surface and keyboard-focus behavior.
                </p>
              </Row>
            </PanelShell>
            <PanelShell heading="Insights glyph" description="Reusable marker for sections and tiles that surface interpreted portfolio signals.">
              <Row gap="sm" align="start" className="items-center">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--tone-accent-700))]">
                  <InsightsGlyph className="h-5 w-5" />
                </div>
                <p className="max-w-[15rem] text-caption text-[hsl(var(--muted-foreground))]">
                  Use this glyph beside insight-oriented headings such as uncited-works interpretation blocks.
                </p>
              </Row>
            </PanelShell>
          </Grid>
          <BackToTopLink />
        </Section>

        <Section id="approvals-recipes" surface="card" inset="lg" spaceY="sm" className="scroll-mt-24">
          <SectionHeader
            eyebrow="3"
            heading="Structural Recipes"
            description="Visual recipe examples for canonical page and drilldown scaffolds."
          />
          <Stack space="md">
            <PanelShell heading="Page scaffold recipe" description="Container → Section → Stack → headers with marker → content.">
              <Container size="content" gutter="none">
                <Section surface="muted" inset="md" spaceY="sm">
                  <Stack space="sm">
                    <Row align="center" gap="md" wrap={false} className="house-page-title-row">
                      <SectionMarker tone="accent" size="title" className="self-stretch h-auto" />
                      <PageHeader heading="Recipe: Research performance" description="Top-level scaffold header with full-height marker." className="!ml-0 !mt-0" />
                    </Row>
                    <SectionHeader heading="At-a-glance" description="Secondary semantic grouping." />
                    <div className="text-body">Recipe body content block.</div>
                  </Stack>
                </Section>
              </Container>
            </PanelShell>

            <Section surface="muted" inset="md" spaceY="sm">
              <SectionHeader heading="Drilldown scaffold matrix" description="Surface × density combinations." />
              <Grid cols={2} gap="md">
                <Section surface="card" inset="sm" spaceY="sm">
                  <SectionHeader heading="Card / Compact" description="surface=card, inset=sm" />
                  <div className="text-caption">Compact drilldown content sample.</div>
                </Section>
                <Section surface="card" inset="lg" spaceY="sm">
                  <SectionHeader heading="Card / Comfortable" description="surface=card, inset=lg" />
                  <div className="text-caption">Comfortable drilldown content sample.</div>
                </Section>
                <Section surface="muted" inset="sm" spaceY="sm">
                  <SectionHeader heading="Muted / Compact" description="surface=muted, inset=sm" />
                  <div className="text-caption">Compact alternate surface sample.</div>
                </Section>
                <Section surface="muted" inset="lg" spaceY="sm">
                  <SectionHeader heading="Muted / Comfortable" description="surface=muted, inset=lg" />
                  <div className="text-caption">Comfortable alternate surface sample.</div>
                </Section>
              </Grid>
            </Section>

            <Grid cols={2} gap="md">
              <PanelShell heading="Marker recipe" description="Section markers by context (nav vs title).">
                <Stack space="sm">
                  <Row align="start" gap="sm" className="items-center">
                    <SectionMarker tone="accent" size="nav" />
                    <div className="text-caption">Nav marker sample (workspace/profile/learning centre rails)</div>
                  </Row>
                  <Section surface="muted" inset="sm" spaceY="sm">
                    <SectionHeader heading="Section tone mapping" description="Canonical section colors for page header markers." />
                    <Stack space="sm">
                      <Row align="start" gap="sm" className="items-center">
                        <SectionMarker tone="accent" size="nav" />
                        <div className="text-caption">Profile/Publications → accent</div>
                      </Row>
                      <Row align="start" gap="sm" className="items-center">
                        <SectionMarker tone="positive" size="nav" />
                        <div className="text-caption">Workspace → positive</div>
                      </Row>
                      <Row align="start" gap="sm" className="items-center">
                        <SectionMarker tone="warning" size="nav" />
                        <div className="text-caption">Learning Centre → warning</div>
                      </Row>
                      <Row align="start" gap="sm" className="items-center">
                        <SectionMarker tone="danger" size="nav" />
                        <div className="text-caption">Opportunities → danger</div>
                      </Row>
                    </Stack>
                  </Section>
                  <Row align="center" gap="md" wrap={false} className="house-page-title-row">
                    <SectionMarker tone="accent" size="title" className="self-stretch h-auto" />
                    <PageHeader
                      heading="Publications"
                      description="Title marker sample with full-height marker spanning the entire PageHeader."
                      className="!ml-0 !mt-0"
                    />
                  </Row>
                </Stack>
              </PanelShell>
              <PanelShell heading="Panel recipe" description="PanelShell canonical framing with body content.">
                <Stack space="sm">
                  <div className="text-body">Panel recipe body sample.</div>
                  <div className="text-caption text-[hsl(var(--muted-foreground))]">Uses canonical PanelShell from patterns barrel.</div>
                </Stack>
              </PanelShell>
            </Grid>
          </Stack>
          <BackToTopLink />
        </Section>

        <Section id="approvals-controls" surface="card" inset="lg" spaceY="sm" className="scroll-mt-24">
          <SectionHeader
            eyebrow="4"
            heading="Canonical Controls: State Matrices"
            description="Canonical controls with spec cues, disabled states, and focus-visible targets."
          />
          <Stack space="sm">
            {APPROVAL_CONTRACT_ITEMS.map((item) => (
              <div key={item} className="text-caption text-[hsl(var(--muted-foreground))]">• {item}</div>
            ))}
          </Stack>
          <Stack space="md">
            <Grid cols={3} gap="md">
              <MatrixCell title="Button" note="default / cta / focus target / disabled / loading" spec={`Height ${controlHeights.button || '—'}`}>
                <Row gap="sm" align="start">
                  <Button ref={buttonRef}>Default</Button>
                  <Button variant="cta">CTA</Button>
                  <Button variant="secondary" autoFocus>Focus target</Button>
                  <Button disabled>Disabled</Button>
                  <Button isLoading loadingText="Loading">Submit</Button>
                </Row>
              </MatrixCell>
              <MatrixCell title="Input" note="default / disabled / error" spec={`Height ${controlHeights.input || '—'} · ring token --ring-focus`}>
                <Stack space="sm">
                  <Label htmlFor="approval-input-default">Default</Label>
                  <Input id="approval-input-default" ref={inputRef} placeholder="Default input" />
                  <Label htmlFor="approval-input-disabled">Disabled</Label>
                  <Input id="approval-input-disabled" placeholder="Disabled input" disabled />
                  <Label htmlFor="approval-input-error">Error</Label>
                  <Input id="approval-input-error" aria-invalid="true" placeholder="Error input" />
                </Stack>
              </MatrixCell>
              <MatrixCell title="Select" note="default / disabled / error" spec={`Height ${controlHeights.select || '—'} · focus with keyboard tab`}>
                <Stack space="sm">
                  <Select ref={selectRef} defaultValue="one">
                    <option value="one">Option one</option>
                    <option value="two">Option two</option>
                  </Select>
                  <Select disabled defaultValue="one">
                    <option value="one">Disabled</option>
                  </Select>
                  <Select aria-invalid="true" defaultValue="two">
                    <option value="one">Option one</option>
                    <option value="two">Error state</option>
                  </Select>
                </Stack>
              </MatrixCell>
            </Grid>

            <Grid cols={3} gap="md">
              <MatrixCell title="Textarea" note="default / disabled / error" spec={`Height ${controlHeights.textarea || '—'}`}>
                <Stack space="sm">
                  <Textarea ref={textareaRef} placeholder="Default textarea" />
                  <Textarea placeholder="Disabled textarea" disabled />
                  <Textarea placeholder="Error textarea" aria-invalid="true" />
                </Stack>
              </MatrixCell>
              <MatrixCell title="Tooltip" note="trigger + visible content">
                <TooltipProvider>
                  <Row gap="sm" align="start">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline">Hover trigger</Button>
                      </TooltipTrigger>
                      <TooltipContent>Tooltip content</TooltipContent>
                    </Tooltip>
                    <Tooltip defaultOpen>
                      <TooltipTrigger asChild>
                        <Button variant="secondary">Open sample</Button>
                      </TooltipTrigger>
                      <TooltipContent>Visible state sample</TooltipContent>
                    </Tooltip>
                  </Row>
                </TooltipProvider>
              </MatrixCell>
              <MatrixCell title="Badge" note="default + small status badges (positive / yellow / intermediate / negative)">
                <Stack space="sm">
                  <Row gap="sm" align="start">
                    <Badge>Default</Badge>
                    <Badge variant="secondary">Secondary</Badge>
                    <Badge variant="outline">Outline</Badge>
                    <Badge variant="destructive">Destructive</Badge>
                    <Badge variant="positive">Positive</Badge>
                    <Badge variant="yellow">Yellow</Badge>
                    <Badge variant="intermediate">Intermediate</Badge>
                    <Badge variant="negative">Negative</Badge>
                  </Row>
                  <Row gap="sm" align="start">
                    <Badge size="sm" variant="positive">CORE</Badge>
                    <Badge size="sm" variant="yellow">REGULAR</Badge>
                    <Badge size="sm" variant="intermediate">OCCASIONAL</Badge>
                    <Badge size="sm" variant="negative">UNCLASSIFIED</Badge>
                    <Badge size="sm" variant="positive">ACTIVE</Badge>
                    <Badge size="sm" variant="yellow">RECENT</Badge>
                    <Badge size="sm" variant="intermediate">DORMANT</Badge>
                    <Badge size="sm" variant="negative">HISTORIC</Badge>
                  </Row>
                </Stack>
              </MatrixCell>
            </Grid>

            <Grid cols={2} gap="md">
              <MatrixCell title="Toolbar" note="default density / with divider / compact" spec="Compound layout, role=toolbar">
                <Stack space="sm">
                  <Toolbar>
                    <Toolbar.Group>
                      <Button variant="primary">Primary</Button>
                      <Button variant="secondary">Secondary</Button>
                    </Toolbar.Group>
                    <Toolbar.Spacer />
                    <Toolbar.Actions>
                      <Button variant="outline">Action</Button>
                    </Toolbar.Actions>
                  </Toolbar>
                  <Toolbar density="comfortable">
                    <Toolbar.Group>
                      <Button variant="secondary">Left</Button>
                    </Toolbar.Group>
                    <Toolbar.Divider />
                    <Toolbar.Group>
                      <Button variant="secondary">Right</Button>
                    </Toolbar.Group>
                  </Toolbar>
                  <Toolbar density="compact">
                    <Toolbar.Group>
                      <Button size="sm" variant="outline">Compact</Button>
                    </Toolbar.Group>
                  </Toolbar>
                </Stack>
              </MatrixCell>
              <MatrixCell title="DrilldownSheet" note="controlled + compound slots" spec="Compound sheet with Title, Heading, StatCard, Alert, Placeholder">
                <DrilldownSheetDemo />
              </MatrixCell>
            </Grid>

            <Grid cols={2} gap="md">
              <MatrixCell title="Banner" note="info / success / warning / danger">
                <Stack space="sm">
                  <Banner variant="info">
                    <BannerContent>
                      <BannerTitle>Info banner</BannerTitle>
                      <BannerDescription>Informational feedback state.</BannerDescription>
                    </BannerContent>
                  </Banner>
                  <Banner variant="success">
                    <BannerContent>
                      <BannerTitle>Success banner</BannerTitle>
                      <BannerDescription>Success confirmation state.</BannerDescription>
                    </BannerContent>
                  </Banner>
                  <Banner variant="warning">
                    <BannerContent>
                      <BannerTitle>Warning banner</BannerTitle>
                      <BannerDescription>Warning review state.</BannerDescription>
                    </BannerContent>
                  </Banner>
                  <Banner variant="danger">
                    <BannerContent>
                      <BannerTitle>Danger banner</BannerTitle>
                      <BannerDescription>Error / blocking state.</BannerDescription>
                    </BannerContent>
                  </Banner>
                </Stack>
              </MatrixCell>
              <MatrixCell title="Modal" note="trigger + open content state">
                <Modal>
                  <ModalTrigger asChild>
                    <Button variant="outline">Open modal</Button>
                  </ModalTrigger>
                  <ModalContent>
                    <ModalHeader>
                      <ModalTitle>Approval modal sample</ModalTitle>
                      <ModalDescription>Canonical overlay and content structure.</ModalDescription>
                    </ModalHeader>
                    <ModalBody>
                      <div className="text-body">Modal body content for visual and structural review.</div>
                    </ModalBody>
                    <ModalFooter>
                      <ModalClose asChild>
                        <Button variant="ghost">Close</Button>
                      </ModalClose>
                      <Button>Confirm</Button>
                    </ModalFooter>
                    <ModalClose />
                  </ModalContent>
                </Modal>
              </MatrixCell>
            </Grid>

            <Grid cols={1} gap="md">
              <MatrixCell
                title="Publication Library Table"
                note="Canonical publication table baseline in approvals (ui Table + house table contract)"
                spec="Publication-style heading controls, sortable headers, and auto-fit/reset table settings"
              >
                <PublicationLibraryTableDemo />
              </MatrixCell>
              <MatrixCell
                title="Publication Drilldown Summary Table"
                note="Second canonical table variant for publication insights drilldown usage"
                spec="Plain table shell style: house-publications-trend-table-shell-plain with auto-fit columns, centered Count/Share, and no inline resize controls"
              >
                <PublicationDrilldownSummaryTableDemo />
              </MatrixCell>
              <MatrixCell
                title="Section Tools Toolbar"
                note="Canonical icon toolbar pattern for section actions (search/filter/tools/settings/visibility)"
                spec="Borderless, no-fill container with neutral resting icons and tone-aware hover/open visuals"
              >
                <SectionToolsDemo />
              </MatrixCell>
              <MatrixCell
                title="Drilldown Section Heading"
                note="Canonical subsection heading pattern inside drilldown content"
                spec="Use heading/content separator tokens for predictable rhythm"
              >
                <DrilldownSectionHeadingDemo />
              </MatrixCell>
            </Grid>
          </Stack>
          <BackToTopLink />
        </Section>

        <Section id="approvals-metrics-motion" surface="card" inset="lg" spaceY="sm" className="scroll-mt-24">
          <SectionHeader
            eyebrow="5"
            heading="Metric Tiles + Motion Governance"
            description="Canonical rules and reusable patterns for metric tiles, chart tooltips, segmented toggles, banners, and animation auditing."
          />
          <Stack space="sm">
            {METRIC_TILE_CONTRACT_ITEMS.map((item) => (
              <div key={item} className="text-caption text-[hsl(var(--muted-foreground))]">• {item}</div>
            ))}
          </Stack>

          <Grid cols={2} gap="md">
            <MatrixCell
              title="Canonical chart-tooltip sample"
              note="Hover + keyboard-focus bars with shared tooltip primitive"
              spec="Tooltip surface and content classes mirror publications chart usage"
            >
              <TooltipProvider>
                <Stack space="sm">
                  <div className="text-caption text-[hsl(var(--muted-foreground))]">Sample: citations by year (focusable bars)</div>
                  <div className="flex items-end gap-2 rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-[var(--space-2)]">
                    {[
                      { label: '2021', value: 42 },
                      { label: '2022', value: 51 },
                      { label: '2023', value: 58 },
                      { label: '2024', value: 63 },
                      { label: '2025', value: 79 },
                    ].map((point) => (
                      <Tooltip key={point.label}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={`${point.label}: ${point.value} citations`}
                            className="group flex w-8 items-end justify-center rounded-[var(--radius-xs)] border border-transparent bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                          >
                            <span
                              className="w-6 rounded-[var(--radius-xs)] bg-[hsl(var(--tone-accent-500))] transition-[height,opacity] duration-[var(--motion-duration-base)] ease-[var(--motion-ease-chart-series)] group-hover:opacity-90"
                              style={{
                                height: `${Math.max(1.4, point.value / 2)}px`,
                                transitionDuration: reducedMotion ? '0ms' : 'var(--motion-duration-base)',
                              }}
                            />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="house-approved-tooltip house-approved-tooltip-content">
                          <div className="text-caption">{point.label}: {point.value} citations</div>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </Stack>
              </TooltipProvider>
            </MatrixCell>

            <MatrixCell
              title="Publication toggle variants (exact patterns)"
              note="Horizontal 2-state + vertical percentile toggles used in chart tiles"
              spec="Uses house-toggle-track/thumb/button + field-percentile button classes"
            >
              <Stack space="sm">
                <div className="text-caption text-[hsl(var(--muted-foreground))]">Horizontal toggle (12m / 5y)</div>
                <div className="house-approved-toggle-context">
                  <div className="house-toggle-track grid grid-cols-2" style={{ width: '8.2rem' }}>
                    <span
                      className="house-toggle-thumb"
                      style={{
                        left: metricWindow === '12m' ? '0%' : '50%',
                        width: '50%',
                        transitionDuration: reducedMotion ? '0ms' : undefined,
                      }}
                      aria-hidden="true"
                    />
                    {(['12m', '5y'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`house-toggle-button ${metricWindow === option ? 'text-white' : 'house-drilldown-toggle-button-muted'}`}
                        aria-pressed={metricWindow === option}
                        onClick={() => setMetricWindow(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-caption text-[hsl(var(--muted-foreground))]">Horizontal visual-mode toggle (bars / line)</div>
                <div className="house-approved-toggle-context">
                  <div className="house-toggle-track grid grid-cols-2" style={{ width: '5.25rem' }}>
                    <span
                      className="house-toggle-thumb"
                      style={{
                        left: chartVisualMode === 'bars' ? '0%' : '50%',
                        width: '50%',
                        transitionDuration: reducedMotion ? '0ms' : undefined,
                      }}
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      className={`house-toggle-button ${chartVisualMode === 'bars' ? 'text-white' : 'house-drilldown-toggle-button-muted'}`}
                      aria-pressed={chartVisualMode === 'bars'}
                      onClick={() => setChartVisualMode('bars')}
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true" className="house-toggle-chart-bar h-3.5 w-3.5 fill-current">
                        <rect x="2" y="8.5" width="2.2" height="5.5" rx="0.6" />
                        <rect x="6.3" y="5.8" width="2.2" height="8.2" rx="0.6" />
                        <rect x="10.6" y="3.5" width="2.2" height="10.5" rx="0.6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={`house-toggle-button ${chartVisualMode === 'line' ? 'text-white' : 'house-drilldown-toggle-button-muted'}`}
                      aria-pressed={chartVisualMode === 'line'}
                      onClick={() => setChartVisualMode('line')}
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
                        <polyline
                          points="2,11 6,8 9,9 14,4"
                          fill="none"
                          className="house-toggle-chart-line"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          data-expanded="true"
                        />
                        <circle cx="2" cy="11" r="1.1" fill="currentColor" />
                        <circle cx="6" cy="8" r="1.1" fill="currentColor" />
                        <circle cx="9" cy="9" r="1.1" fill="currentColor" />
                        <circle cx="14" cy="4" r="1.1" fill="currentColor" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="text-caption text-[hsl(var(--muted-foreground))]">Field percentile 5-state toggle (horizontal, above right chart)</div>
                <div className="house-approved-toggle-context">
                  <div
                    className="house-toggle-track grid grid-cols-5 w-full max-w-[13.5rem]"
                    style={{
                      gridTemplateColumns: `repeat(${FIELD_THRESHOLD_OPTIONS.length}, minmax(0, 1fr))`,
                    }}
                  >
                    <span
                      className={`house-toggle-thumb ${FIELD_THRESHOLD_THUMB_CLASS[fieldThreshold]}`}
                      style={{
                        left: `${FIELD_THRESHOLD_OPTIONS.indexOf(fieldThreshold) * (100 / FIELD_THRESHOLD_OPTIONS.length)}%`,
                        width: `${100 / FIELD_THRESHOLD_OPTIONS.length}%`,
                        transitionDuration: reducedMotion ? '0ms' : undefined,
                      }}
                      aria-hidden="true"
                    />
                    {FIELD_THRESHOLD_OPTIONS.map((threshold) => (
                      <button
                        key={`approval-threshold-${threshold}`}
                        type="button"
                        className={`house-toggle-button inline-flex h-full w-full min-h-0 flex-1 items-center justify-center px-0 py-0 ${fieldThreshold === threshold ? 'text-white' : 'house-drilldown-toggle-button-muted'}`}
                        aria-pressed={fieldThreshold === threshold}
                        onClick={() => setFieldThreshold(threshold)}
                      >
                        {threshold}
                      </button>
                    ))}
                  </div>
                </div>
              </Stack>
            </MatrixCell>
          </Grid>

          <Grid cols={2} gap="md">
            <MatrixCell
              title="Chart family snapshots"
              note="Representative variants used across publication insight tiles"
              spec="Bars, line trend, ring concentration, and composition bars"
            >
              <Grid cols={2} gap="sm">
                <Section surface="muted" inset="sm" spaceY="sm">
                  <div className="text-caption">Bars</div>
                  <div className="flex h-20 items-end gap-1 rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2">
                    {[34, 46, 52, 57, 63].map((value) => (
                      <div key={`bars-${value}`} className="flex-1 rounded-[var(--radius-xs)] bg-[hsl(var(--tone-accent-500))]" style={{ height: `${value}%` }} />
                    ))}
                  </div>
                </Section>
                <Section surface="muted" inset="sm" spaceY="sm">
                  <div className="text-caption">Line trend</div>
                  <div className="flex h-20 items-center rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2">
                    <svg viewBox="0 0 100 36" className="h-full w-full">
                      <polyline
                        points="4,31 18,27 33,22 46,19 60,14 74,10 90,5"
                        fill="none"
                        className="house-toggle-chart-line"
                        stroke="hsl(var(--tone-accent-600))"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        data-expanded="true"
                      />
                    </svg>
                  </div>
                </Section>
                <Section surface="muted" inset="sm" spaceY="sm">
                  <div className="text-caption">Ring concentration</div>
                  <div className="flex h-20 items-center justify-center rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2">
                    <svg viewBox="0 0 100 100" className="h-14 w-14">
                      <circle cx="50" cy="50" r="38" fill="none" stroke="hsl(var(--tone-neutral-300))" strokeWidth="12" />
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        fill="none"
                        stroke="hsl(var(--tone-accent-600))"
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray="239"
                        strokeDashoffset="72"
                        transform="rotate(-90 50 50)"
                        className="house-chart-ring-dashoffset-motion"
                      />
                    </svg>
                  </div>
                </Section>
                <Section surface="muted" inset="sm" spaceY="sm">
                  <div className="text-caption">Composition bars</div>
                  <div className="rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2">
                    <Stack space="sm">
                      {[25, 38, 44].map((value, index) => (
                        <div key={`composition-${value}`} className="space-y-1">
                          <div className="text-caption text-[hsl(var(--muted-foreground))]">Band {index + 1}</div>
                          <div className="h-2 rounded-full bg-[hsl(var(--tone-neutral-200))]">
                            <div className="h-full rounded-full bg-[hsl(var(--tone-accent-600))]" style={{ width: `${value}%` }} />
                          </div>
                        </div>
                      ))}
                    </Stack>
                  </div>
                </Section>
              </Grid>
            </MatrixCell>

            <MatrixCell
              title="Banner + visibility matrices"
              note="Reusable control states for unrelated contexts"
              spec="Publication visibility states + shared banners"
            >
              <Stack space="sm">
                <div className="text-caption text-[hsl(var(--muted-foreground))]">Visibility toggle states</div>
                <Row gap="sm" align="start">
                  <Button
                    type="button"
                    size="sm"
                    variant={insightsVisibility === 'visible' ? 'secondary' : 'outline'}
                    onClick={() => setInsightsVisibility('visible')}
                  >
                    Visible
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={insightsVisibility === 'hidden' ? 'secondary' : 'outline'}
                    onClick={() => setInsightsVisibility('hidden')}
                  >
                    Hidden
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled>
                    Disabled
                  </Button>
                </Row>

                <div className="text-caption text-[hsl(var(--muted-foreground))]">Banner matrix (shared for unrelated states)</div>
                <Stack space="sm">
                  <Banner variant="info">
                    <BannerContent>
                      <BannerTitle>Info</BannerTitle>
                      <BannerDescription>Context banner for guidance and neutral status.</BannerDescription>
                    </BannerContent>
                  </Banner>
                  <Banner variant="warning">
                    <BannerContent>
                      <BannerTitle>Warning</BannerTitle>
                      <BannerDescription>Review required before action continues.</BannerDescription>
                    </BannerContent>
                  </Banner>
                </Stack>
              </Stack>
            </MatrixCell>
          </Grid>

          <Section surface="muted" inset="md" spaceY="sm">
            <SectionHeader
              heading="Animation audit checklist"
              description="Dedicated review table for animation quality, accessibility, and reuse readiness."
            />
            <p className="m-0 text-caption text-[hsl(var(--foreground))]">
              Verdict: mostly uniform and token-aligned, with targeted exceptions in JS timing orchestration that should be normalized next.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Checklist item</TableHead>
                  <TableHead>Requirement</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Evidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ANIMATION_AUDIT_ROWS.map((row) => (
                  <TableRow key={row.item}>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>{row.item}</TableCell>
                    <TableCell>{row.requirement}</TableCell>
                    <TableCell>{row.scope}</TableCell>
                    <TableCell>{row.evidence}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
          <BackToTopLink />
        </Section>

        <Section id="approvals-glossary" surface="card" inset="lg" spaceY="sm" className="scroll-mt-24">
          <SectionHeader
            eyebrow="6"
            heading="Element Definitions Table (Glossary)"
            description="Canonical definitions of primitives, semantic blocks, controls, and patterns."
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Element</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>May set</TableHead>
                <TableHead>Must not set</TableHead>
                <TableHead>Where used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {GLOSSARY_ROWS.map((row) => (
                <TableRow key={row.element}>
                  <TableCell>{row.element}</TableCell>
                  <TableCell>{row.category}</TableCell>
                  <TableCell>{row.maySet}</TableCell>
                  <TableCell>{row.mustNotSet}</TableCell>
                  <TableCell>{row.whereUsed}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Grid cols={2} gap="md">
            <ChartFrame
              heading="Pattern token sanity"
              description="Pattern shell references canonical chart theme + motion tokens."
              actions={<Badge variant="outline">series: {chartTheme.series.length}</Badge>}
            >
              <div
                className="rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-[var(--space-4)] text-caption text-[hsl(var(--muted-foreground))]"
                style={{ transitionDuration: reducedMotion ? '0ms' : chartMotion.duration }}
              >
                Chart body placeholder
              </div>
            </ChartFrame>
            <PanelShell heading="Governance" description="Legacy stories remain archived and non-canonical.">
              <Stack space="sm">
                <div className="text-body">Design System / Approvals remains the single visible Storybook entry.</div>
                <div className="text-caption text-[hsl(var(--muted-foreground))]">Archive content is excluded from active approval input.</div>
              </Stack>
            </PanelShell>
          </Grid>
          <BackToTopLink />
        </Section>
      </Stack>
    </Container>
  )
}
