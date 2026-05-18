export const CMR_REPORT_TAG_OPTIONS = [
  'Angiography of major arteries',
  'Detection of MI and assessment of viability',
  'Assessment of LV and RV function',
  'AV / MV / TV / PV pathology',
  'Aortic pathology',
  'Congenital heart disease',
  'Assessment of causation of HF',
  'Pericardial abnormality',
  'Cardiac mass / tumour',
  'Stress testing',
  'Assessment of cardiomyopathy',
] as const

const REPORT_TAG_TONE_CLASSES: Record<string, string> = {
  'Angiography of major arteries': 'border-[#d9c1af] bg-[#f6ede5] text-[#6d4d3d]',
  'Detection of MI and assessment of viability': 'border-[#ead8ad] bg-[#f8f1dc] text-[#725d1b]',
  'Assessment of LV and RV function': 'border-[#e8c1cf] bg-[#f8e9ef] text-[#8c3e56]',
  'AV / MV / TV / PV pathology': 'border-[#e6c4b0] bg-[#f7ebe4] text-[#855336]',
  'Aortic pathology': 'border-[#bfd6dc] bg-[#edf5f7] text-[#375f68]',
  'Congenital heart disease': 'border-[#b8cff4] bg-[#edf3ff] text-[#2f5d9b]',
  'Assessment of causation of HF': 'border-[#d8c8ef] bg-[#f2ecfb] text-[#6d4f9c]',
  'Pericardial abnormality': 'border-[#e6c3bf] bg-[#f8ece9] text-[#8a4f48]',
  'Cardiac mass / tumour': 'border-[#d5c4e8] bg-[#f3ebfb] text-[#6c4f92]',
  'Stress testing': 'border-[#c7ddd2] bg-[#edf6f1] text-[#3f6a57]',
  'Assessment of cardiomyopathy': 'border-[#d8c7b9] bg-[#f4eee9] text-[#6c5742]',
}

export function getCmrReportTagToneClass(tag: string | null | undefined): string {
  if (!tag) return 'border-border bg-white text-[hsl(var(--muted-foreground))]'
  return REPORT_TAG_TONE_CLASSES[tag] ?? 'border-border bg-white text-[hsl(var(--foreground))]'
}
