import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';






const meta: Meta = {
  title: 'Design System/APPROVED/Reference',
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
    style.fontWeight = Number.parseInt(value, 10);
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

 


function TokenSection({ title, tokens }: { title: string; tokens: Record<string, string> }) {
  const entries = Object.entries(tokens)
  if (entries.length === 0) {
    return null
  }

  return (
    <div className="mb-16">
      <h2 className="text-2xl font-bold text-neutral-900 mb-6 pb-3 border-b-2 border-blue-500">{title}</h2>

      {(title.includes('Colors') && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {entries.map(([name, value]) => (
            <ColorSwatch key={name} name={name} value={value} />
          ))}
        </div>
      ))}

      {(title === 'Typography - Scale' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {entries.map(([name, value]) => (
            <TypographyPreview key={name} name={name} value={value} category={title} />
          ))}
        </div>
      ))}

      {(title === 'Spacing' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {entries.map(([name, value]) => (
            <SpacingPreview key={name} name={name} value={value} />
          ))}
        </div>
      ))}

      {(title === 'Border Radius' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {entries.map(([name, value]) => (
            <div key={name} className="p-3 border border-neutral-200 rounded-md">
              <p className="text-xs font-medium text-neutral-900 mb-2">{name}</p>
              <div className="w-12 h-12 bg-blue-200 border border-blue-400" style={{ borderRadius: value }} />
              <p className="text-xs text-neutral-600 font-mono mt-2">{value}</p>
            </div>
          ))}
        </div>
      ))}

      {(title === 'Elevation / Shadows' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {entries.map(([name, value]) => (
            <ShadowPreview key={name} name={name} value={value} />
          ))}
        </div>
      ))}

      {(title.includes('Motion') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {entries.map(([name, value]) => <MotionPreview key={name} name={name} value={value} />)}
        </div>
      ))}

      {!(title.includes('Colors') || title.includes('Typography') || title.includes('Spacing') || title.includes('Border Radius') || title.includes('Elevation') || title.includes('Motion')) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {entries.map(([name, value]) => (
            <div key={name} className="p-3 border border-neutral-200 rounded-md">
              <p className="text-xs font-medium text-neutral-900 mb-2">{name}</p>
              <p className="text-xs text-neutral-600 font-mono break-all">{value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AllTokensReference() {
  const [tokens, setTokens] = useState<Record<string, Record<string, string>>>({})

  useEffect(() => {
    setTokens(getTokensByCategory())
  }, [])

  const sections = [
    'Colors - Semantic',
    'Colors - Neutral',
    'Colors - Accent',
    'Colors - Positive',
    'Colors - Warning',
    'Colors - Danger',
    'Colors - Brand',
    'Colors - Chart',
    'Colors - Stroke',
    'Typography - Family',
    'Typography - Scale',
    'Typography - Font Size',
    'Typography - Font Weight',
    'Typography - Line Height',
    'Typography - Letter Spacing',
    'Spacing',
    'Sizing',
    'Border Radius',
    'Elevation / Shadows',
    'Rings',
    'Motion - Duration',
    'Motion - Easing',
    'Motion - Aliases',
    'Navigation Tokens',
    'House Tokens',
    'Section Styles',
    'Auth Tokens',
  ]

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">Design Tokens Reference</h1>
          <p className="text-lg text-neutral-600">Complete catalog of all design tokens. Update <code className="bg-neutral-100 px-2 py-1 rounded">src/index.css</code> to see changes reflected here.</p>
        </div>

        {sections.map((title) => (
          <TokenSection key={title} title={title} tokens={tokens[title] || {}} />
        ))}

      </div>
    </div>
  )
}

type Story = StoryObj

export const Reference: Story = {
  render: () => <AllTokensReference />,
}

