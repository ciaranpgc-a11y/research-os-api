# Axiomos Design Governance Specification v1.0

## Purpose

This document defines the non-negotiable structural rules governing all visual, spatial, typographic, and interactive elements within Axiomos.

Axiomos is an operating system. The interface must reflect discipline, consistency, and restraint.

No element may be introduced or modified outside the constraints defined here.

## 1. Foundational Design Doctrine

### 1.1 Structural Integrity

The interface must communicate:

- Stability
- Analytical precision
- Hierarchical clarity
- Restraint
- Systems thinking

It must not communicate:

- Ornamentation
- Playfulness
- Visual noise
- Over-explanation
- Color-driven emphasis

## 2. Design Tokens Are Law

### 2.1 Color

- All color usage must derive exclusively from token definitions.
- No hard-coded color values are permitted outside token files.
- No additional accent colors may be introduced without updating this governance document.
- Accent usage must be limited to:
- Primary interactive states
- Highlighted data states
- Selected navigation states
- Accent may not dominate layout.

### 2.2 Spacing

- All spatial relationships must derive from the base spacing scale.
- No arbitrary pixel values may be used.
- The system must preserve vertical rhythm.
- Spacing communicates structure.

### 2.3 Typography

Hierarchy must be expressed through:

- Scale
- Weight
- Spacing

Not through color or decoration.

Typography must:

- Preserve legibility at data-dense scales
- Support analytical reading
- Avoid stylistic flourish

No font substitution outside the approved family.

## 3. Surface Philosophy

### 3.1 Flatness

- The interface must be predominantly flat.
- Elevation is to be used sparingly and subtly.
- Shadow must never replace structural clarity.

### 3.2 Borders

Structure must be defined through:

- Border
- Surface contrast
- Spatial grouping

Not heavy shadow.

### 3.3 Radius

- Corner radius must be consistent system-wide.
- No component-specific stylistic radii allowed.

## 4. Hierarchy Rules

### 4.1 Information Density

- Information must be grouped logically.
- Each surface must have:
- A primary focal element
- A secondary contextual layer
- A tertiary metadata layer
- No surface may contain more than three competing focal hierarchies.

### 4.2 Numeric Emphasis

- Numeric values must dominate visually over labels.
- Labels support metrics.
- Metrics do not support labels.

### 4.3 Microcopy Discipline

All explanatory text must:

- Be structured
- Avoid ambiguity
- Avoid emotional phrasing
- Avoid marketing tone

Language must be analytical.

## 5. Data Visualization Governance

### 5.1 Color Discipline

- Color in charts must represent logic, not aesthetics.
- Multiple strong colors may not appear in a single data visualization without structural justification.
- Muted tones are default.

### 5.2 Visual Weight

Charts must avoid:

- Heavy gradients
- Decorative fill patterns
- Excessive grid lines
- Excessive markers

Data must remain primary.

## 6. Interaction Rules

### 6.1 Motion

Motion must be:

- Subtle
- Short duration
- Functional

No theatrical animation permitted.

### 6.2 Hover and Tooltip Governance

Hover states must:

- Clarify
- Not distract

Tooltips must:

- Be structured
- Use defined typography scale
- Avoid verbosity
- Avoid decorative styling

## 7. Table Governance

Tables are core infrastructure.

They must:

- Preserve alignment discipline
- Maintain consistent row height
- Respect numeric alignment
- Avoid decorative alternation

Tables are not decorative surfaces.

## 8. State Indicators

State indicators must:

- Be subdued
- Avoid saturated backgrounds
- Avoid dominance over primary metrics

State communicates status, not emphasis.

## 9. Dark Mode Parity

Dark mode must:

- Preserve hierarchy
- Maintain contrast ratios
- Not invert logic
- Not introduce new accents

Dark is an alternate environment, not a new aesthetic.

## 10. Governance Enforcement

All new UI elements must:

- Use design tokens
- Use spacing scale
- Use approved typography
- Conform to hierarchy rules

Any deviation requires:

- Justification
- Update to governance document
- Token revision

No visual experimentation in production UI without system update.

## 11. Drift Prevention

Codex must enforce:

- No inline hex values
- No arbitrary spacing
- No rogue typography sizes
- No unapproved color usage

PRs violating governance must fail.

## 12. Design Intent Summary

Axiomos must feel:

- Engineered
- Deliberate
- Quietly powerful
- Structurally coherent

If a design choice adds decoration but not structure, it is incorrect.
