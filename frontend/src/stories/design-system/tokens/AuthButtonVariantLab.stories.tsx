import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';

type AuthMode = 'signin' | 'register' | 'both';

type ButtonOption = {
  id: string;
  mode: AuthMode;
  label: string;
  summary: string;
  className: string;
};

type CtaOption = {
  id: string;
  label: string;
  summary: string;
  className: string;
};

const meta: Meta = {
  title: 'Design System/Tokens/Auth Button Variant Lab',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Token-first auth button variants built only from CSS token classes. Use this as the chooser page for Sign in / Register visuals.',
      },
    },
  },
};

export default meta;

const baseButtonClass =
  'auth-house-btn inline-flex w-fit min-w-[9rem] items-center justify-center rounded-md text-label font-medium leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone-accent-500))] focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed';

const optionSets: ButtonOption[] = [
  {
    id: 'b1',
    mode: 'signin',
    label: '1. Slate Edge',
    summary: 'Crisp slate frame, pale blue hover',
    className: `${baseButtonClass} auth-house-b1`,
  },
  {
    id: 'b2',
    mode: 'signin',
    label: '2. Deep Cyan',
    summary: 'Dense cyan hover with bright text',
    className: `${baseButtonClass} auth-house-b2`,
  },
  {
    id: 'b3',
    mode: 'signin',
    label: '3. Thesis Block',
    summary: 'Hard 2px boundary, authority-heavy',
    className: `${baseButtonClass} auth-house-b3`,
  },
  {
    id: 'b4',
    mode: 'signin',
    label: '4. Soft Wash',
    summary: 'Very light hover wash, formal tone',
    className: `${baseButtonClass} auth-house-b4`,
  },
  {
    id: 'b5',
    mode: 'signin',
    label: '5. Studio Accent',
    summary: 'Accent trim with richer hover color',
    className: `${baseButtonClass} auth-house-b5`,
  },
  {
    id: 'b6',
    mode: 'signin',
    label: '6. Graphite',
    summary: 'Dark neutral hover, high confidence',
    className: `${baseButtonClass} auth-house-b6`,
  },
  {
    id: 'b7',
    mode: 'signin',
    label: '7. Halo Edge',
    summary: 'Ring halo hover with clean fill',
    className: `${baseButtonClass} auth-house-b7`,
  },
  {
    id: 'b8',
    mode: 'signin',
    label: '8. Dashed Ledger',
    summary: 'Technical dashed frame, blue hover',
    className: `${baseButtonClass} auth-house-b8`,
  },
  {
    id: 'b9',
    mode: 'signin',
    label: '9. Capsule Strong',
    summary: 'Full capsule with dense accent hover',
    className: `${baseButtonClass} auth-house-b9`,
  },
  {
    id: 'b10',
    mode: 'signin',
    label: '10. Utility Rail',
    summary: 'Squared utility style, uppercase text',
    className: `${baseButtonClass} auth-house-b10`,
  },
  {
    id: 'b11',
    mode: 'register',
    label: '11. Blackline',
    summary: 'Strong black border and dark hover',
    className: `${baseButtonClass} auth-house-b11`,
  },
  {
    id: 'b12',
    mode: 'register',
    label: '12. Border Signal',
    summary: 'No fill switch, border focus only',
    className: `${baseButtonClass} auth-house-b12`,
  },
  {
    id: 'b13',
    mode: 'register',
    label: '13. Glass Blue',
    summary: 'Inset line + glass-like hover',
    className: `${baseButtonClass} auth-house-b13`,
  },
  {
    id: 'b14',
    mode: 'register',
    label: '14. House Canon',
    summary: 'Closest to house system defaults',
    className: `${baseButtonClass} auth-house-b14`,
  },
  {
    id: 'b15',
    mode: 'register',
    label: '15. Quiet Accent',
    summary: 'Subtle frame, readable accent hover',
    className: `${baseButtonClass} auth-house-b15`,
  },
  {
    id: 'b16',
    mode: 'register',
    label: '16. Monograph',
    summary: 'Monochrome hover with muted emphasis',
    className: `${baseButtonClass} auth-house-b16`,
  },
  {
    id: 'b17',
    mode: 'register',
    label: '17. Signal Dense',
    summary: 'Dense accent hover for strongest CTA',
    className: `${baseButtonClass} auth-house-b17`,
  },
  {
    id: 'b18',
    mode: 'register',
    label: '18. Conservative',
    summary: 'Neutral-only hover, very restrained',
    className: `${baseButtonClass} auth-house-b18`,
  },
  {
    id: 'b19',
    mode: 'register',
    label: '19. Ring Governed',
    summary: 'Governance-like ring and fill behavior',
    className: `${baseButtonClass} auth-house-b19`,
  },
  {
    id: 'b20',
    mode: 'register',
    label: '20. New Axiomos',
    summary: 'Dense hover, light text, strong border',
    className: `${baseButtonClass} auth-house-b20`,
  },
];

const ctaSets: CtaOption[] = [
  {
    id: 'c1',
    label: 'CTA 1. Axiomos Core',
    summary: 'Dense accent fill with crisp contrast',
    className: 'auth-cta-btn auth-cta-c1',
  },
  {
    id: 'c2',
    label: 'CTA 2. Black Authority',
    summary: 'Near-black fill, strongest hierarchy',
    className: 'auth-cta-btn auth-cta-c2',
  },
  {
    id: 'c3',
    label: 'CTA 3. Accent Rail',
    summary: 'White base + thick accent border',
    className: 'auth-cta-btn auth-cta-c3',
  },
  {
    id: 'c4',
    label: 'CTA 4. Ink + Halo',
    summary: 'Dark fill with subtle ring presence',
    className: 'auth-cta-btn auth-cta-c4',
  },
  {
    id: 'c5',
    label: 'CTA 5. Research Solid',
    summary: 'Solid neutral with understated hover',
    className: 'auth-cta-btn auth-cta-c5',
  },
  {
    id: 'c6',
    label: 'CTA 6. Accent Capsule',
    summary: 'Rounded capsule for standout action',
    className: 'auth-cta-btn auth-cta-c6',
  },
  {
    id: 'c7',
    label: 'CTA 7. Split Contrast',
    summary: 'White default, dark inversion on hover',
    className: 'auth-cta-btn auth-cta-c7',
  },
  {
    id: 'c8',
    label: 'CTA 8. Signature',
    summary: 'Bolder accent + stronger elevation',
    className: 'auth-cta-btn auth-cta-c8',
  },
];

function variantCards(mode: AuthMode) {
  return optionSets
    .filter((option) => mode === 'both' || option.mode === mode)
    .map((option) => (
      <article key={option.id} className="border border-neutral-200 rounded-md p-4 bg-white">
        <div className="text-xs font-semibold text-neutral-900">{option.label}</div>
        <div className="text-xs text-neutral-600 mt-1">{option.summary}</div>
        <div className="mt-4">
          <button
            type="button"
            className={option.className}
            style={{
              height: 'var(--button-auth-height, 2.5rem)',
              minHeight: 'var(--button-auth-height, 2.5rem)',
              paddingInline: 'var(--space-4, 1rem)',
            }}
          >
            {option.mode === 'signin' ? 'Sign in' : 'Register'}
          </button>
        </div>
      </article>
    ));
}

export function AuthButtonVariantLab() {
  const [mode, setMode] = useState<AuthMode>('both');
  const buttons = variantCards(mode);

  return (
    <div className="min-h-screen bg-white p-8">
      <style>{`
        .auth-house-btn {
          border: 1px solid hsl(var(--stroke-strong) / 0.9);
          background-color: hsl(var(--tone-neutral-50));
          color: hsl(var(--tone-neutral-900));
          box-shadow: none;
          transition-property: background-color, color, border-color, box-shadow, transform;
          transition-duration: var(--motion-duration-ui);
          transition-timing-function: ease-out;
        }
        .auth-house-btn:hover {
          transform: translateZ(0);
        }
        .auth-house-b1 { border-color: hsl(var(--tone-neutral-900)); border-radius: 0.5rem; }
        .auth-house-b1:hover { background-color: hsl(var(--tone-neutral-100)); color: hsl(var(--tone-neutral-900)); }
        .auth-house-b2 { border-color: hsl(var(--tone-neutral-900)); border-radius: 0.35rem; }
        .auth-house-b2:hover { background-color: hsl(var(--tone-neutral-100)); color: hsl(var(--tone-neutral-900)); box-shadow: var(--elevation-1); }
        .auth-house-b3 { border-color: hsl(var(--tone-neutral-900)); border-width: 2px; border-radius: 0.4rem; }
        .auth-house-b3:hover { background-color: hsl(var(--tone-neutral-100)); color: hsl(var(--tone-neutral-900)); }
        .auth-house-b4 { border-color: hsl(var(--tone-neutral-800)); border-radius: 0.5rem; font-weight: 600; }
        .auth-house-b4:hover { background-color: hsl(var(--tone-neutral-200)); color: hsl(var(--tone-neutral-900)); }
        .auth-house-b5 { border-color: hsl(var(--tone-neutral-900)); border-style: solid; border-radius: 0.5rem; letter-spacing: 0.01em; }
        .auth-house-b5:hover { background-color: hsl(var(--tone-accent-50)); color: hsl(var(--tone-neutral-900)); }
        .auth-house-b6 { border-color: hsl(var(--tone-neutral-900)); border-radius: 0.5rem; }
        .auth-house-b6:hover { background-color: hsl(var(--tone-accent-100)); color: hsl(var(--tone-neutral-900)); border-color: hsl(var(--tone-neutral-900)); }
        .auth-house-b7 { border-color: hsl(var(--tone-neutral-900)); border-style: dashed; border-radius: 0.5rem; }
        .auth-house-b7:hover { background-color: hsl(var(--tone-neutral-100)); color: hsl(var(--tone-neutral-900)); border-style: solid; }
        .auth-house-b8 { border-color: hsl(var(--tone-neutral-900)); border-radius: 9999px; }
        .auth-house-b8:hover { background-color: hsl(var(--tone-neutral-100)); color: hsl(var(--tone-neutral-900)); }
        .auth-house-b9 { border-color: hsl(var(--tone-neutral-900)); border-radius: 0.25rem; text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.75rem; }
        .auth-house-b9:hover { background-color: hsl(var(--tone-neutral-100)); color: hsl(var(--tone-neutral-900)); }
        .auth-house-b10 { border-color: hsl(var(--tone-neutral-900)); border-radius: 0.5rem; box-shadow: inset 0 0 0 1px hsl(var(--tone-neutral-100)); }
        .auth-house-b10:hover { background-color: hsl(var(--tone-neutral-100)); color: hsl(var(--tone-neutral-900)); box-shadow: inset 0 0 0 1px hsl(var(--tone-neutral-200)); }
        .auth-house-b11 { border-color: hsl(var(--tone-neutral-900)); border-width: 2px; border-radius: 0.5rem; font-weight: 700; }
        .auth-house-b11:hover { background-color: hsl(var(--tone-neutral-200)); color: hsl(var(--tone-neutral-900)); }
        .auth-house-b12 { border-color: hsl(var(--tone-neutral-900)); border-radius: 0.5rem; }
        .auth-house-b12:hover { background-color: hsl(var(--tone-neutral-50)); color: hsl(var(--tone-neutral-900)); box-shadow: 0 0 0 2px hsl(var(--tone-neutral-300)); }
        .auth-house-b13 { border-color: hsl(var(--tone-neutral-900)); border-radius: 0.9rem; }
        .auth-house-b13:hover { background-color: hsl(var(--tone-neutral-100)); color: hsl(var(--tone-neutral-900)); }
        .auth-house-b14 { border-color: hsl(var(--tone-neutral-900)); border-radius: 0.5rem; font-weight: 600; letter-spacing: 0.02em; }
        .auth-house-b14:hover { background-color: hsl(var(--tone-accent-50)); color: hsl(var(--tone-neutral-900)); }
        .auth-house-b15 { border-color: hsl(var(--tone-neutral-900)); border-radius: 0.5rem; font-size: 0.9rem; }
        .auth-house-b15:hover { background-color: hsl(var(--tone-neutral-100)); color: hsl(var(--tone-neutral-900)); box-shadow: var(--elevation-1); }
        .auth-house-b16 { border-color: hsl(var(--tone-neutral-900)); border-radius: 0.5rem; font-size: 0.82rem; }
        .auth-house-b16:hover { background-color: hsl(var(--tone-neutral-200)); color: hsl(var(--tone-neutral-900)); }
        .auth-house-b17 { border-color: hsl(var(--tone-neutral-900)); border-radius: 0.5rem; letter-spacing: 0.03em; text-transform: uppercase; font-size: 0.76rem; }
        .auth-house-b17:hover { background-color: hsl(var(--tone-neutral-100)); color: hsl(var(--tone-neutral-900)); box-shadow: 0 0 0 1px hsl(var(--tone-neutral-900)); }
        .auth-house-b18 { border-color: hsl(var(--tone-neutral-900)); border-width: 3px; border-radius: 0.5rem; }
        .auth-house-b18:hover { background-color: hsl(var(--tone-neutral-100)); color: hsl(var(--tone-neutral-900)); border-width: 3px; }
        .auth-house-b19 { border-color: hsl(var(--tone-neutral-900)); border-radius: 0.5rem; box-shadow: 0 1px 0 hsl(var(--tone-neutral-300)); }
        .auth-house-b19:hover { background-color: hsl(var(--tone-accent-100)); color: hsl(var(--tone-neutral-900)); box-shadow: 0 0 0 2px hsl(var(--tone-neutral-300)); }
        .auth-house-b20 { border-color: hsl(var(--tone-neutral-900)); border-radius: 0.5rem; font-weight: 700; letter-spacing: 0.01em; }
        .auth-house-b20:hover { background-color: hsl(var(--tone-neutral-900)); color: hsl(var(--tone-neutral-50)); border-color: hsl(var(--tone-neutral-900)); }

        .auth-cta-btn {
          display: inline-flex;
          min-width: 10.5rem;
          justify-content: center;
          align-items: center;
          border-radius: 0.4rem;
          border: 1px solid hsl(var(--tone-neutral-900));
          padding-inline: var(--space-4, 1rem);
          height: var(--button-auth-height, 2.5rem);
          min-height: var(--button-auth-height, 2.5rem);
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          transition-property: background-color, color, border-color, box-shadow;
          transition-duration: var(--motion-duration-ui);
          transition-timing-function: ease-out;
        }

        .auth-cta-c1 {
          background: hsl(var(--tone-accent-600));
          color: hsl(var(--tone-neutral-50));
          border-color: hsl(var(--tone-accent-700));
          box-shadow: var(--elevation-1);
        }
        .auth-cta-c1:hover { background: hsl(var(--tone-accent-700)); border-color: hsl(var(--tone-accent-800)); box-shadow: var(--elevation-2); }

        .auth-cta-c2 {
          background: hsl(var(--tone-neutral-900));
          color: hsl(var(--tone-neutral-50));
          border-color: hsl(var(--tone-neutral-900));
          box-shadow: var(--elevation-1);
        }
        .auth-cta-c2:hover { background: hsl(var(--tone-neutral-800)); box-shadow: var(--elevation-2); }

        .auth-cta-c3 {
          background: hsl(var(--tone-neutral-50));
          color: hsl(var(--tone-accent-900));
          border: 2px solid hsl(var(--tone-accent-700));
        }
        .auth-cta-c3:hover { background: hsl(var(--tone-accent-100)); color: hsl(var(--tone-accent-900)); }

        .auth-cta-c4 {
          background: hsl(var(--tone-neutral-900));
          color: hsl(var(--tone-accent-100));
          border-color: hsl(var(--tone-accent-700));
          box-shadow: 0 0 0 1px hsl(var(--tone-accent-700) / 0.28), var(--elevation-1);
        }
        .auth-cta-c4:hover { background: hsl(var(--tone-neutral-800)); box-shadow: 0 0 0 2px hsl(var(--tone-accent-700) / 0.35), var(--elevation-2); }

        .auth-cta-c5 {
          background: hsl(var(--tone-neutral-800));
          color: hsl(var(--tone-neutral-50));
          border-color: hsl(var(--tone-neutral-900));
        }
        .auth-cta-c5:hover { background: hsl(var(--tone-neutral-700)); box-shadow: var(--elevation-1); }

        .auth-cta-c6 {
          background: hsl(var(--tone-accent-600));
          color: hsl(var(--tone-neutral-50));
          border-color: hsl(var(--tone-accent-800));
          border-radius: 9999px;
        }
        .auth-cta-c6:hover { background: hsl(var(--tone-accent-700)); box-shadow: var(--elevation-2); }

        .auth-cta-c7 {
          background: hsl(var(--tone-neutral-50));
          color: hsl(var(--tone-neutral-900));
          border-color: hsl(var(--tone-neutral-900));
        }
        .auth-cta-c7:hover { background: hsl(var(--tone-neutral-900)); color: hsl(var(--tone-neutral-50)); }

        .auth-cta-c8 {
          background: hsl(var(--tone-accent-700));
          color: hsl(var(--tone-neutral-50));
          border-color: hsl(var(--tone-accent-900));
          box-shadow: var(--elevation-2);
        }
        .auth-cta-c8:hover { background: hsl(var(--tone-accent-800)); box-shadow: 0 0 0 2px hsl(var(--tone-accent-700) / 0.3), var(--elevation-2); }
      `}</style>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">Auth Button Variant Lab</h1>
        <p className="text-neutral-600 mb-6">
          Twenty bordered, white-default button options with hover states.
        </p>

        <div className="mb-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setMode('signin')}
            className={`px-4 py-2 text-sm rounded-md border ${
              mode === 'signin'
                ? 'bg-neutral-900 text-white border-neutral-900'
                : 'bg-white text-neutral-700 border-neutral-300'
            }`}
          >
            Sign in only
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`px-4 py-2 text-sm rounded-md border ${
              mode === 'register'
                ? 'bg-neutral-900 text-white border-neutral-900'
                : 'bg-white text-neutral-700 border-neutral-300'
            }`}
          >
            Register only
          </button>
          <button
            type="button"
            onClick={() => setMode('both')}
            className={`px-4 py-2 text-sm rounded-md border ${
              mode === 'both'
                ? 'bg-neutral-900 text-white border-neutral-900'
                : 'bg-white text-neutral-700 border-neutral-300'
            }`}
          >
            Both
          </button>
        </div>

        <div className={`grid gap-4 ${mode === 'both' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2'} xl:${mode === 'both' ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {buttons}
        </div>

        <div className="mt-10">
          <h2 className="text-xl font-semibold text-neutral-900 mb-2">Official Sign In CTA (Bolder)</h2>
          <p className="text-sm text-neutral-600 mb-4">
            High-emphasis candidates for the primary Sign in action.
          </p>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
            {ctaSets.map((option) => (
              <article key={option.id} className="border border-neutral-200 rounded-md p-4 bg-white">
                <div className="text-xs font-semibold text-neutral-900">{option.label}</div>
                <div className="text-xs text-neutral-600 mt-1">{option.summary}</div>
                <div className="mt-4">
                  <button type="button" className={option.className}>
                    Sign in
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-8 p-4 border-t border-neutral-200 text-sm text-neutral-700">
          <p className="font-semibold text-neutral-900 mb-2">Recommendation</p>
          <p>
            Yes—use border on the primary Sign in button for stronger affordance on research-grade interfaces.
            For animation, keep it restrained: one token-driven hover lift/shadow motion is usually best.
          </p>
        </div>
      </div>
    </div>
  );
}

export const Default: StoryObj = {
  render: () => <AuthButtonVariantLab />,
};


