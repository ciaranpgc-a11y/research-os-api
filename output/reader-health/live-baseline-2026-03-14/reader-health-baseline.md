# Reader Health Baseline

- Publications audited: 15
- Parser states: `{"FULL_TEXT_READY": 7, "PARSING": 3, "STRUCTURE_ONLY": 5}`
- Highest severities: `{"critical": 3, "high": 7, "medium": 5}`
- Average section anchor coverage: `0.0`
- Average figure surface coverage: `0.0`
- Average table surface coverage: `0.8611`

## Top Findings

- `PARSE_NOT_READY`: 8
- `DUPLICATE_REFERENCE_PRESENTATION_RISK`: 7
- `FIGURE_SURFACE_COVERAGE_LOW`: 7
- `MISSING_ASSET_PAGE_ANCHORS`: 7
- `MISSING_READER_PROVENANCE`: 7
- `MISSING_SECTION_PAGE_ANCHORS`: 7
- `BACK_MATTER_MAPPED_TO_BODY`: 6
- `CROSS_ZONE_SECTION_PARENT`: 6
- `HIGH_GENERIC_SECTION_RATE`: 6
- `BODY_SECTION_CLASSIFIED_AS_METADATA`: 4
- `LOW_FIDELITY_TABLE_HTML`: 3
- `TABLE_SURFACE_COVERAGE_LOW`: 2

## Per Publication

### A scoping review of artificial intelligence in medical education: BEME Guide No. 84

- Publication ID: `38516c97-c17e-423d-8bfd-0eaac8cbae7e`
- Highest severity: `medium`
- Finding count: `1`
- Findings:
  - `medium` `PARSE_NOT_READY`: Reader payload is not in FULL_TEXT_READY state, so quality metrics reflect a seed or in-flight parse rather than a completed structured reader.

### Online learning developments in undergraduate medical education in response to the COVID-19 pandemic: A BEME systematic review: BEME Guide No. 69

- Publication ID: `54ff4952-69e9-49d8-8c29-b6286a1d04df`
- Highest severity: `critical`
- Finding count: `1`
- Findings:
  - `critical` `PARSE_NOT_READY`: Reader payload is not in FULL_TEXT_READY state, so quality metrics reflect a seed or in-flight parse rather than a completed structured reader.

### Diagnosis and referral delays in primary care for oral squamous cell cancer: a systematic review

- Publication ID: `235a19a8-73cb-4370-9672-02b7bc8be2d5`
- Highest severity: `high`
- Finding count: `8`
- Findings:
  - `high` `MISSING_SECTION_PAGE_ANCHORS`: Full-text sections have no page anchors, which weakens ordering confidence, left-nav parity, and inline asset placement.
  - `medium` `MISSING_ASSET_PAGE_ANCHORS`: Parsed assets have no page anchors, so section placement and PDF jumps rely on weaker heuristics.
  - `high` `DUPLICATE_REFERENCE_PRESENTATION_RISK`: The payload contains both parsed reference sections and a normalized reference list, which creates a strong risk of double-rendering in the structured reader.
  - `high` `CROSS_ZONE_SECTION_PARENT`: One or more sections are parented across document zones, which creates duplication and grouping conflicts between body and end matter.
  - `high` `BACK_MATTER_MAPPED_TO_BODY`: Back-matter sections are mapped into main narrative groups, which is a strong indicator of reader ordering and duplication defects.
  - `medium` `HIGH_GENERIC_SECTION_RATE`: A large share of sections remain generic `section` kinds, which reduces confidence in ordering, grouping, and section-specific rendering.
  - `high` `FIGURE_SURFACE_COVERAGE_LOW`: Figure extraction coverage is low, so the reader is mostly showing figure metadata instead of actual figure images.
  - `medium` `MISSING_READER_PROVENANCE`: Reader provenance is incomplete, so the UI has to infer parse/enrichment state instead of reporting it explicitly.

### Systematic review and meta-analysis of acute type B thoracic aortic dissection, open, or endovascular repair

- Publication ID: `e4d0a15b-21d5-461f-8849-071f15e94044`
- Highest severity: `medium`
- Finding count: `1`
- Findings:
  - `medium` `PARSE_NOT_READY`: Reader payload is not in FULL_TEXT_READY state, so quality metrics reflect a seed or in-flight parse rather than a completed structured reader.

### Pivot to online learning for adapting or continuing workplace-based clinical learning in medical education following the COVID-19 pandemic: A BEME systematic review: BEME Guide No. 70

- Publication ID: `cd1c4132-a51c-409d-a147-37fc20138eb7`
- Highest severity: `medium`
- Finding count: `1`
- Findings:
  - `medium` `PARSE_NOT_READY`: Reader payload is not in FULL_TEXT_READY state, so quality metrics reflect a seed or in-flight parse rather than a completed structured reader.

### Non-technical skills assessments in undergraduate medical education: A focused BEME systematic review: BEME Guide No. 54

- Publication ID: `2defd006-855e-4a93-875d-39f7aa3aa624`
- Highest severity: `medium`
- Finding count: `1`
- Findings:
  - `medium` `PARSE_NOT_READY`: Reader payload is not in FULL_TEXT_READY state, so quality metrics reflect a seed or in-flight parse rather than a completed structured reader.

### Exploring UK medical school differences: the MedDifs study of selection, teaching, student and F1 perceptions, postgraduate outcomes and fitness to practise

- Publication ID: `03c31417-cb16-4d6a-a906-d5b99dc78f94`
- Highest severity: `high`
- Finding count: `11`
- Findings:
  - `high` `MISSING_SECTION_PAGE_ANCHORS`: Full-text sections have no page anchors, which weakens ordering confidence, left-nav parity, and inline asset placement.
  - `medium` `MISSING_ASSET_PAGE_ANCHORS`: Parsed assets have no page anchors, so section placement and PDF jumps rely on weaker heuristics.
  - `high` `DUPLICATE_REFERENCE_PRESENTATION_RISK`: The payload contains both parsed reference sections and a normalized reference list, which creates a strong risk of double-rendering in the structured reader.
  - `high` `CROSS_ZONE_SECTION_PARENT`: One or more sections are parented across document zones, which creates duplication and grouping conflicts between body and end matter.
  - `high` `BACK_MATTER_MAPPED_TO_BODY`: Back-matter sections are mapped into main narrative groups, which is a strong indicator of reader ordering and duplication defects.
  - `high` `BODY_SECTION_CLASSIFIED_AS_METADATA`: Body sections are classified as metadata/article information, which will distort display order and move narrative content into Declarations-like groups.
  - `medium` `HIGH_GENERIC_SECTION_RATE`: A large share of sections remain generic `section` kinds, which reduces confidence in ordering, grouping, and section-specific rendering.
  - `high` `FIGURE_SURFACE_COVERAGE_LOW`: Figure extraction coverage is low, so the reader is mostly showing figure metadata instead of actual figure images.
  - ... 3 more

### The Analysis of Teaching of Medical Schools (AToMS) survey: an analysis of 47,258 timetabled teaching events in 25 UK medical schools relating to timing, duration, teaching formats, teaching content, and problem-based learning

- Publication ID: `297f1e00-ebc1-4bc4-9fbe-d01cd6ab74dc`
- Highest severity: `high`
- Finding count: `8`
- Findings:
  - `high` `MISSING_SECTION_PAGE_ANCHORS`: Full-text sections have no page anchors, which weakens ordering confidence, left-nav parity, and inline asset placement.
  - `medium` `MISSING_ASSET_PAGE_ANCHORS`: Parsed assets have no page anchors, so section placement and PDF jumps rely on weaker heuristics.
  - `high` `DUPLICATE_REFERENCE_PRESENTATION_RISK`: The payload contains both parsed reference sections and a normalized reference list, which creates a strong risk of double-rendering in the structured reader.
  - `high` `CROSS_ZONE_SECTION_PARENT`: One or more sections are parented across document zones, which creates duplication and grouping conflicts between body and end matter.
  - `high` `BACK_MATTER_MAPPED_TO_BODY`: Back-matter sections are mapped into main narrative groups, which is a strong indicator of reader ordering and duplication defects.
  - `medium` `HIGH_GENERIC_SECTION_RATE`: A large share of sections remain generic `section` kinds, which reduces confidence in ordering, grouping, and section-specific rendering.
  - `high` `FIGURE_SURFACE_COVERAGE_LOW`: Figure extraction coverage is low, so the reader is mostly showing figure metadata instead of actual figure images.
  - `medium` `MISSING_READER_PROVENANCE`: Reader provenance is incomplete, so the UI has to infer parse/enrichment state instead of reporting it explicitly.

### Gastrointestinal manifestations of COVID-19 in children: a systematic review and meta-analysis

- Publication ID: `74754eb1-ab24-4c1e-86bc-f5d239b21f42`
- Highest severity: `critical`
- Finding count: `1`
- Findings:
  - `critical` `PARSE_NOT_READY`: Reader payload is not in FULL_TEXT_READY state, so quality metrics reflect a seed or in-flight parse rather than a completed structured reader.

### Epidural analgesia versus paravertebral block in video-assisted thoracoscopic surgery

- Publication ID: `20ffb471-526d-4852-afeb-1f4f2f9a3996`
- Highest severity: `medium`
- Finding count: `1`
- Findings:
  - `medium` `PARSE_NOT_READY`: Reader payload is not in FULL_TEXT_READY state, so quality metrics reflect a seed or in-flight parse rather than a completed structured reader.

### Standard breath-hold versus free-breathing real-time cine cardiac MRI—a prospective randomized comparison in patients with known or suspected cardiac disease

- Publication ID: `330defb3-b816-4073-821b-51e67c4a6d73`
- Highest severity: `high`
- Finding count: `10`
- Findings:
  - `high` `MISSING_SECTION_PAGE_ANCHORS`: Full-text sections have no page anchors, which weakens ordering confidence, left-nav parity, and inline asset placement.
  - `medium` `MISSING_ASSET_PAGE_ANCHORS`: Parsed assets have no page anchors, so section placement and PDF jumps rely on weaker heuristics.
  - `high` `DUPLICATE_REFERENCE_PRESENTATION_RISK`: The payload contains both parsed reference sections and a normalized reference list, which creates a strong risk of double-rendering in the structured reader.
  - `high` `CROSS_ZONE_SECTION_PARENT`: One or more sections are parented across document zones, which creates duplication and grouping conflicts between body and end matter.
  - `high` `BACK_MATTER_MAPPED_TO_BODY`: Back-matter sections are mapped into main narrative groups, which is a strong indicator of reader ordering and duplication defects.
  - `high` `BODY_SECTION_CLASSIFIED_AS_METADATA`: Body sections are classified as metadata/article information, which will distort display order and move narrative content into Declarations-like groups.
  - `medium` `HIGH_GENERIC_SECTION_RATE`: A large share of sections remain generic `section` kinds, which reduces confidence in ordering, grouping, and section-specific rendering.
  - `high` `FIGURE_SURFACE_COVERAGE_LOW`: Figure extraction coverage is low, so the reader is mostly showing figure metadata instead of actual figure images.
  - ... 2 more

### Sex-specific cardiac magnetic resonance pulmonary capillary wedge pressure

- Publication ID: `9b5e1434-112f-4c33-9d24-ccc65f5fa70c`
- Highest severity: `high`
- Finding count: `6`
- Findings:
  - `high` `MISSING_SECTION_PAGE_ANCHORS`: Full-text sections have no page anchors, which weakens ordering confidence, left-nav parity, and inline asset placement.
  - `medium` `MISSING_ASSET_PAGE_ANCHORS`: Parsed assets have no page anchors, so section placement and PDF jumps rely on weaker heuristics.
  - `high` `DUPLICATE_REFERENCE_PRESENTATION_RISK`: The payload contains both parsed reference sections and a normalized reference list, which creates a strong risk of double-rendering in the structured reader.
  - `medium` `HIGH_GENERIC_SECTION_RATE`: A large share of sections remain generic `section` kinds, which reduces confidence in ordering, grouping, and section-specific rendering.
  - `high` `FIGURE_SURFACE_COVERAGE_LOW`: Figure extraction coverage is low, so the reader is mostly showing figure metadata instead of actual figure images.
  - `medium` `MISSING_READER_PROVENANCE`: Reader provenance is incomplete, so the UI has to infer parse/enrichment state instead of reporting it explicitly.

### Cardiac Magnetic Resonance Left Ventricular Filling Pressure is Linked to Symptoms, Signs and Prognosis in Heart Failure

- Publication ID: `600aa572-f4c4-4890-8134-66cff6947957`
- Highest severity: `critical`
- Finding count: `1`
- Findings:
  - `critical` `PARSE_NOT_READY`: Reader payload is not in FULL_TEXT_READY state, so quality metrics reflect a seed or in-flight parse rather than a completed structured reader.

### An acute increase in Left Atrial volume and left ventricular filling pressure during Adenosine administered myocardial hyperaemia: CMR First-Pass Perfusion Study

- Publication ID: `9297ba37-fd13-41a4-a6df-b549947621cd`
- Highest severity: `high`
- Finding count: `9`
- Findings:
  - `high` `MISSING_SECTION_PAGE_ANCHORS`: Full-text sections have no page anchors, which weakens ordering confidence, left-nav parity, and inline asset placement.
  - `medium` `MISSING_ASSET_PAGE_ANCHORS`: Parsed assets have no page anchors, so section placement and PDF jumps rely on weaker heuristics.
  - `high` `DUPLICATE_REFERENCE_PRESENTATION_RISK`: The payload contains both parsed reference sections and a normalized reference list, which creates a strong risk of double-rendering in the structured reader.
  - `high` `CROSS_ZONE_SECTION_PARENT`: One or more sections are parented across document zones, which creates duplication and grouping conflicts between body and end matter.
  - `high` `BACK_MATTER_MAPPED_TO_BODY`: Back-matter sections are mapped into main narrative groups, which is a strong indicator of reader ordering and duplication defects.
  - `high` `BODY_SECTION_CLASSIFIED_AS_METADATA`: Body sections are classified as metadata/article information, which will distort display order and move narrative content into Declarations-like groups.
  - `medium` `HIGH_GENERIC_SECTION_RATE`: A large share of sections remain generic `section` kinds, which reduces confidence in ordering, grouping, and section-specific rendering.
  - `high` `FIGURE_SURFACE_COVERAGE_LOW`: Figure extraction coverage is low, so the reader is mostly showing figure metadata instead of actual figure images.
  - ... 1 more

### Kat-ARC accelerated 4D flow CMR: clinical validation for transvalvular flow and peak velocity assessment

- Publication ID: `8620828d-78c7-4bdb-b752-81c810dd2705`
- Highest severity: `high`
- Finding count: `10`
- Findings:
  - `high` `MISSING_SECTION_PAGE_ANCHORS`: Full-text sections have no page anchors, which weakens ordering confidence, left-nav parity, and inline asset placement.
  - `medium` `MISSING_ASSET_PAGE_ANCHORS`: Parsed assets have no page anchors, so section placement and PDF jumps rely on weaker heuristics.
  - `high` `DUPLICATE_REFERENCE_PRESENTATION_RISK`: The payload contains both parsed reference sections and a normalized reference list, which creates a strong risk of double-rendering in the structured reader.
  - `high` `CROSS_ZONE_SECTION_PARENT`: One or more sections are parented across document zones, which creates duplication and grouping conflicts between body and end matter.
  - `high` `BACK_MATTER_MAPPED_TO_BODY`: Back-matter sections are mapped into main narrative groups, which is a strong indicator of reader ordering and duplication defects.
  - `high` `BODY_SECTION_CLASSIFIED_AS_METADATA`: Body sections are classified as metadata/article information, which will distort display order and move narrative content into Declarations-like groups.
  - `high` `FIGURE_SURFACE_COVERAGE_LOW`: Figure extraction coverage is low, so the reader is mostly showing figure metadata instead of actual figure images.
  - `medium` `TABLE_SURFACE_COVERAGE_LOW`: Table HTML coverage is low, so readers will frequently fall back to metadata-only table cards.
  - ... 2 more
