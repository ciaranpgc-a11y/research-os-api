function extractClassNameValue(attributeNode) {
  if (!attributeNode || attributeNode.type !== 'JSXAttribute') {
    return null
  }
  if (!attributeNode.value) {
    return null
  }

  // className="..."
  if (attributeNode.value.type === 'Literal' && typeof attributeNode.value.value === 'string') {
    return attributeNode.value.value
  }

  // className={"..."} or className={`...`}
  if (attributeNode.value.type === 'JSXExpressionContainer') {
    const expression = attributeNode.value.expression
    if (!expression) {
      return null
    }
    if (expression.type === 'Literal' && typeof expression.value === 'string') {
      return expression.value
    }
    if (expression.type === 'TemplateLiteral' && expression.expressions.length === 0) {
      return expression.quasis.map((part) => part.value.cooked || '').join('')
    }
  }

  return null
}

const noHardcodedMotionRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow hardcoded motion durations; use design tokens instead',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name?.name !== 'className') {
          return
        }
        const value = extractClassNameValue(node)
        if (!value) {
          return
        }
        if (/\bduration-\d{2,4}\b/.test(value) && !/\bduration-\[var\(--motion[^)]*\)\]\b/.test(value)) {
          context.report({
            node,
            message:
              'Use design token for motion duration: duration-[var(--motion-ui)], duration-[var(--motion-slow)], etc. See GOVERNANCE_RULES.md',
          })
        }
      },
    }
  },
}

const noTransitionAllRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow transition-all; specify properties instead for performance',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name?.name !== 'className') {
          return
        }
        const value = extractClassNameValue(node)
        if (!value) {
          return
        }
        if (/\btransition-all\b/.test(value)) {
          context.report({
            node,
            message:
              "Don't use transition-all. Specify properties: transition-[background-color,color] or use a ButtonPrimitive-like component. See GOVERNANCE_RULES.md",
          })
        }
      },
    }
  },
}

const designSystemPlugin = {
  rules: {
    'no-hardcoded-motion': noHardcodedMotionRule,
    'no-transition-all': noTransitionAllRule,
  },
}

export default designSystemPlugin
