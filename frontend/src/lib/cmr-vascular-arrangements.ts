export type CmrVascularArrangementOption = {
  key: string
  label: string
  reportText: string
  detail: string
  group: 'Normal' | 'Aortic Arch' | 'Systemic Venous'
}

export const CMR_VASCULAR_ARRANGEMENT_OPTIONS: CmrVascularArrangementOption[] = [
  {
    key: 'normal',
    label: 'Normal',
    reportText: 'The vascular arrangement is normal.',
    detail: 'Default left-sided arch arrangement without a flagged systemic venous anomaly.',
    group: 'Normal',
  },
  {
    key: 'left-arch-common-origin-bca-lcca',
    label: 'Left arch with common brachiocephalic/LCCA origin',
    reportText: 'There is a left aortic arch with common origin of the brachiocephalic and left common carotid arteries.',
    detail: 'Common branching variant often described as a bovine-type arch.',
    group: 'Aortic Arch',
  },
  {
    key: 'left-arch-left-vertebral-origin',
    label: 'Left arch with direct left vertebral origin',
    reportText: 'There is a left aortic arch with direct origin of the left vertebral artery from the arch.',
    detail: 'Branching variant with separate left vertebral artery origin from the arch.',
    group: 'Aortic Arch',
  },
  {
    key: 'left-arch-arsa',
    label: 'Left arch with aberrant right subclavian artery',
    reportText: 'There is a left aortic arch with aberrant right subclavian artery.',
    detail: 'Common congenital arch anomaly; may be associated with a retro-oesophageal course.',
    group: 'Aortic Arch',
  },
  {
    key: 'right-arch-mirror-branching',
    label: 'Right arch with mirror-image branching',
    reportText: 'There is a right aortic arch with mirror-image branching.',
    detail: 'Right-sided arch with mirror-image great vessel branching.',
    group: 'Aortic Arch',
  },
  {
    key: 'right-arch-aberrant-left-subclavian',
    label: 'Right arch with aberrant left subclavian artery',
    reportText: 'There is a right aortic arch with aberrant left subclavian artery.',
    detail: 'Right arch variant that may be associated with Kommerell diverticulum.',
    group: 'Aortic Arch',
  },
  {
    key: 'double-aortic-arch',
    label: 'Double aortic arch',
    reportText: 'There is a double aortic arch forming a vascular ring.',
    detail: 'Vascular ring arrangement with persistence of both arches.',
    group: 'Aortic Arch',
  },
  {
    key: 'persistent-left-svc',
    label: 'Persistent left SVC to coronary sinus',
    reportText: 'There is a persistent left superior vena cava draining to the coronary sinus.',
    detail: 'Most common thoracic systemic venous anomaly.',
    group: 'Systemic Venous',
  },
  {
    key: 'persistent-left-svc-absent-right-svc',
    label: 'Persistent left SVC with absent right SVC',
    reportText: 'There is a persistent left superior vena cava with absent right superior vena cava.',
    detail: 'Systemic venous variant with isolated left-sided SVC drainage.',
    group: 'Systemic Venous',
  },
  {
    key: 'interrupted-ivc-azygos',
    label: 'Interrupted IVC with azygos continuation',
    reportText: 'There is interrupted inferior vena cava with azygos continuation.',
    detail: 'Systemic venous arrangement often encountered in congenital heart disease imaging.',
    group: 'Systemic Venous',
  },
  {
    key: 'left-sided-ivc',
    label: 'Left-sided IVC',
    reportText: 'There is a left-sided inferior vena cava.',
    detail: 'Systemic venous variant with left-sided caval course.',
    group: 'Systemic Venous',
  },
]

export function getCmrVascularArrangementOption(key: string | null | undefined): CmrVascularArrangementOption {
  return CMR_VASCULAR_ARRANGEMENT_OPTIONS.find((option) => option.key === key)
    ?? CMR_VASCULAR_ARRANGEMENT_OPTIONS[0]
}
