const HOUSE_ROLE_ATTR = 'data-house-role'
const HOUSE_UI_ATTR = 'data-ui'
const HOUSE_AUTO_ATTR = 'data-house-auto'
const AUTO_ROLE_PREFIX = 'auto:'

let hasLoggedDevSummary = false

function normalizeTag(tagName: string): string {
  return String(tagName || '').trim().toLowerCase()
}

function inferAutoRole(element: Element): string {
  const explicitUi = element.getAttribute(HOUSE_UI_ATTR)
  if (explicitUi) {
    return `${AUTO_ROLE_PREFIX}ui-${explicitUi}`
  }
  const ariaRole = element.getAttribute('role')
  if (ariaRole) {
    return `${AUTO_ROLE_PREFIX}${ariaRole}`
  }

  const tag = normalizeTag(element.tagName)
  if (/^h[1-6]$/.test(tag)) {
    return `${AUTO_ROLE_PREFIX}heading-${tag}`
  }
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return `${AUTO_ROLE_PREFIX}field-${tag}`
  }
  if (tag === 'button') {
    return `${AUTO_ROLE_PREFIX}button`
  }
  if (tag === 'a') {
    return `${AUTO_ROLE_PREFIX}link`
  }
  if (tag === 'table' || tag === 'thead' || tag === 'tbody' || tag === 'tr' || tag === 'th' || tag === 'td') {
    return `${AUTO_ROLE_PREFIX}table-${tag}`
  }
  return `${AUTO_ROLE_PREFIX}${tag || 'node'}`
}

export function applyHouseRoleTags(root: ParentNode): number {
  const taggedElements = new Set<Element>()
  const directRoot = root instanceof Element ? [root] : []
  const descendants = Array.from(root.querySelectorAll('*'))

  for (const element of [...directRoot, ...descendants]) {
    if (taggedElements.has(element)) {
      continue
    }
    taggedElements.add(element)

    if (element.hasAttribute(HOUSE_ROLE_ATTR)) {
      continue
    }

    const roleValue = inferAutoRole(element)
    element.setAttribute(HOUSE_ROLE_ATTR, roleValue)
    element.setAttribute(HOUSE_AUTO_ATTR, 'true')
  }

  return taggedElements.size
}

export function installHouseElementTagging(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined
  }

  let disposed = false
  let scheduled = false

  const runTagging = () => {
    scheduled = false
    if (disposed || !document.body) {
      return
    }
    const inspectedCount = applyHouseRoleTags(document.body)
    if (import.meta.env.DEV && !hasLoggedDevSummary) {
      hasLoggedDevSummary = true
      console.info(`[house-style] Auto-tagging active. Tagged scan size: ${inspectedCount} elements.`)
    }
  }

  const scheduleTagging = () => {
    if (disposed || scheduled) {
      return
    }
    scheduled = true
    window.requestAnimationFrame(runTagging)
  }

  scheduleTagging()
  const observer = new MutationObserver(() => {
    scheduleTagging()
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: false,
  })

  return () => {
    disposed = true
    observer.disconnect()
  }
}
