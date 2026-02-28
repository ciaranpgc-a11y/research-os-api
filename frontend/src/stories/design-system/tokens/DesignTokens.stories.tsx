import type { Meta, StoryObj } from '@storybook/react';
import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { ButtonPrimitive } from '@/components/primitives/ButtonPrimitive';
import { InputPrimitive } from '@/components/primitives/InputPrimitive';
import { LoginCard } from '@/components/auth/LoginCard';
import { TopBar } from '@/components/layout/top-bar';

const meta: Meta = {
  title: 'Design System/Tokens/All Tokens Reference',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Complete reference of all design tokens. Update src/index.css to see changes reflected here.',
      },
    },
  },
};

export default meta;

/**
 * Get all CSS custom properties from root and organize by category
 */
function getTokensByCategory() {
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const tokens: Record<string, Record<string, string>> = {
    'Colors - Semantic': {},
    'Colors - Neutral': {},
    'Colors - Accent': {},
    'Colors - Positive': {},
    'Colors - Warning': {},
    'Colors - Danger': {},
    'Colors - Brand': {},
    'Colors - Chart': {},
    'Colors - Stroke': {},
    'Typography - Family': {},
    'Typography - Scale': {},
    'Typography - Font Size': {},
    'Typography - Font Weight': {},
    'Typography - Line Height': {},
    'Typography - Letter Spacing': {},
    'Spacing': {},
    'Sizing': {},
    'Border Radius': {},
    'Elevation / Shadows': {},
    'Rings': {},
    'Motion - Duration': {},
    'Motion - Easing': {},
    'Motion - Aliases': {},
    'Navigation Tokens': {},
    'House Tokens': {},
    'Section Styles': {},
    'Auth Tokens': {},
    Uncategorized: {},
  };

  // Parse all CSS custom properties
  for (let i = 0; i < styles.length; i++) {
    const prop = styles[i];
    if (prop.startsWith('--')) {
      const value = styles.getPropertyValue(prop).trim();

      if (prop.includes('tone-neutral')) tokens['Colors - Neutral'][prop] = value;
      else if (prop.includes('tone-accent')) tokens['Colors - Accent'][prop] = value;
      else if (prop.includes('tone-positive')) tokens['Colors - Positive'][prop] = value;
      else if (prop.includes('tone-warning')) tokens['Colors - Warning'][prop] = value;
      else if (prop.includes('tone-danger')) tokens['Colors - Danger'][prop] = value;
      else if (
        prop === '--background' ||
        prop === '--foreground' ||
        prop.includes('--card') ||
        prop.includes('--muted') ||
        prop.includes('--border') ||
        prop.includes('--ring') ||
        prop.includes('--primary') ||
        prop.includes('--accent') ||
        prop.includes('--destructive') ||
        prop.includes('--status') ||
        prop.includes('--surface')
      ) {
        tokens['Colors - Semantic'][prop] = value;
      } else if (prop.includes('--brand-')) tokens['Colors - Brand'][prop] = value;
      else if (prop.includes('--chart-')) tokens['Colors - Chart'][prop] = value;
      else if (prop.includes('--stroke-')) tokens['Colors - Stroke'][prop] = value;
      else if (prop.includes('font-family')) tokens['Typography - Family'][prop] = value;
      else if (prop.startsWith('--text-')) tokens['Typography - Scale'][prop] = value;
      else if (prop.includes('font-size')) tokens['Typography - Font Size'][prop] = value;
      else if (prop.includes('font-weight')) tokens['Typography - Font Weight'][prop] = value;
      else if (prop.includes('line-height') || prop === '--line-normal') tokens['Typography - Line Height'][prop] = value;
      else if (prop.includes('letter-spacing')) tokens['Typography - Letter Spacing'][prop] = value;
      else if (prop.includes('--space-')) tokens['Spacing'][prop] = value;
      else if (prop.includes('--sz-')) tokens['Sizing'][prop] = value;
      else if (prop.includes('radius')) tokens['Border Radius'][prop] = value;
      else if (prop.includes('elevation') || prop.includes('shadow')) tokens['Elevation / Shadows'][prop] = value;
      else if (prop.startsWith('--ring-') || prop === '--ring') tokens['Rings'][prop] = value;
      else if (prop.includes('motion-duration')) tokens['Motion - Duration'][prop] = value;
      else if (prop.includes('motion-ease') || prop.startsWith('--ease-')) tokens['Motion - Easing'][prop] = value;
      else if (prop.startsWith('--motion-')) tokens['Motion - Aliases'][prop] = value;
      else if (prop.startsWith('--top-nav-')) tokens['Navigation Tokens'][prop] = value;
      else if (prop.startsWith('--house-')) tokens['House Tokens'][prop] = value;
      else if (prop.startsWith('--section-style-')) tokens['Section Styles'][prop] = value;
      else if (prop.includes('auth') || prop.includes('button-auth')) tokens['Auth Tokens'][prop] = value;
      else tokens.Uncategorized[prop] = value;
    }
  }

  return tokens;
}

/**
 * Color swatch component
 */
function ColorSwatch({ name, value }: { name: string; value: string }) {
  // Parse HSL value and create a swatch
  const isHsl = value.includes('hsl(');
  const isHslTuple = /^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/.test(value);
  const isRgb = value.startsWith('rgb(');
  const isHex = value.startsWith('#');
  const isVar = value.startsWith('var(');
  const bgColor = isHsl
    ? value
    : isRgb
      ? value
      : isHex
        ? value
        : isHslTuple
          ? `hsl(${value})`
          : isVar
            ? `hsl(${value})`
            : value;

  return (
    <div className="flex items-center gap-4 p-3 border border-neutral-200 rounded-md hover:bg-neutral-50 transition-colors">
      <div
        className="w-12 h-12 rounded-md border border-neutral-300 flex-shrink-0"
        style={{ backgroundColor: bgColor }}
        title={value}
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-neutral-900 truncate">{name}</p>
        <p className="text-xs text-neutral-600 font-mono truncate">{value}</p>
      </div>
    </div>
  );
}

/**
 * Typography preview component
 */
function TypographyPreview({
  name,
  value,
  category,
}: {
  name: string;
  value: string;
  category: string;
}) {
  const style: React.CSSProperties = {};

  if (category.includes('Font Size')) {
    style.fontSize = value;
  } else if (category.includes('Font Weight')) {
    style.fontWeight = parseInt(value) as any;
  } else if (category.includes('Line Height')) {
    style.lineHeight = value;
  } else if (category.includes('Letter Spacing')) {
    style.letterSpacing = value;
  }

  return (
    <div className="p-3 border border-neutral-200 rounded-md hover:bg-neutral-50 transition-colors">
      <p className="text-xs font-medium text-neutral-900 mb-2">{name}</p>
      <p style={style} className="text-neutral-700">
        The quick brown fox jumps over the lazy dog
      </p>
      <p className="text-xs text-neutral-600 font-mono mt-2">{value}</p>
    </div>
  );
}

/**
 * Spacing preview component
 */
function SpacingPreview({ name, value }: { name: string; value: string }) {
  // Convert rem to px for visualization
  const pxValue = parseFloat(value) * 16;

  return (
    <div className="p-3 border border-neutral-200 rounded-md">
      <p className="text-xs font-medium text-neutral-900 mb-2">{name}</p>
      <div className="flex items-center gap-3">
        <div
          className="bg-blue-200 border border-blue-400 rounded-sm flex-shrink-0"
          style={{ width: `${Math.min(pxValue, 200)}px`, height: '24px' }}
        />
        <p className="text-xs text-neutral-600 font-mono whitespace-nowrap">
          {value} ({pxValue}px)
        </p>
      </div>
    </div>
  );
}

/**
 * Section style swatch component
 */
function SectionStyleSwatch({ name, value }: { name: string; value: string }) {
  const previewValue = value.trim();
  const isHslTuple = /^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/.test(previewValue);
  const swatchColor = previewValue.startsWith('hsl(')
    ? previewValue
    : previewValue.startsWith('var(')
      ? `hsl(${previewValue})`
      : isHslTuple
        ? `hsl(${previewValue})`
        : `var(${name})`;

  return (
    <div className="flex items-center gap-4 rounded-md border border-neutral-200 p-3">
      <div
        className="h-8 w-16 rounded-sm border border-neutral-300"
        style={{ backgroundColor: swatchColor }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-neutral-900">{name}</p>
        <p className="truncate text-xs text-neutral-600 font-mono">{value}</p>
      </div>
    </div>
  );
}

/**
 * Elevation/Shadow preview component
 */
function ShadowPreview({ name, value }: { name: string; value: string }) {
  return (
    <div className="p-4 border border-neutral-200 rounded-md">
      <p className="text-xs font-medium text-neutral-900 mb-3">{name}</p>
      <div
        className="bg-white p-4 rounded-md"
        style={{ boxShadow: value }}
      >
        <p className="text-sm text-neutral-600">Element with shadow</p>
      </div>
      <p className="text-xs text-neutral-600 font-mono mt-2 break-all">{value}</p>
    </div>
  );
}

/**
 * Motion token preview component
 */
function MotionPreview({ name, value }: { name: string; value: string }) {
  const isDuration = name.includes('duration');

  return (
    <div className="p-3 border border-neutral-200 rounded-md">
      <p className="text-xs font-medium text-neutral-900 mb-3">{name}</p>
      {isDuration ? (
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 bg-blue-500 rounded-full animate-pulse"
            style={{
              animation: `pulse var(${name})`,
            }}
          />
          <p className="text-xs text-neutral-600 font-mono">{value}</p>
        </div>
      ) : (
        <p className="text-xs text-neutral-600 font-mono break-all">{value}</p>
      )}
    </div>
  );
}

function formatPxFromToken(value: string): string {
  const tokenValue = value.trim();
  if (!tokenValue) {
    return 'n/a';
  }

  if (tokenValue.includes('rem')) {
    const numeric = parseFloat(tokenValue);
    if (Number.isNaN(numeric)) {
      return tokenValue;
    }
    return `${tokenValue} (${(numeric * 16).toFixed(2)}px)`;
  }

  if (tokenValue.includes('px')) {
    const numeric = parseFloat(tokenValue);
    if (Number.isNaN(numeric)) {
      return tokenValue;
    }
    return `${tokenValue} (${numeric.toFixed(2)}px)`;
  }

  return tokenValue;
}

/**
 * Section marker (top navigation / strip style) approved reference
 */
function ApprovedSectionMarkerTokens() {
  const [markerTokens, setMarkerTokens] = useState<Record<string, string>>({});

  useEffect(() => {
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    setMarkerTokens({
      width: styles.getPropertyValue('--top-nav-rail-width').trim(),
      height: styles.getPropertyValue('--top-nav-rail-height').trim(),
      left: styles.getPropertyValue('--top-nav-rail-left').trim(),
      gap: styles.getPropertyValue('--top-nav-rail-gap').trim(),
      hoverBg: styles.getPropertyValue('--top-nav-hover-bg').trim(),
      activeBg: styles.getPropertyValue('--top-nav-active-bg').trim(),
      transition: styles.getPropertyValue('--motion-duration-ui').trim(),
    });
  }, []);

  const sectionMarkers = [
    { label: 'Workspace', className: 'house-top-nav-item-workspace', accent: '--section-style-workspace-accent' },
    { label: 'Profile', className: 'house-top-nav-item-profile', accent: '--section-style-profile-accent' },
    { label: 'Learning Centre', className: 'house-top-nav-item-learning-centre', accent: '--section-style-learning-centre-accent' },
    { label: 'Opportunities', className: 'house-top-nav-item-opportunities', accent: '--section-style-opportunities-accent' },
  ];

  return (
    <section className="mb-16">
      <h2 className="text-2xl font-bold text-neutral-900 mb-6 pb-3 border-b-2 border-blue-500">
        Approved Navigation Marker Tokens
      </h2>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="border border-neutral-200 rounded-md p-4">
            <p className="text-sm font-semibold text-neutral-900 mb-3">Marker geometry (current)</p>
            <ul className="space-y-1 text-xs text-neutral-700">
              <li>
                <span className="font-medium text-neutral-900">width:</span>{' '}
                {markerTokens.width ? `${formatPxFromToken(markerTokens.width)} [--top-nav-rail-width]` : '—'}
              </li>
              <li>
                <span className="font-medium text-neutral-900">height:</span>{' '}
                {markerTokens.height ? `${formatPxFromToken(markerTokens.height)} [--top-nav-rail-height]` : '—'}
              </li>
              <li>
                <span className="font-medium text-neutral-900">left offset:</span>{' '}
                {markerTokens.left ? `${formatPxFromToken(markerTokens.left)} [--top-nav-rail-left]` : '—'}
              </li>
              <li>
                <span className="font-medium text-neutral-900">content gap:</span>{' '}
                {markerTokens.gap ? `${formatPxFromToken(markerTokens.gap)} [--top-nav-rail-gap]` : '—'}
              </li>
              <li>
                <span className="font-medium text-neutral-900">active bg:</span>{' '}
                {markerTokens.activeBg ? markerTokens.activeBg : '—'}
              </li>
              <li>
                <span className="font-medium text-neutral-900">hover bg:</span>{' '}
                {markerTokens.hoverBg ? markerTokens.hoverBg : '—'}
              </li>
            </ul>
          </div>
          <div className="border border-neutral-200 rounded-md p-4">
            <p className="text-sm font-semibold text-neutral-900 mb-3">Button geometry</p>
            <ul className="space-y-1 text-xs text-neutral-700">
              <li><span className="font-medium text-neutral-900">button item height:</span> 2.25rem</li>
              <li><span className="font-medium text-neutral-900">button radius:</span> 0.42rem</li>
              <li><span className="font-medium text-neutral-900">font:</span> 0.875rem / font-weight 600</li>
              <li><span className="font-medium text-neutral-900">transition:</span> {markerTokens.transition ? markerTokens.transition : 'var(--motion-duration-ui)'} var(--motion-duration-ui) + ease-out</li>
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-sm font-semibold text-neutral-900">Active section markers (4 variants)</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {sectionMarkers.map((sectionMarker) => (
              <div key={sectionMarker.label} className="border border-neutral-200 rounded-md p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-neutral-900">{sectionMarker.label}</p>
                  <span className="text-xs text-neutral-500">{sectionMarker.accent}</span>
                </div>
                <button
                  type="button"
                  className={`house-top-nav-item house-top-nav-item-active ${sectionMarker.className} !w-full`}
                  disabled
                >
                  {sectionMarker.label}
                </button>
                <p className="mt-2 text-xs text-neutral-600">
                  Uses marker width defined by <span className="font-mono">--top-nav-rail-width</span> and height by <span className="font-mono">--top-nav-rail-height</span>.
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

type HeaderScope = 'account' | 'workspace';

type HeaderTopBarVariant = {
  id: string;
  label: string;
  path: string;
  scope: HeaderScope;
  note: string;
  variables?: Record<string, string>;
};

function ApprovedHeaderBarSection() {
  const activeScope: HeaderScope = '"'"'workspace'"'"';
  const initialPath = '"'"'/workspaces'"'"';

  return (
    <section className="mb-16">
      <h2 className="text-2xl font-bold text-neutral-900 mb-6 pb-3 border-b-2 border-blue-500">
        Approved Header Bar Patterns
      </h2>
      <p className="mb-4 text-sm text-neutral-600">
        Use this as the canonical top bar pattern for reuse across pages.
      </p>

      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-neutral-200 px-4 py-2">
          <p className="text-sm font-semibold text-neutral-900">Approved Header Bar (single canonical variant)</p>
          <p className="text-xs text-neutral-600">Workspace scope with direct click-through routes</p>
        </div>

        <style>{`
          .approved-header-no-motion .house-top-nav-item,
          .approved-header-no-motion .house-top-nav-item::before,
          .approved-header-no-motion .house-utility-button {
            transition: none !important;
          }

          .approved-header-no-motion .house-top-nav-item:hover {
            transform: none !important;
          }
        `}</style>

        <div
          className="approved-header-no-motion bg-card"
          style={{ '"'"'--top-nav-hover-bg'"'"': '"'"'var(--tone-neutral-100)'"'"' } as React.CSSProperties}
        >
          <MemoryRouter initialEntries={[initialPath]}>
            <TopBar key={initialPath} scope={activeScope} onOpenLeftNav={() => undefined} showLeftNavButton />
          </MemoryRouter>
        </div>
      </div>
    </section>
  );
}
