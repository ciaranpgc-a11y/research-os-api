import type { Meta, StoryObj } from '@storybook/react';
import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { ButtonPrimitive } from '@/components/primitives/ButtonPrimitive';
import { InputPrimitive } from '@/components/primitives/InputPrimitive';
import { LoginCard } from '@/components/auth/LoginCard';

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

function ProviderIconMark({ provider }: { provider: 'orcid' | 'google' | 'microsoft' }) {
  if (provider === 'orcid') {
    return (
      <span aria-hidden className="inline-flex h-[1.25rem] w-[1.25rem] items-center justify-center rounded-sm bg-transparent">
        <svg viewBox="0 0 24 24" className="h-[1.05rem] w-[1.05rem]" aria-hidden>
          <circle cx="12" cy="12" r="11" fill="#A6CE39" />
          <text
            x="12"
            y="15.2"
            textAnchor="middle"
            fontSize="10.6"
            fontWeight="700"
            fontFamily="Arial, Helvetica, sans-serif"
            letterSpacing="-0.25"
            fill="#FFFFFF"
          >
            iD
          </text>
        </svg>
      </span>
    );
  }

  if (provider === 'google') {
    return (
      <span aria-hidden className="inline-flex h-[1.25rem] w-[1.25rem] items-center justify-center rounded-sm bg-transparent">
        <svg viewBox="0 0 24 24" className="h-[1.03rem] w-[1.03rem]" aria-hidden>
          <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.29h6.46a5.52 5.52 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.56-5.15 3.56-8.64z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.86-3a7.16 7.16 0 0 1-10.66-3.76H1.43v3.09A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.42 14.33a7.2 7.2 0 0 1 0-4.66V6.58H1.43a12 12 0 0 0 0 10.84l3.99-3.09z" />
          <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.94 1.19 15.23 0 12 0A12 12 0 0 0 1.43 6.58l3.99 3.09A7.16 7.16 0 0 1 12 4.77z" />
        </svg>
      </span>
    );
  }

  return (
    <span aria-hidden className="inline-flex h-[1.25rem] w-[1.25rem] items-center justify-center rounded-sm bg-transparent">
      <svg viewBox="0 0 24 24" className="h-[0.98rem] w-[0.98rem]" aria-hidden>
        <rect x="2" y="2" width="9" height="9" fill="#F25022" />
        <rect x="13" y="2" width="9" height="9" fill="#7FBA00" />
        <rect x="2" y="13" width="9" height="9" fill="#00A4EF" />
        <rect x="13" y="13" width="9" height="9" fill="#FFB900" />
      </svg>
    </span>
  );
}

/**
 * Approved auth elements for reuse
 */
function AuthButtonPatterns() {
  const [showPassword, setShowPassword] = useState(false);
  const [isPrimaryCtaHovered, setIsPrimaryCtaHovered] = useState(false);

  const authLabelClass =
    'text-[0.8rem] font-medium uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-600))]';
  const authInputClass =
    '!h-8 !min-h-0 border-[hsl(var(--tone-neutral-500))] bg-card !text-[0.96rem] !font-normal !leading-[1.25] text-[hsl(var(--tone-neutral-900))] placeholder:text-[0.9rem] placeholder:text-[hsl(var(--tone-neutral-600))] hover:border-[hsl(var(--tone-neutral-600))] focus-visible:border-[hsl(var(--tone-accent-600))] focus-visible:ring-[hsl(var(--tone-accent-500))]';
  const authPasswordInputClass =
    `${authInputClass} !border-0 !bg-transparent !shadow-none !focus-visible:ring-0 !focus-visible:border-transparent`;
  const authInputStyle: React.CSSProperties = { paddingBlock: '0', lineHeight: '1.25' };
  const authPasswordWrapClass =
    'flex h-8 items-center overflow-hidden rounded-md border border-[hsl(var(--tone-neutral-500))] bg-card transition-colors hover:border-[hsl(var(--tone-neutral-600))] focus-within:border-[hsl(var(--tone-neutral-700))] focus-within:ring-0';
  const authPasswordToggleClass =
    'inline-flex !h-full !min-h-0 w-9 shrink-0 items-center justify-center !rounded-none !border-0 border-l border-[hsl(var(--tone-neutral-500))] !bg-transparent !text-[hsl(var(--tone-neutral-500))] !shadow-none !transition-none !duration-0 !ease-linear !transform-none hover:!bg-transparent hover:!text-[hsl(var(--tone-neutral-700))] hover:!shadow-none hover:!transform-none !active:bg-transparent !active:shadow-none !active:scale-100 !active:translate-y-0 focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!border-[hsl(var(--tone-neutral-500))] focus-visible:!shadow-none';
  const authPasswordToggleStyle: React.CSSProperties = {
    backgroundColor: 'transparent',
    boxShadow: 'none',
    transition: 'none',
    transform: 'none',
  };
  const authPrimaryButtonClass =
    'w-full !h-[calc(var(--button-auth-height)-4px)] !min-h-[calc(var(--button-auth-height)-4px)] !rounded-[0.25rem] !border px-[var(--space-3)] !text-[0.9rem] !font-medium uppercase tracking-[0.06em] !text-[hsl(var(--tone-neutral-50))] !transition-none !transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone-accent-500))] focus-visible:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed !active:scale-100 !active:translate-y-0';
  const authPrimaryButtonStyle: React.CSSProperties = {
    height: 'calc(var(--button-auth-height, 2.5rem) - 4px)',
    minHeight: 'calc(var(--button-auth-height, 2.5rem) - 4px)',
    borderRadius: '0.25rem',
    fontSize: '0.9rem',
    fontWeight: 500,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    paddingInline: 'var(--space-3)',
    borderColor: isPrimaryCtaHovered ? 'hsl(var(--tone-accent-900))' : 'hsl(var(--tone-accent-800))',
    backgroundColor: isPrimaryCtaHovered ? 'hsl(var(--tone-accent-800))' : 'hsl(var(--tone-accent-700))',
    color: 'hsl(var(--tone-neutral-50))',
    boxShadow: isPrimaryCtaHovered
      ? '0 0 0 2px hsl(var(--tone-neutral-50) / 0.24), var(--elevation-2)'
      : 'none',
    transition: 'none',
    animation: 'none',
    transform: 'none',
  };

  const oauthActions = [
    { id: 'orcid', label: 'ORCID', icon: <ProviderIconMark provider="orcid" />, onClick: () => {}, title: 'ORCID' },
    { id: 'google', label: 'Google', icon: <ProviderIconMark provider="google" />, onClick: () => {}, title: 'Google' },
    { id: 'microsoft', label: 'Microsoft', icon: <ProviderIconMark provider="microsoft" />, onClick: () => {}, title: 'Microsoft' },
  ];

  return (
    <section className="mb-16">
      <h2 className="text-2xl font-bold text-neutral-900 mb-6 pb-3 border-b-2 border-blue-500">
        Approved Auth Elements
      </h2>
      <div className="space-y-6">
        <div className="p-4 border border-neutral-200 rounded-md">
          <p className="text-sm font-semibold text-neutral-900 mb-3">Approved Auth (Exact Live Sign-in)</p>
          <div className="bg-[hsl(var(--tone-neutral-100))] p-4">
            <LoginCard
              title="Access your research workspace"
              subtitle=""
              loading={false}
              status=""
              error=""
              oauthActions={oauthActions}
              footer={(
                <div className="mt-3 text-center">
                  <p className="text-[0.86rem] font-medium uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-600))]">
                    Ready to start?
                  </p>
                  <a
                    href="#"
                    className="mt-1 inline-block text-label font-medium underline underline-offset-2 !text-[hsl(var(--tone-neutral-900))] visited:!text-[hsl(var(--tone-neutral-900))] hover:!text-[hsl(var(--tone-accent-700))] active:!text-[hsl(var(--tone-accent-700))] transition-colors"
                    onClick={(event) => event.preventDefault()}
                  >
                    Create your research workspace
                  </a>
                </div>
              )}
            >
                <div className="space-y-5">
                  <div className="space-y-[0.3rem]">
                  <label className={authLabelClass}>Email address</label>
                  <InputPrimitive
                    value="email@address.com"
                    readOnly
                    className={authInputClass}
                    style={authInputStyle}
                  />
                </div>
                  <div className="space-y-[0.3rem]">
                  <label className={authLabelClass}>Password</label>
                  <div className={authPasswordWrapClass}>
                    <InputPrimitive
                      value="Enter your password"
                      readOnly
                      type={showPassword ? 'text' : 'password'}
                      className={authPasswordInputClass}
                      style={authInputStyle}
                    />
                    <ButtonPrimitive
                      type="button"
                      className={authPasswordToggleClass}
                      style={authPasswordToggleStyle}
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-7 w-7" strokeWidth={2} /> : <Eye className="h-7 w-7" strokeWidth={2} />}
                    </ButtonPrimitive>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <a
                    href="#"
                    className="-mt-[0.35rem] block text-[0.86rem] font-normal text-[hsl(var(--tone-neutral-600))] no-underline transition-[color,text-decoration-color] duration-[var(--motion-duration-ui)] hover:underline hover:text-[hsl(var(--tone-neutral-800))] focus-visible:underline focus-visible:text-[hsl(var(--tone-neutral-800))]"
                    onClick={(event) => event.preventDefault()}
                  >
                    Reset password
                  </a>
                </div>
                <ButtonPrimitive
                  type="button"
                  className={authPrimaryButtonClass}
                  style={{ ...authPrimaryButtonStyle, marginTop: '1.9rem' }}
                  onMouseEnter={() => setIsPrimaryCtaHovered(true)}
                  onMouseLeave={() => setIsPrimaryCtaHovered(false)}
                >
                  Sign in
                </ButtonPrimitive>
              </div>
            </LoginCard>
          </div>
        </div>

        <div className="p-4 border border-neutral-200 rounded-md">
          <p className="text-sm font-semibold text-neutral-900 mb-3">Approved Auth Icons</p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2">
              <Eye className="h-5 w-5 text-[hsl(var(--tone-neutral-600))]" />
              <span className="text-xs text-neutral-600">Eye</span>
            </span>
            <span className="inline-flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2">
              <EyeOff className="h-5 w-5 text-[hsl(var(--tone-neutral-600))]" />
              <span className="text-xs text-neutral-600">Eye Off</span>
            </span>
            <span className="inline-flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2">
              <ProviderIconMark provider="orcid" />
              <span className="text-xs text-neutral-600">ORCID</span>
            </span>
            <span className="inline-flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2">
              <ProviderIconMark provider="google" />
              <span className="text-xs text-neutral-600">Google</span>
            </span>
            <span className="inline-flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2">
              <ProviderIconMark provider="microsoft" />
              <span className="text-xs text-neutral-600">Microsoft</span>
            </span>
          </div>
        </div>

        <div className="p-4 border border-neutral-200 rounded-md">
          <p className="text-sm font-semibold text-neutral-900 mb-3">Approved Error Container (Auth)</p>
          <div
            className="max-w-[32rem] flex items-center justify-center border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-3 text-center"
            style={{
              height: 'calc(var(--button-auth-height, 2.5rem) - 4px)',
              minHeight: 'calc(var(--button-auth-height, 2.5rem) - 4px)',
              borderRadius: '0.25rem',
            }}
          >
            <p className="text-sm leading-none text-[hsl(var(--tone-danger-700))]">
              Incorrect password. Please try again.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Main story component
 */
export function AllTokensReference() {
  const [tokens, setTokens] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    setTokens(getTokensByCategory());
  }, []);

  const totalTokens = Object.values(tokens).reduce((sum, categoryTokens) => sum + Object.keys(categoryTokens).length, 0);
  const typographyTiers = [
    { label: 'H1', className: 'text-h1', sample: 'Access your research workspace' },
    { label: 'H2', className: 'text-h2', sample: 'Section Heading Tier' },
    { label: 'H3', className: 'text-h3', sample: 'Card / Panel Title Tier' },
    { label: 'Heading', className: 'text-heading', sample: 'General Heading Scale' },
    { label: 'House Title', className: 'house-title', sample: 'Section Title / Utility Heading' },
    { label: 'House H1', className: 'house-h1', sample: 'Primary Heading Tier' },
    { label: 'House H2', className: 'house-h2', sample: 'Secondary Heading Tier' },
    { label: 'House H3', className: 'house-h3', sample: 'Tertiary Heading Tier' },
    { label: 'Display', className: 'text-display', sample: 'Publication Intelligence' },
    { label: 'Body Strong', className: 'text-body-strong', sample: 'Stronger paragraph and emphasis body text.' },
    { label: 'Body Secondary', className: 'text-body-secondary', sample: 'Supporting paragraph and secondary body text.' },
    { label: 'Body', className: 'text-body', sample: 'The quick brown fox jumps over the lazy dog.' },
    { label: 'Label', className: 'text-label', sample: 'Interface Label Text' },
    { label: 'Caption', className: 'text-caption', sample: 'Auxiliary caption and metadata text' },
  ];

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">Design Tokens Reference</h1>
          <p className="text-lg text-neutral-600">
            Complete catalog of all design tokens. Update <code className="bg-neutral-100 px-2 py-1 rounded">src/index.css</code> to see changes reflected here.
          </p>
          <p className="mt-2 text-sm text-neutral-500">Detected tokens: {totalTokens}</p>
        </div>

        <div className="mb-16">
          <h2 className="text-2xl font-bold text-neutral-900 mb-6 pb-3 border-b-2 border-blue-500">
            Typography Tiers (Implemented Classes)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {typographyTiers.map((tier) => (
              <div key={tier.className} className="p-4 border border-neutral-200 rounded-md hover:bg-neutral-50 transition-colors">
                <p className="text-xs font-medium text-neutral-900 mb-2">{tier.label}</p>
                <p className={tier.className}>{tier.sample}</p>
                <p className="text-xs text-neutral-600 font-mono mt-3">{tier.className}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Token categories */}
        {Object.entries(tokens).map(([category, categoryTokens]) => {
          if (Object.keys(categoryTokens).length === 0) return null;

          return (
            <div key={category} className="mb-16">
              <h2 className="text-2xl font-bold text-neutral-900 mb-6 pb-3 border-b-2 border-blue-500">
                {category}
              </h2>

              {/* Colors */}
              {category.includes('Colors') && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(categoryTokens).map(([name, value]) => (
                    <ColorSwatch key={name} name={name} value={value} />
                  ))}
                </div>
              )}

              {/* Typography */}
              {category.includes('Typography') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(categoryTokens).map(([name, value]) => (
                    <TypographyPreview
                      key={name}
                      name={name}
                      value={value}
                      category={category}
                    />
                  ))}
                </div>
              )}

              {/* Spacing */}
              {category.includes('Spacing') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(categoryTokens).map(([name, value]) => (
                    <SpacingPreview key={name} name={name} value={value} />
                  ))}
                </div>
              )}

              {/* Sizing */}
              {category.includes('Sizing') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(categoryTokens).map(([name, value]) => (
                    <SpacingPreview key={name} name={name} value={value} />
                  ))}
                </div>
              )}

              {/* Border Radius */}
              {category.includes('Border Radius') && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(categoryTokens).map(([name, value]) => (
                    <div key={name} className="p-3 border border-neutral-200 rounded-md">
                      <p className="text-xs font-medium text-neutral-900 mb-2">{name}</p>
                      <div
                        className="w-12 h-12 bg-blue-200 border border-blue-400"
                        style={{ borderRadius: value }}
                      />
                      <p className="text-xs text-neutral-600 font-mono mt-2">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Elevation / Shadows */}
              {category.includes('Elevation') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(categoryTokens).map(([name, value]) => (
                    <ShadowPreview key={name} name={name} value={value} />
                  ))}
                </div>
              )}

              {/* Motion */}
              {category.includes('Motion') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(categoryTokens).map(([name, value]) => (
                    <MotionPreview key={name} name={name} value={value} />
                  ))}
                </div>
              )}

              {/* Auth Tokens */}
              {category.includes('Auth') && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(categoryTokens).map(([name, value]) => {
                    // Try to detect and render appropriately
                    if (value.includes('hsl') || value.startsWith('rgb')) {
                      return <ColorSwatch key={name} name={name} value={value} />;
                    }
                    return (
                      <div key={name} className="p-3 border border-neutral-200 rounded-md">
                        <p className="text-xs font-medium text-neutral-900 truncate">{name}</p>
                        <p className="text-xs text-neutral-600 font-mono truncate mt-1">{value}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Generic fallback */}
              {(
                category.includes('Rings') ||
                category.includes('Navigation') ||
                category.includes('House') ||
                category.includes('Uncategorized')
              ) && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(categoryTokens).map(([name, value]) => (
                    <div key={name} className="p-3 border border-neutral-200 rounded-md">
                      <p className="text-xs font-medium text-neutral-900 truncate">{name}</p>
                      <p className="text-xs text-neutral-600 font-mono break-all mt-1">{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <AuthButtonPatterns />

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-neutral-200">
          <p className="text-xs text-neutral-600">
            This page is automatically generated from <code className="bg-neutral-100 px-2 py-1 rounded">src/index.css</code> CSS custom properties. It updates whenever tokens change.
          </p>
        </div>
      </div>
    </div>
  );
}

export const Default: StoryObj = {
  render: () => <AllTokensReference />,
};



