# Publication Insight Writing and UI Guidelines

This document captures the working rules for publication `?` explainers and live insight cards in the publications drilldown.

Use it when adding or revising:

- section-level `?` explainers
- live section insights
- publication drilldown headers and helper copy

## 1. Two explainer patterns

There are two approved `?` styles:

- `Deep ?`
  - Use when the section combines several metrics or needs a fuller synthetic read.
  - Example: `How steady is my publication output?`
- `Compact ?`
  - Use when the section is answering one focused interpretive question.
  - Example: `What stage is my publication output in?`

Do not mix the two patterns accidentally. Choose one deliberately based on depth.

## 2. Title and hierarchy rules

- The tooltip title should usually be phrased as a direct user question.
- The hero card should use the interpretation itself as the heading when possible.
  - Good: `Plateauing`
  - Good: `Volume built into stronger later years, but the latest window is now very light.`
  - Avoid repeating the section label inside the hero when the title already provides context.
- Supporting evidence should explain the headline, not restate the section label.

## 3. Content rules

- Lead with the interpretive point, then justify it.
- Explain what is driving the read for this record, not just what the metric is called.
- Prefer adaptive copy over fixed templates.
- For live AI insights, write for a highly capable academic reader who wants interpretation, not reassurance.
- For live AI insights, lead with the structural story rather than the metric label.
- For live AI insights, use the fewest concrete numbers that materially change the interpretation.
- For live AI insights, thin recent windows should be treated as confidence qualifiers rather than main claims.
- Avoid generic observations that are true for almost everyone.
  - Example: do not over-emphasize quiet opening years in publication volume unless they are genuinely important to the interpretation.
- Prefer high-value comparisons.
  - Good: rolling 5-year and 3-year annual averages versus the latest 12 months
  - Good: peak years versus non-peak years
  - Good: recent cadence versus earlier run
- Avoid debug-style narration.
  - Too much exact date detail usually reduces value.
  - Month/year is usually enough in scope notes.
- Avoid repeating the same statistic in slightly different forms across multiple lines.
- If a term like `IQR` is used, do not also spell out the same idea in a redundant sentence unless it adds interpretation.

## 4. Wording rules

- Write for capable academic readers.
- Be concise, but do not strip away the evidence needed to justify the interpretation.
- Avoid product-style filler.
  - Avoid phrases like `current label`, `complete-year read`, `based on your current publication metrics`.
- Prefer plain statistical language.
  - `+1 paper per year` is better than `about +1.0 papers/year`.
- Prefer `recorded publications`, `recent publications`, or `papers` over awkward phrasing like `dated papers`.
- Variation is encouraged, but it must remain deterministic for the same data shape.
  - Do not introduce random wording.
  - If variants are used, choose them from a stable seed derived from the data.

## 5. Scope-note rules

- Scope notes should be brief and quiet.
- Use month/year rather than full dates unless exact dates materially affect interpretation.
  - Good: `Using rolling data to the end of February 2026.`
  - Good: `Based on complete years to end of 2025.`
- The scope note should not compete with the main evidence.

## 6. Tone and colour rules

- Keep the outer surface mostly neutral.
- Put semantic colour in the hero, marker dots, and controls.
- Help-button tone should match the tooltip's interpretive tone when the section has a clear semantic state.
- Use semantic tones consistently:
  - `positive`: strengthening / healthy continuation
  - `accent`: active but not cautionary
  - `warning`: softening / plateauing / caution
  - `danger`: clear contraction or materially weaker state
  - `neutral`: mixed or low-signal state
- Do not add strong gradients unless they are clearly improving hierarchy. Solid or lightly tinted surfaces are usually better.

## 7. Visual rules

- The tooltip should have one clear focal area.
- Use stronger visual weight for the hero interpretation than for supporting evidence.
- Supporting rows or bullets should feel structured, not like nested mini-cards unless the section truly needs the deeper pattern.
- For `Compact ?`, neutral evidence panels plus subtle markers usually work better than assigning a different colour to every sub-point.
- For `Deep ?`, equal-weight tiles are acceptable when each tile corresponds to a distinct metric.
- Live insight cards and static insight cards should use the same canonical shell:
  - neutral outer surface
  - thin semantic rail at the top
  - badge-style header
  - one hero interpretation block
  - one optional consideration block
  - neutral action rows underneath
- Avoid separate visual systems for static and live insights unless a section has a deliberate reason to diverge.

## 8. Specific section rules

### Production stage

- Use the phase label as the hero heading.
- Keep supporting evidence as concise factual statements rather than pseudo-subheadings.
- Classify on complete years; if partial-year context is shown, present it separately and clearly.

### Publication output steadiness

- Use the section-level `?` only; avoid per-tile `?` buttons if the section-level explainer already synthesizes the four metrics.
- Each evidence tile should integrate the interpretation and metric rather than separating them mechanically.

### Publication volume over time

- Explain the headline using rolling-window comparisons and cadence, not just static highs and lows.
- Prefer rolling averages and recent cadence language over generic early-career framing.
- The second evidence line should add nuance, not duplicate the rolling-window line.
- In live insights, treat the rolling `5-year` and `3-year` views as the main recent evidence and use the latest `12` months mainly to refine cadence or confidence.

### Article type and publication type over time

- Treat these as mix questions, not just rank-order questions.
- Use the full record to establish the anchor mix, then use the `5-year` and `3-year` windows as the main recent evidence.
- Do not let a very thin `1-year` window carry the main interpretation.
  - If the latest `1-year` window is light, demote it to a short qualifier or omit it entirely from the main evidence stack.
- Mention meaningful secondary types when they materially shape the read.
  - A useful default threshold is at least `2` publications or about `10-12%` share in the relevant recent window.
- Distinguish these mix modes explicitly in the logic:
  - `stable`
  - `narrowing`
  - `broadening`
  - `contested`
  - `gradual shift`
  - `true reorder`
- Prefer wording that explains whether the recent mix is:
  - still led by the same type, but tighter
  - still led by the same type, but now more contested
  - gradually leaning toward a different type
  - clearly reordered across both the `5-year` and `3-year` windows

### Live insight prompts

- Do not narrate the interface or repeat obvious section labels, charts, toggles, or tables.
- Use wider portfolio context only when it materially sharpens the interpretation.
- Good follow-on note labels are specific:
  - `Signal strength`
  - `Live year`
  - `Coverage`
  - `Recent signal`
  - `Peak structure`
  - `Read this`
- Avoid generic follow-on labels when a sharper one is available.

### Year-over-year trajectory

- Treat this as a `Compact ?`.
- The section-level explainer should synthesize from the current slider window, not from the full career by default.
- If the publication history is long enough, default the trajectory slider to a more useful recent span rather than the full record.
  - A good default is the latest `5` visible years when history is longer.
  - If history is short, use the full visible span.
- The hero should carry the phase read for the current slider span, such as `Contracting over 2022 - 2026`.
- The primary evidence headings should integrate the interpretation, not just name the metric.
  - Prefer `Volatility is moderate` over `Volatility index`.
  - Prefer `Slope is falling` over `Growth slope`.
- Supporting evidence should sit as compact bullets, not equal-weight tiles, unless the section genuinely needs a `Deep ?`.
- Use exact year spans and explicit counts where possible.
  - Prefer `2025 - 2026 averaged 3 publications per year versus 15 in 2022 - 2024` over generic phrases like `the later years sit below the earlier run`.
  - Prefer `Across 2022 - 2026` over `in this visible range` or `in this window`.
- Treat `Raw`, `Moving average`, `Cumulative`, and the slider as supporting chart-reading aids rather than primary analytical headlines.
- The tooltip should stay section-level rather than following the active toggle.
- Put chart mechanics in a short footer note rather than as a separate evidence card.
- Make it explicit that the slider changes which years feed the metrics and all three chart views.
- The hero should summarize the actual shape of the record, not just describe chart mechanics.
- Volatility evidence should explain where the swings actually sit, not just restate the index.
- Slope evidence should explain the earlier-versus-later comparison numerically when the span is long enough to support it.
- If the latest year is still partial, mention that briefly only where it changes how the moving average should be read.

## 9. Test expectations

When updating these explainers:

- Add or update a focused test for the shaped data pattern being described.
- Assert the interpretive message, not every incidental word.
- If deterministic wording variants are introduced, keep tests aligned to the seeded variant for the fixture data.

## 10. Default standard

When in doubt, optimize for:

- clarity
- evidence that earns the interpretation
- minimal repetition
- restrained, semantic visual hierarchy
- language that respects the reader's intelligence
