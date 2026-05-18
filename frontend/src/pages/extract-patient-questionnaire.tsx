import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ClipboardList, Save } from 'lucide-react'

import { fetchQuestionnaire, saveQuestionnaire } from '@/lib/extract-api'
import { cn } from '@/lib/utils'
import { usePatientContext } from './extract-patient-detail-page'

type QuestionnaireValue = string | string[]
type QuestionnaireData = Record<string, QuestionnaireValue>
type SelectedTone = 'positive' | 'neutral' | 'warning' | 'danger' | 'severe'

const HEALTH_OPTIONS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent']
const HEALTH_CHANGE_OPTIONS = ['Much worse', 'Slightly worse', 'Same', 'Slightly better', 'Much better']
const PROBLEM_OPTIONS = ['No problems', 'Slight problems', 'Moderate problems', 'Severe problem', 'Unable to']
const SYMPTOM_OPTIONS = ['None', 'Slight', 'Moderate', 'Severe', 'Extreme']
const FREQUENCY_OPTIONS = ['Not at all', 'Rarely', 'Sometimes', 'Often', 'Always']
const BREATHLESSNESS_FREQUENCY_OPTIONS = ['Never', 'Rarely', 'Sometimes', 'Often', 'Always']
const MRC_OPTIONS = [
  'Not troubled by breathlessness except on strenuous exercise',
  'Short of breath when hurrying or walking up a slight hill',
  'Walks slower than people of the same age or stops after around 15 minutes',
  'Stops for breath after a few minutes on level ground',
  'Too breathless to leave the house or breathless when dressing',
]
const SMOKING_OPTIONS = [
  'I have never smoked',
  'I used to smoke, but I have quit',
  'I am a current smoker',
]
const ALCOHOL_OPTIONS = [
  'I do not drink alcohol',
  'I drink alcohol occasionally (less than weekly)',
  'I drink alcohol regularly (weekly or more)',
]
const ACTIVITY_OPTIONS = ['Yes, most days', 'Occasionally', 'Rarely', 'Not at all']
const ACTIVITY_AVOIDANCE_OPTIONS = ['Breathlessness', 'Fatigue', 'Muscle or joint pain', 'Fear or anxiety', 'Other']

const DAILY_FUNCTION_ROWS = [
  ['mobility', 'Mobility'],
  ['self_care', 'Self-care'],
  ['usual_activities', 'Usual activities'],
] as const

const SYMPTOM_ROWS = [
  ['pain_discomfort', 'Pain or discomfort'],
  ['anxiety', 'Anxiety'],
  ['depression', 'Depression'],
] as const

const BREATHLESSNESS_ROWS = [
  ['breathless_light_activity', 'Light activity'],
  ['breathless_moderate_activity', 'Moderate activity'],
  ['breathless_rest', 'Rest'],
] as const

const CONDITION_GROUPS = [
  {
    title: 'Cardiovascular conditions',
    items: [
      'Pulmonary hypertension',
      'Valvular heart disease',
      'Heart failure',
      'Cardiomyopathy',
      'Hypertension',
      'Arrhythmia (e.g. atrial fibrillation)',
      'Coronary artery disease (e.g. previous heart attack, angina, stents, coronary artery bypass surgery)',
      'Congenital heart disease',
    ],
  },
  {
    title: 'Respiratory conditions',
    items: [
      'Asthma',
      'COPD',
      'Interstitial lung disease',
      'Pulmonary embolism',
      'Obstructive sleep apnoea',
    ],
  },
  {
    title: 'Neurological or psychiatric conditions',
    items: ['Stroke or TIA', 'Anxiety or depression', "Parkinson's disease"],
  },
  {
    title: 'Other',
    items: [
      'Type I diabetes mellitus',
      'Type II diabetes mellitus',
      'Chronic kidney disease',
      'Chronic liver disease',
      'Thyroid disease',
      'Cancer',
    ],
  },
]

const PROCEDURE_ITEMS = [
  'Cardiac surgery',
  'Use of CPAP for sleep apnoea',
  'Lung surgery',
  'Chemotherapy or radiotherapy',
  'Long-term oxygen therapy',
]

const PILL_TONE_CLASSES: Record<SelectedTone, string> = {
  positive: 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)] shadow-sm',
  neutral: 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-600))] ring-[hsl(var(--tone-neutral-250,215_16%_86%))] shadow-sm',
  warning: 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)] shadow-sm',
  danger: 'bg-[hsl(4_55%_92%)] text-[hsl(4_50%_40%)] ring-[hsl(4_45%_80%)] shadow-sm',
  severe: 'bg-[hsl(356_42%_24%)] text-white ring-[hsl(356_42%_24%)] shadow-sm',
}

const CELL_TONE_CLASSES: Record<SelectedTone, string> = {
  positive: 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)]',
  neutral: 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-600))]',
  warning: 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)]',
  danger: 'bg-[hsl(4_55%_92%)] text-[hsl(4_50%_40%)]',
  severe: 'bg-[hsl(356_42%_24%)] text-white',
}

function toneFromScale(option: string, options: readonly string[], tones: readonly SelectedTone[]): SelectedTone | null {
  const index = options.indexOf(option)
  return index >= 0 ? tones[index] ?? null : null
}

function selectedTone(option: string, options: readonly string[]): SelectedTone {
  if (options === HEALTH_OPTIONS) {
    return toneFromScale(option, HEALTH_OPTIONS, ['danger', 'warning', 'positive', 'positive', 'positive']) ?? 'positive'
  }
  if (options === HEALTH_CHANGE_OPTIONS) {
    return toneFromScale(option, HEALTH_CHANGE_OPTIONS, ['danger', 'warning', 'neutral', 'positive', 'positive']) ?? 'positive'
  }
  if (options === PROBLEM_OPTIONS) {
    return toneFromScale(option, PROBLEM_OPTIONS, ['positive', 'warning', 'warning', 'danger', 'severe']) ?? 'positive'
  }
  if (options === SYMPTOM_OPTIONS) {
    return toneFromScale(option, SYMPTOM_OPTIONS, ['positive', 'warning', 'warning', 'danger', 'severe']) ?? 'positive'
  }
  if (options === FREQUENCY_OPTIONS) {
    return toneFromScale(option, FREQUENCY_OPTIONS, ['positive', 'neutral', 'warning', 'danger', 'severe']) ?? 'positive'
  }
  if (options === BREATHLESSNESS_FREQUENCY_OPTIONS) {
    return toneFromScale(option, BREATHLESSNESS_FREQUENCY_OPTIONS, ['positive', 'neutral', 'warning', 'danger', 'severe']) ?? 'positive'
  }
  if (options === MRC_OPTIONS) {
    return toneFromScale(option, MRC_OPTIONS, ['positive', 'warning', 'warning', 'danger', 'severe']) ?? 'positive'
  }
  if (options === SMOKING_OPTIONS) {
    return toneFromScale(option, SMOKING_OPTIONS, ['positive', 'warning', 'danger']) ?? 'positive'
  }
  if (options === ALCOHOL_OPTIONS) {
    return toneFromScale(option, ALCOHOL_OPTIONS, ['positive', 'neutral', 'warning']) ?? 'positive'
  }
  if (options === ACTIVITY_OPTIONS) {
    return toneFromScale(option, ACTIVITY_OPTIONS, ['positive', 'warning', 'danger', 'severe']) ?? 'positive'
  }
  if (options === ACTIVITY_AVOIDANCE_OPTIONS) {
    return toneFromScale(option, ACTIVITY_AVOIDANCE_OPTIONS, ['warning', 'warning', 'warning', 'warning', 'neutral']) ?? 'positive'
  }
  return 'positive'
}

function fieldString(data: QuestionnaireData, key: string): string {
  const value = data[key]
  return typeof value === 'string' ? value : ''
}

function fieldArray(data: QuestionnaireData, key: string): string[] {
  const value = data[key]
  return Array.isArray(value) ? value : []
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))]">
      <div className="border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-5 py-3">
        <h3 className="text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">{title}</h3>
        {subtitle && <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{subtitle}</p>}
      </div>
      <div className="space-y-5 px-5 py-4">{children}</div>
    </section>
  )
}

function RadioPills({
  value,
  options,
  onChange,
}: {
  value: string
  options: readonly string[]
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = value === option
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(active ? '' : option)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition-all',
              active
                ? PILL_TONE_CLASSES[selectedTone(option, options)]
                : 'bg-white text-[hsl(var(--tone-neutral-600))] ring-[hsl(var(--tone-neutral-250,215_16%_86%))] hover:bg-[hsl(var(--tone-neutral-50))]',
            )}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

function QuestionBlock({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</p>
      {children}
    </div>
  )
}

function MatrixQuestion({
  rows,
  options,
  data,
  setField,
}: {
  rows: readonly (readonly [string, string])[]
  options: readonly string[]
  data: QuestionnaireData
  setField: (key: string, value: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[hsl(var(--stroke-soft)/0.72)]">
      <div className="grid border-b border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))]" style={{ gridTemplateColumns: `190px repeat(${options.length}, minmax(92px, 1fr))` }}>
        <div className="px-3 py-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]" />
        {options.map((option) => (
          <div key={option} className="flex items-center justify-center px-2 py-2 text-center text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">
            {option}
          </div>
        ))}
      </div>
      {rows.map(([key, label]) => (
        <div key={key} className="grid border-b border-[hsl(var(--stroke-soft)/0.4)] last:border-b-0" style={{ gridTemplateColumns: `190px repeat(${options.length}, minmax(92px, 1fr))` }}>
          <div className="flex items-center px-3 py-2 text-sm font-medium text-[hsl(var(--foreground))]">{label}</div>
          {options.map((option) => {
            const active = fieldString(data, key) === option
            return (
              <button
                key={option}
                type="button"
                onClick={() => setField(key, active ? '' : option)}
                className={cn(
                  'flex min-h-10 items-center justify-center border-l border-[hsl(var(--stroke-soft)/0.35)] text-xs font-semibold transition-colors',
                  active
                    ? CELL_TONE_CLASSES[selectedTone(option, options)]
                    : 'bg-white text-[hsl(var(--tone-neutral-500))] hover:bg-[hsl(var(--tone-neutral-50))]',
                )}
              >
                {active ? 'Selected' : ''}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function CheckboxGrid({
  values,
  items,
  onToggle,
}: {
  values: string[]
  items: readonly string[]
  onToggle: (item: string) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => {
        const checked = values.includes(item)
        return (
          <button
            key={item}
            type="button"
            onClick={() => onToggle(item)}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors',
              checked
                ? 'border-[hsl(163_22%_80%)] bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)]'
                : 'border-[hsl(var(--stroke-soft)/0.72)] bg-white text-[hsl(var(--foreground))] hover:bg-[hsl(var(--tone-neutral-50))]',
            )}
          >
            <span className={cn(
              'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]',
              checked ? 'border-[hsl(164_30%_28%)] bg-[hsl(164_30%_28%)] text-white' : 'border-[hsl(var(--tone-neutral-300))]',
            )}>
              {checked ? 'x' : ''}
            </span>
            {item}
          </button>
        )
      })}
    </div>
  )
}

export default function ExtractPatientQuestionnaire() {
  const { patient } = usePatientContext()
  const hn = patient?.hn ?? ''
  const [data, setData] = useState<QuestionnaireData>({})
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const initialLoadDone = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!hn) return
    setLoading(true)
    initialLoadDone.current = false
    void fetchQuestionnaire(hn)
      .then((resp) => {
        const payload = resp as { data?: QuestionnaireData }
        setData(payload.data ?? {})
      })
      .catch(() => setData({}))
      .finally(() => {
        setLoading(false)
        setTimeout(() => { initialLoadDone.current = true }, 100)
      })
  }, [hn])

  useEffect(() => {
    if (!initialLoadDone.current || !hn) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        await saveQuestionnaire(hn, data as Record<string, unknown>)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 1500)
      } catch {
        setSaveStatus('error')
      }
    }, 700)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [data, hn])

  const setField = useCallback((key: string, value: QuestionnaireValue) => {
    setData((prev) => ({ ...prev, [key]: value }))
  }, [])

  const toggleArrayItem = useCallback((key: string, item: string) => {
    setData((prev) => {
      const values = fieldArray(prev, key)
      const next = values.includes(item)
        ? values.filter((value) => value !== item)
        : [...values, item]
      return { ...prev, [key]: next }
    })
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-56 animate-pulse rounded bg-[hsl(var(--tone-neutral-200))]" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 w-full animate-pulse rounded-lg bg-[hsl(var(--tone-neutral-200))]" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[hsl(var(--tone-accent-600))]" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">
              Study Entry Questionnaire
            </h2>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-opacity',
            saveStatus === 'saving' && 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-600))]',
            saveStatus === 'saved' && 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)]',
            saveStatus === 'error' && 'bg-[hsl(4_55%_92%)] text-[hsl(4_50%_40%)]',
            saveStatus === 'idle' && 'opacity-0',
          )}>
            <Save className="h-3.5 w-3.5" />
            {saveStatus === 'saving' ? 'Saving' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Save failed' : 'Saved'}
          </span>
        </div>
      </div>

      <Section title="Section A - General Health">
        <QuestionBlock label="In general, would you say your health is:">
          <RadioPills value={fieldString(data, 'general_health')} options={HEALTH_OPTIONS} onChange={(value) => setField('general_health', value)} />
        </QuestionBlock>
        <QuestionBlock label="Compared to one year ago, how would you rate your health now?">
          <RadioPills value={fieldString(data, 'health_compared_one_year')} options={HEALTH_CHANGE_OPTIONS} onChange={(value) => setField('health_compared_one_year', value)} />
        </QuestionBlock>
      </Section>

      <Section title="Section B - Daily Functioning and Symptoms" subtitle="Please select one option in each row that best describes your health today.">
        <MatrixQuestion rows={DAILY_FUNCTION_ROWS} options={PROBLEM_OPTIONS} data={data} setField={(key, value) => setField(key, value)} />
        <MatrixQuestion rows={SYMPTOM_ROWS} options={SYMPTOM_OPTIONS} data={data} setField={(key, value) => setField(key, value)} />
      </Section>

      <Section title="Section C - Fatigue and Breathlessness">
        <QuestionBlock label="In the past 7 days, how often have you felt fatigued?">
          <RadioPills value={fieldString(data, 'fatigue_frequency')} options={FREQUENCY_OPTIONS} onChange={(value) => setField('fatigue_frequency', value)} />
        </QuestionBlock>
        <QuestionBlock label="In the past 7 days, how often have you felt short of breath during:">
          <MatrixQuestion rows={BREATHLESSNESS_ROWS} options={BREATHLESSNESS_FREQUENCY_OPTIONS} data={data} setField={(key, value) => setField(key, value)} />
        </QuestionBlock>
        <QuestionBlock label="How would you rate the severity of your breathlessness?">
          <RadioPills value={fieldString(data, 'breathlessness_severity')} options={MRC_OPTIONS} onChange={(value) => setField('breathlessness_severity', value)} />
        </QuestionBlock>
      </Section>

      <Section title="Section D - Overall Health Score">
        <QuestionBlock label="On a scale of 0 to 100, where 100 is the best health you can imagine and 0 is the worst, how would you rate your health today?">
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={100}
              value={Number(fieldString(data, 'overall_health_score') || 0)}
              onChange={(e) => setField('overall_health_score', e.target.value)}
              className="w-full accent-[hsl(var(--tone-accent-600))]"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={fieldString(data, 'overall_health_score')}
              onChange={(e) => setField('overall_health_score', e.target.value)}
              className="house-input w-24 rounded-lg px-3 py-2 text-center text-sm"
              placeholder="0-100"
            />
          </div>
        </QuestionBlock>
      </Section>

      <Section title="Section E - Medical Conditions and History" subtitle="Select all that apply.">
        {CONDITION_GROUPS.map((group) => (
          <div key={group.title} className="grid gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">{group.title}</p>
            <CheckboxGrid values={fieldArray(data, 'conditions')} items={group.items} onToggle={(item) => toggleArrayItem('conditions', item)} />
          </div>
        ))}
        <div className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">Procedures or treatments</p>
          <CheckboxGrid values={fieldArray(data, 'procedures')} items={PROCEDURE_ITEMS} onToggle={(item) => toggleArrayItem('procedures', item)} />
        </div>
      </Section>

      <Section title="Section F - Lifestyle Factors">
        <QuestionBlock label="What is your smoking status?">
          <RadioPills value={fieldString(data, 'smoking_status')} options={SMOKING_OPTIONS} onChange={(value) => setField('smoking_status', value)} />
        </QuestionBlock>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="house-field-label">Approximate cigarettes per day</span>
            <input type="number" value={fieldString(data, 'cigarettes_per_day')} onChange={(e) => setField('cigarettes_per_day', e.target.value)} className="house-input rounded-lg px-3 py-2 text-sm" placeholder="-" />
          </label>
          <label className="grid gap-1.5">
            <span className="house-field-label">Approximate years smoked</span>
            <input type="number" value={fieldString(data, 'smoking_years')} onChange={(e) => setField('smoking_years', e.target.value)} className="house-input rounded-lg px-3 py-2 text-sm" placeholder="-" />
          </label>
        </div>
        <QuestionBlock label="What is your alcohol consumption status?">
          <RadioPills value={fieldString(data, 'alcohol_status')} options={ALCOHOL_OPTIONS} onChange={(value) => setField('alcohol_status', value)} />
        </QuestionBlock>
        <QuestionBlock label="Do you currently engage in regular physical activity?">
          <RadioPills value={fieldString(data, 'physical_activity')} options={ACTIVITY_OPTIONS} onChange={(value) => setField('physical_activity', value)} />
        </QuestionBlock>
        <QuestionBlock label="If you avoid physical activity, what is the main reason?">
          <RadioPills value={fieldString(data, 'activity_avoidance_reason')} options={ACTIVITY_AVOIDANCE_OPTIONS} onChange={(value) => setField('activity_avoidance_reason', value)} />
        </QuestionBlock>
        <label className="grid gap-1.5">
          <span className="house-field-label">Other reason</span>
          <input type="text" value={fieldString(data, 'activity_avoidance_other')} onChange={(e) => setField('activity_avoidance_other', e.target.value)} className="house-input rounded-lg px-3 py-2 text-sm" placeholder="-" />
        </label>
      </Section>
    </div>
  )
}
