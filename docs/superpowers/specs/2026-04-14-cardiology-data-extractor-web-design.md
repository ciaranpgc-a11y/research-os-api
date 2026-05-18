# Cardiology Data Extractor Web Application

**Date**: 2026-04-14
**Status**: Draft
**Parent project**: research-os-api (Axiomos)

---

## 1. Overview

Migrate the existing Cardiology Data Extractor CLI application (`C:\Users\Ciaran\AppData\Local\Cardiology Data Extractor`) to a web application bolted onto Axiomos, following the same compartmentalized pattern used for the CMR analysis tool. The extractor uses GPT-4o with domain-specific prompts to extract structured cardiac measurements from clinical documents (RHC, Echo, CMR reports) and stores them in a research database with PH recruitment tracking.

### What already works and must not change

- **Extraction prompts**: 5 prompt files (`cmr_extraction.txt`, `echo_extraction.txt`, `report_extraction.txt`, `email_extraction.txt`, `generic_extraction.txt`) used as-is
- **Extraction logic**: GPT-4o with vision API for screenshots, text input for documents
- **Database schema**: Existing SQLite tables (patients, rhc, echocardiogram, cmr, cpex, study_recruitment) define the data model
- **Field catalogue**: 151 CMR fields, 55 Echo fields, ~30 RHC fields, 30+ recruitment fields (detailed in Appendix A)

### What this project adds

- Web UI following cmr-app design language
- PostgreSQL tables in Axiomos DB mirroring the existing SQLite schema
- FastAPI routes mounted at `/v1/extract/*`
- React frontend at `extract.localhost:5173` (dev) / `extract.axiomos.studio` (prod)
- Migration of existing research.db data into PostgreSQL

---

## 2. Architecture

### Deployment model

Same compartmentalized pattern as the CMR analysis tool within `research-os-api`:

- **Separate auth**: Own access codes and sessions (`extract_access_codes`, `extract_sessions`)
- **Separate routes**: `/v1/extract/*` prefix, mounted in `app.py`
- **Separate frontend pages**: `extract-*-page.tsx` with subdomain detection
- **Shared infrastructure**: Same FastAPI server, same PostgreSQL database, same Vite frontend build

### Backend modules

New service modules under `src/research_os/`:

```
src/research_os/
  extract_auth/
    router.py          # /v1/extract/auth/* endpoints
    service.py         # Access code + session management
    models.py          # SQLAlchemy: ExtractAccessCode, ExtractSession
  extract_patients/
    router.py          # /v1/extract/patients/* CRUD
    service.py         # Patient lookup, create, update, search
    models.py          # SQLAlchemy: ExtractPatient
  extract_records/
    router.py          # /v1/extract/records/* CRUD for RHC, Echo, CMR, CPEX
    service.py         # Record CRUD, bulk export
    models.py          # SQLAlchemy: ExtractRhc, ExtractEchocardiogram, ExtractCmr, ExtractCpex
  extract_recruitment/
    router.py          # /v1/extract/recruitment/* CRUD
    service.py         # Recruitment tracking, status updates
    models.py          # SQLAlchemy: ExtractStudyRecruitment
  extract_extraction/
    router.py          # /v1/extract/extraction/* endpoints
    service.py         # GPT-4o extraction orchestration
    prompts/           # Copied from existing prompts/ directory
      cmr_extraction.txt
      echo_extraction.txt
      report_extraction.txt
      email_extraction.txt
      generic_extraction.txt
```

### Frontend structure

New pages under `src/components/` or `src/pages/`:

```
extract-login-page.tsx
extract-admin-page.tsx
extract-cohort-page.tsx          # PH Cohort overview (main landing)
extract-patient-detail-page.tsx  # Patient detail with left nav
extract-patient-overview.tsx     # Demographics sub-page
extract-patient-rhc.tsx          # RHC records sub-page
extract-patient-echo.tsx         # Echo records sub-page
extract-patient-cmr.tsx          # CMR records sub-page
extract-patient-cpex.tsx         # CPEX records sub-page
extract-patient-recruitment.tsx  # Recruitment status sub-page
extract-extraction-page.tsx      # Standalone extraction workflow
extract-reference-rhc-page.tsx   # RHC reference table (new)
extract-reference-echo-page.tsx  # Echo reference table (new)
```

### Subdomain routing

Following the existing cmr-app pattern:

```typescript
isExtractSubdomain() // checks for:
  // extract.axiomos.studio
  // extract.localhost
  // /extract/* path on localhost/127.0.0.1
```

### CORS origins (additions to app.py)

```
http://extract.localhost:5173       # Local dev
https://extract.axiomos.studio      # Production
```

---

## 3. Database Schema

All tables created in the existing Axiomos PostgreSQL database. Schema mirrors the current SQLite research.db exactly, with `extract_` prefix for isolation.

### extract_access_codes

Same structure as `cmr_access_codes`:

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| code_hash | TEXT NOT NULL | bcrypt hash of access code |
| name | TEXT | Display name for the code holder |
| is_admin | BOOLEAN DEFAULT FALSE | |
| created_at | TIMESTAMPTZ | |

### extract_sessions

Same structure as `cmr_sessions`:

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| token | TEXT NOT NULL UNIQUE | Session bearer token |
| access_code_id | INTEGER FK | References extract_access_codes |
| created_at | TIMESTAMPTZ | |
| expires_at | TIMESTAMPTZ | |

### extract_patients

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| hn | TEXT NOT NULL UNIQUE | Hospital number (match key) |
| name | TEXT | |
| dob | TEXT | |
| gender | TEXT | |
| study_id | TEXT | |
| source | TEXT DEFAULT 'web' | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### extract_rhc

~30 columns. Key fields:

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| hn | TEXT NOT NULL | FK to extract_patients.hn |
| date_rhc | TEXT | Procedure date |
| ra_mean | NUMERIC | RA mean pressure (mmHg) |
| ra_a | NUMERIC | RA a-wave |
| ra_v | NUMERIC | RA v-wave |
| ra_o2_sat_percent | NUMERIC | |
| rv_systolic | NUMERIC | |
| rv_diastolic | NUMERIC | |
| rv_o2_sat_percent | NUMERIC | |
| pa_systolic | NUMERIC | |
| pa_diastolic | NUMERIC | |
| pa_mean | NUMERIC | Key diagnostic value |
| pa_o2_sat_percent | NUMERIC | |
| pcwp_mean | NUMERIC | |
| pcwp_a | NUMERIC | |
| pcwp_v | NUMERIC | |
| aorta_systolic | NUMERIC | |
| aorta_diastolic | NUMERIC | |
| aorta_mean | NUMERIC | |
| aorta_o2_sat_percent | NUMERIC | |
| lv_systolic | NUMERIC | |
| lv_diastolic | NUMERIC | |
| cardiac_output | NUMERIC | L/min |
| cardiac_index | NUMERIC | L/min/m2 |
| pvr_wu | NUMERIC | Wood units |
| pvr_dyn | NUMERIC | dyn.s.cm-5 |
| tpg | NUMERIC | Transpulmonary gradient |
| rhc_comments | TEXT | Exact narrative text |
| status | TEXT | |
| status_date | TEXT | |
| created_at | TIMESTAMPTZ | |

### extract_echocardiogram

55 columns. Key fields:

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| hn | TEXT NOT NULL | FK to extract_patients.hn |
| study_date | TEXT | |
| case_type | TEXT | Enum: Normal, Valve, Heart failure, Ischaemic, etc. |
| primary_diagnosis | TEXT | |
| secondary_pathology | TEXT | |
| rhythm | TEXT | |
| heart_rate_bpm | INTEGER | |
| bsa_m2 | NUMERIC | |
| lv_size_description | TEXT | Normal/Mildly/Moderately/Severely dilated |
| lv_wall_thickness_description | TEXT | |
| lv_systolic_function_description | TEXT | Normal/Mildly/Moderately/Severely impaired |
| lvef_percent | NUMERIC | |
| lvef_visual_estimate_text | TEXT | |
| rv_size_description | TEXT | |
| rv_function_description | TEXT | |
| rv_s_prime_cm_s | NUMERIC | |
| rvsp_mmhg | NUMERIC | |
| rap_mmhg | NUMERIC | |
| tapse_mm | NUMERIC | |
| fac_percent | NUMERIC | |
| left_atrium_size_description | TEXT | |
| right_atrium_size_description | TEXT | |
| ivc_size_description | TEXT | |
| ivc_diameter_mm | NUMERIC | |
| aortic_root_description | TEXT | |
| ascending_aorta_description | TEXT | |
| septal_flattening_present | BOOLEAN | |
| septal_bounce_present | BOOLEAN | |
| d_shaped_lv_present | BOOLEAN | |
| main_pulmonary_artery_diameter_mm | NUMERIC | |
| pulmonary_artery_dilated_present | BOOLEAN | |
| pulmonary_hypertension_probability | TEXT | Low/Intermediate/High |
| aortic_valve_description | TEXT | |
| aortic_stenosis_severity | TEXT | None/Trace/Mild/Mild-moderate/Moderate/Severe |
| aortic_regurgitation_severity | TEXT | |
| aortic_regurgitation_pht_ms | NUMERIC | |
| aortic_regurgitation_pat_ms | NUMERIC | |
| mitral_valve_description | TEXT | |
| mitral_stenosis_severity | TEXT | |
| mitral_regurgitation_severity | TEXT | |
| tricuspid_valve_description | TEXT | |
| tricuspid_stenosis_severity | TEXT | |
| tricuspid_regurgitation_severity | TEXT | |
| pulmonary_valve_description | TEXT | |
| pulmonary_stenosis_severity | TEXT | |
| pulmonary_regurgitation_severity | TEXT | |
| interatrial_septum_intact | TEXT | Yes/No |
| image_quality | TEXT | Excellent/Good/Fair/Suboptimal/Poor |
| ward_or_op | TEXT | |
| conclusion_text_exact | TEXT | |
| conclusion_items | TEXT | JSON array |
| extraction_warnings | TEXT | JSON array of ambiguity notes from AI |
| uncertain_fields | TEXT | JSON array of field names flagged as uncertain |
| status | TEXT DEFAULT 'Pending' | Pending / Reviewed / Archived |
| created_at | TIMESTAMPTZ | |

### extract_cmr

151 columns. Organised by domain:

**Metadata**: id (SERIAL PK), hn (TEXT NOT NULL), date_cmr, status, status_date, created_at, source_file

**Study setup** (7 fields): indication, height, weight, heart_rate, contrast, stress, flow

**LV volumes & function** (15 fields): lvef, lv_size, lv_function, lvedv, lvedvi, lvesv, lvesvi, lvsv, lvsvi, lv_mass, lvmi, max_lv_wall, lvh, rwma, mapse

**RV volumes & function** (11 fields): rvef, rv_size, rv_function, rvedv, rvedvi, rvesv, rvesvi, rvsv, rvsvi, tapse, rv_lv_ratio

**Atria** (3 fields): la_size, la_volume, ra_size

**Septal & RH physiology** (9 fields): d_shaped_lv, d_shape_phase, septal_flattening, flattening_phase, septal_bounce, ias_bowing, ias_direction, rap, pcwp

**Pulmonary artery** (7 fields): mpa_size, lpa_size, rpa_size, mpa_vortex, mpa_flow, ph, constrictive_physiology

**Tissue characterisation** (4 fields): native_t1, t2, t2_star, ecv

**LGE / scar** (6 fields): lge, lge_pattern, lge_location, lge_transmurality, fibrosis, rv_insertion_point_lge

**Perfusion** (6 fields): perfusion_defect, inducible_ischaemia, fixed_defect, reversible_defect, perfusion_territory, perfusion_coronary_territory

**Aortic valve & aorta** (10 fields): asc_aorta, ao_forward_volume, ao_backward_volume, ar_volume, ar_rf, ar_severity, as_severity, ao_vmax, ao_mean_grad, holo_diastolic_reversal

**Mitral valve** (3 fields): mr_volume, mr_rf, mr_severity

**Tricuspid valve** (3 fields): tr_volume, tr_rf, tr_severity

**Pulmonary valve** (6 fields): pulmonary_forward_volume, pulmonary_backward_volume, pr_volume, pr_rf, pr_severity, qp_qs

**Pericardium** (3 fields): pericardial_effusion, pericardial_thickening, pericardial_inflammation

**Thrombus & mass** (4 fields): thrombus, thrombus_location, mass, mass_location

**Congenital** (2 fields): congenital, congenital_detail

**Surgery & device** (3 fields): cardiac_surgery, surgery_detail, device_prosthesis

**Classification & conclusions** (8 fields): cmr_class, primary_dx, secondary_dx, conclusions, classification_note, extracardiac_findings, other_extractable_text, qc_notes

All CMR columns are TEXT type (matching existing SQLite schema) except id (SERIAL) and created_at (TIMESTAMPTZ).

### extract_cpex

Mirrors the existing SQLite `cpex` table exactly. Currently a stub (0 rows in research.db) — stores metadata linking CPEX records to patients. CPEX data entry is manual only (no extraction prompt exists).

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| hn | TEXT NOT NULL | FK to extract_patients.hn |
| date_cpex | TEXT | Test date |
| source_file | TEXT | Source document filename |
| status | TEXT DEFAULT 'Pending' | Pending / Reviewed / Archived |
| status_date | TEXT | ISO timestamp of last status change |
| created_at | TIMESTAMPTZ | |

Note: As CPEX requirements grow, additional clinical fields (peak VO2, VE/VCO2 slope, etc.) can be added via Alembic migration.

### extract_study_recruitment

30+ columns tracking per-patient recruitment status:

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| hn | TEXT NOT NULL | FK to extract_patients.hn (business key, used in API) |
| patient_id | INTEGER | FK to extract_patients.id (relational FK for joins, kept in sync by service layer) |
| eligible_for_study | BOOLEAN | |
| cohort | TEXT | Study cohort assignment |
| recruitment_status | TEXT | Screening/Eligible/Approached/Consented/Enrolled/Completed/Declined/Withdrawn |
| comments | TEXT | |
| contact_method | TEXT | |
| contact_number | TEXT | |
| email_address | TEXT | |
| date_identified | TEXT | |
| date_first_contact | TEXT | |
| date_pis_sent | TEXT | |
| date_consent | TEXT | |
| consent_to_email | BOOLEAN | |
| pis_sent | BOOLEAN | |
| consent_obtained | BOOLEAN | |
| cpex_date | TEXT | |
| cpex_required | BOOLEAN | |
| cpex_booked | BOOLEAN | |
| cpex_scheduled | BOOLEAN | |
| cpex_completed | BOOLEAN | |
| cpex_appropriate | BOOLEAN | |
| cmr_required | BOOLEAN | |
| cmr_requested | BOOLEAN | |
| cmr_scheduled | BOOLEAN | |
| cmr_completed | BOOLEAN | |
| cmr_appropriate | BOOLEAN | |
| rhc_required | BOOLEAN | |
| rhc_requested | BOOLEAN | |
| rhc_scheduled | BOOLEAN | |
| rhc_completed | BOOLEAN | |
| rhc_appropriate | BOOLEAN | |
| echo_required | BOOLEAN | |
| echo_requested | BOOLEAN | |
| echo_scheduled | BOOLEAN | |
| echo_completed | BOOLEAN | |
| echo_appropriate | BOOLEAN | |
| source | TEXT | |
| created_at | TIMESTAMPTZ | |

---

## 4. API Endpoints

### Authentication (`/v1/extract/auth`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/extract/auth/login` | User login with access code |
| POST | `/v1/extract/auth/admin-login` | Admin login with password |
| POST | `/v1/extract/auth/logout` | Invalidate session |
| GET | `/v1/extract/auth/session` | Validate current session |
| GET | `/v1/extract/auth/codes` | List access codes (admin) |
| POST | `/v1/extract/auth/codes` | Create access code (admin) |
| DELETE | `/v1/extract/auth/codes/{id}` | Revoke access code (admin) |

### Patients (`/v1/extract/patients`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/extract/patients` | List patients (search, filter, paginate) |
| GET | `/v1/extract/patients/{hn}` | Get patient by hospital number with all records |
| POST | `/v1/extract/patients` | Create patient |
| PATCH | `/v1/extract/patients/{hn}` | Update patient |
| GET | `/v1/extract/patients/stats` | Summary statistics |

### Records (`/v1/extract/records`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/extract/records/rhc?hn={hn}` | List RHC records for patient |
| GET | `/v1/extract/records/rhc/{id}` | Get RHC record detail |
| POST | `/v1/extract/records/rhc` | Create RHC record |
| PATCH | `/v1/extract/records/rhc/{id}` | Update RHC record |
| DELETE | `/v1/extract/records/rhc/{id}` | Delete RHC record |
| GET | `/v1/extract/records/echo?hn={hn}` | List Echo records |
| GET | `/v1/extract/records/echo/{id}` | Get Echo record detail |
| POST | `/v1/extract/records/echo` | Create Echo record |
| PATCH | `/v1/extract/records/echo/{id}` | Update Echo record |
| DELETE | `/v1/extract/records/echo/{id}` | Delete Echo record |
| GET | `/v1/extract/records/cmr?hn={hn}` | List CMR records |
| GET | `/v1/extract/records/cmr/{id}` | Get CMR record detail |
| POST | `/v1/extract/records/cmr` | Create CMR record |
| PATCH | `/v1/extract/records/cmr/{id}` | Update CMR record |
| DELETE | `/v1/extract/records/cmr/{id}` | Delete CMR record |
| GET | `/v1/extract/records/cpex?hn={hn}` | List CPEX records |
| GET | `/v1/extract/records/cpex/{id}` | Get CPEX record detail |
| POST | `/v1/extract/records/cpex` | Create CPEX record |
| PATCH | `/v1/extract/records/cpex/{id}` | Update CPEX record |
| DELETE | `/v1/extract/records/cpex/{id}` | Delete CPEX record |

### Recruitment (`/v1/extract/recruitment`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/extract/recruitment` | List all recruitment records (filterable by cohort, status) |
| GET | `/v1/extract/recruitment/{hn}` | Get recruitment record for patient |
| POST | `/v1/extract/recruitment` | Create recruitment record |
| PATCH | `/v1/extract/recruitment/{hn}` | Update recruitment record |
| PATCH | `/v1/extract/recruitment/bulk-status` | Bulk status update |

### Extraction (`/v1/extract/extraction`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/extract/extraction/extract` | Run extraction (see Section 6 for request/response schemas) |
| POST | `/v1/extract/extraction/save` | Save extraction result to database (with patient matching) |

### Extraction request/response schemas

**Extract request** (POST `/v1/extract/extraction/extract`):

Three input modes (mutually exclusive):

```
Mode 1 - File upload (multipart/form-data):
  file: <PDF or Word file>
  modality: "rhc" | "echo" | "cmr" | "generic"
  source_type: "email" | "report"    # Required for rhc modality only

Mode 2 - Text paste (JSON):
  { "text": "...", "modality": "rhc"|"echo"|"cmr"|"generic", "source_type": "email"|"report" }

Mode 3 - Screenshot (JSON):
  { "image_base64": "...", "modality": "rhc"|"echo"|"cmr"|"generic", "source_type": "email"|"report" }
```

**Extract response** (JSON):

```json
{
  "modality": "rhc",
  "source_type": "formal_report",
  "extracted_data": {
    "hospital_number": "A12345",
    "date_rhc": "2026-03-15",
    "pa_systolic": 68,
    "pa_diastolic": 24,
    "pa_mean": 40,
    "pcwp_mean": 12,
    "cardiac_output": 4.2,
    "pvr_wu": 6.7,
    "rhc_comments": "Severe pre-capillary PH...",
    ...
  }
}
```

The `extracted_data` field names match the PostgreSQL column names 1:1 for each modality. No translation layer is needed — prompt output field names are identical to database column names.

**Save request** (POST `/v1/extract/extraction/save`):

```json
{
  "modality": "rhc",
  "hospital_number": "A12345",
  "create_patient_if_missing": true,
  "patient_data": { "name": "...", "dob": "..." },
  "record_data": { "pa_systolic": 68, ... }
}
```

### Bulk Operations (`/v1/extract/bulk`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/extract/bulk/export?format=csv` | Export cohort data as CSV |
| GET | `/v1/extract/bulk/export?format=xlsx` | Export cohort data as Excel |

---

## 5. Screens & UI

### Design system

Reuse the cmr-app design language:
- **Tables**: Striped rows, sticky headers, hover elevation, colour-coded values
- **Mini charts**: Axiomos inline SVG components (MiniBars, MiniLine sparklines, MiniProgressRing, MiniDonut) alongside cohort metrics
- **Reference tables**: Collapsible sections, LL/Mean/UL columns, direction indicators, BSA badges
- **Surfaces**: Card primitives with elevation variants, section headers with tone accents
- **Layout**: Stack/Row/Grid system, Container with responsive gutters
- **Typography**: Display/H1-H3/Body/Caption/Micro scale with HSL colour tokens
- **Interactions**: 180ms transitions, hover elevation lift, smooth scroll

### Screen details

#### 5.1 Login (`/extract-login`)

Access code entry form. Same layout as CMR login page.

#### 5.2 Admin (`/extract-admin`)

Access code management. Same layout as CMR admin page.

#### 5.3 PH Cohort Overview (`/extract-cohort`) - Main landing

| Element | Description |
|---------|-------------|
| Summary strip | Total patients, records by modality, recruitment funnel counts. Mini charts (progress rings for recruitment completion, sparklines for recent activity) |
| Cohort table | Searchable, sortable, filterable table of all patients. Columns: Hospital No., Name, Cohort, Status, RHC count, Echo count, CMR count, CPEX count, key haemodynamics (PA mean, PVR, PCWP). Mini bar charts inline for PA mean/PVR |
| Bulk actions | Multi-select with: Export CSV, Export Excel, Bulk status update |
| Row click | Navigates to Patient Detail |

#### 5.4 Patient Detail (`/extract-patient/{hn}`)

Left navigation with sub-pages:

**Overview tab**: Demographics card (name, HN, DOB, gender, study ID), editable inline. Summary of available records across modalities.

**RHC tab**: Table of RHC records for this patient. Click to expand/edit. Manual entry button. Key columns: date, PA systolic/diastolic/mean, PCWP, CO/CI, PVR. Full detail view shows all ~30 fields in a polished labelled form grouped by: RA pressures, RV pressures, PA pressures, PCWP, Aorta, LV, Cardiac function, PVR, Comments.

**Echo tab**: Table of Echo records. Key columns: date, LVEF, LV size, RV size/function, RVSP, TAPSE, valve severities. Full detail shows all 55 fields grouped by: Demographics/Context, LV, RV, Atria, IVC, Septal/Geometry, PA/PH, Aortic valve, Mitral valve, Tricuspid valve, Pulmonary valve, Conclusions.

**CMR tab**: Table of CMR records. Key columns: date, LVEF, RVEF, LV/RV size, LGE, cmr_class, primary_dx. Full detail shows all 151 fields grouped by: Study setup, LV volumes/function, RV volumes/function, Atria, Septal/RH physiology, PA/PH, Tissue characterisation, LGE/scar, Perfusion, Aortic valve/aorta, Mitral valve, Tricuspid valve, Pulmonary valve, Pericardium, Thrombus/mass, Congenital, Surgery/device, Classification/conclusions.

**CPEX tab**: Table of CPEX records. Key columns: date, peak VO2, % predicted, VE/VCO2 slope. Full detail shows all fields.

**Recruitment tab**: Single recruitment record for this patient. Polished form with sections: Eligibility & Cohort, Contact details, Consent tracking, Per-modality tracking (RHC/Echo/CMR/CPEX required/requested/scheduled/completed/appropriate checkboxes).

#### 5.5 Extraction (`/extract-new`)

Step-by-step workflow:

1. **Input**: Three tabs - Upload file (drag-and-drop PDF/Word, max 20MB), Paste text (textarea), Screenshot (file picker for PNG/JPG images). Select modality: RHC / Echo / CMR / Generic. For RHC, also select source type: Email or Formal Report. CPEX has no extraction prompt — data is entered manually on the patient detail page.
2. **Processing**: Loading state while GPT-4o extracts. Model configurable via `EXTRACT_OPENAI_MODEL` env var.
3. **Review**: Polished labelled form with all extracted fields, grouped by domain (same grouping as detail views). Fields pre-filled from extraction. User corrects as needed.
4. **Save**: Two options:
   - **Add to PH Cohort**: Enter hospital number. If patient exists (matched on HN), adds record to that patient. If not found, creates new patient record. Navigates to patient detail.
   - **Standalone**: Download extracted data as JSON. No database write.

#### 5.6 Reference Tables

**RHC Reference Table** (`/extract-reference-rhc`): New. Normal haemodynamic ranges. Collapsible sections: RA pressures, RV pressures, PA pressures, PCWP, Cardiac output/index, PVR. Same visual style as cmr-app reference tables.

**Echo Reference Table** (`/extract-reference-echo`): New. Normal echocardiographic ranges. Collapsible sections: LV dimensions/function, RV dimensions/function, Atrial sizes, Valve assessments, Diastolic function, PH probability criteria. Same visual style.

**CMR Reference Table**: Port from existing cmr-app reference table component.

---

## 6. Extraction Service

### Architecture

```
POST /v1/extract/extraction/extract
  ├── Accept: multipart/form-data (file upload)
  │   or JSON { text: string } (paste)
  │   or JSON { image_base64: string } (screenshot)
  ├── Query param: modality=rhc|echo|cmr|generic
  │
  ├── Select prompt file based on modality:
  │   - rhc + source_type=email → email_extraction.txt
  │   - rhc + source_type=report → report_extraction.txt
  │   - echo → echo_extraction.txt
  │   - cmr → cmr_extraction.txt
  │   - generic → generic_extraction.txt
  │
  ├── For file uploads: extract text (PyMuPDF for PDF, python-docx for Word)
  │   For images: send as vision API input
  │   For text: send directly
  │
  ├── Call OpenAI API (model from EXTRACT_OPENAI_MODEL env var)
  │   - System prompt: the selected extraction prompt file
  │   - User message: the document text or image
  │   - Response format: JSON matching the modality schema
  │
  └── Return: { modality, extracted_data, source_type }
```

### Prompt files

Copied verbatim from `C:\Users\Ciaran\AppData\Local\Cardiology Data Extractor\prompts\` into `src/research_os/extract_extraction/prompts/`. No modifications.

### Configuration

```env
EXTRACT_OPENAI_MODEL=gpt-4o          # Configurable model
EXTRACT_OPENAI_API_KEY=sk-...        # Server-side API key
EXTRACT_ADMIN_PASSWORD=...           # Admin login password
```

---

## 7. Data Migration

One-time migration script to port existing `research.db` into PostgreSQL:

1. Read all tables from SQLite: patients, rhc, echocardiogram, cmr, cpex, study_recruitment
2. Map to PostgreSQL `extract_*` tables
3. Preserve all existing data, hospital numbers, and relationships
4. Run as an Alembic migration or standalone script

---

## 8. Reference Tables (New Content)

### RHC Normal Ranges

Source: ESC/ERS Guidelines for PH, standard haemodynamic reference values. Sections:

- Right atrial pressure (RA mean: 1-5 mmHg)
- Right ventricular pressure (systolic: 15-30, diastolic: 0-8)
- Pulmonary artery pressure (systolic: 15-30, diastolic: 4-12, mean: 10-20)
- Pulmonary capillary wedge pressure (mean: 6-12)
- Cardiac output (4-8 L/min), Cardiac index (2.5-4.0 L/min/m2)
- PVR (<2 WU normal, >3 WU elevated)
- Transpulmonary gradient (<12 mmHg normal)

### Echo Normal Ranges

Source: ASE/EACVI Guidelines. Sections:

- LV dimensions and function (LVEF: 52-72% male, 54-74% female)
- RV dimensions and function (TAPSE >17mm, S' >9.5 cm/s, FAC >35%)
- Atrial sizes (LA volume index: <34 mL/m2)
- IVC diameter and collapsibility
- Valve severity grading (ASE criteria for AS, AR, MR, MS, TR, PR)
- PH probability (ESC criteria: low/intermediate/high based on TR velocity + ancillary signs)
- Diastolic function parameters

### CMR Normal Ranges

Port existing reference data from cmr-app (`cmr_reference_data.json`). Age/sex-indexed LL/Mean/UL for all volumetric parameters.

---

## 9. Permissions Model

All endpoints require a valid session token (Bearer auth).

| Action | Access level |
|--------|-------------|
| Read patients, records, recruitment | All authenticated users |
| Create/update patients and records | All authenticated users |
| Delete records | All authenticated users |
| Export data (CSV/Excel) | All authenticated users |
| Bulk status updates | All authenticated users |
| Manage access codes | Admin only |

Admin status is determined by `extract_access_codes.is_admin`.

## 10. Record Status Values

All clinical record tables (RHC, Echo, CMR, CPEX) use a `status` field with these values:

- **Pending** (default): Newly created, awaiting review
- **Reviewed**: Clinician has verified the data
- **Archived**: No longer active but preserved

## 11. Error Handling (Extraction Service)

| Scenario | Behaviour |
|----------|-----------|
| OpenAI API timeout (>120s) | Return 504 with message "Extraction timed out" |
| OpenAI rate limit (429) | Return 503 with Retry-After header |
| Malformed JSON from model | Retry once with same prompt; if still invalid, return 422 with raw output for debugging |
| File too large (>20MB) | Reject with 413 before calling API |
| Unsupported file type | Reject with 415 (only PDF, DOCX, PNG, JPG accepted) |
| Token limit exceeded | Return 422 with message suggesting the document be split |

No automatic retries beyond the single malformed-JSON retry.

## 12. Indexing Strategy

- `extract_patients.hn`: UNIQUE index (match key for all lookups)
- `extract_rhc.hn`, `extract_echocardiogram.hn`, `extract_cmr.hn`, `extract_cpex.hn`, `extract_study_recruitment.hn`: Index on `hn` for patient-scoped queries
- Key haemodynamic columns used in cohort table sorting (pa_mean, pvr_wu, pcwp_mean on RHC; lvef on CMR; lvef_percent, rvsp_mmhg on Echo) are stored as NUMERIC for proper sorting/filtering

## 13. Date Handling

Dates are stored as TEXT (matching the existing SQLite schema) for migration fidelity. Date parsing and formatting happens at the application layer. ISO 8601 format (`YYYY-MM-DD`) is enforced by the API validation layer.

## 14. Testing Strategy

- **Backend**: Pytest for all service modules. Test extraction with sample documents from `C:\Users\Ciaran\AppData\Local\Cardiology Data Extractor\runtime\word_preview_pdfs\` (15+ patient report PDFs).
- **Frontend**: Component tests for key forms. E2E with Playwright for extraction workflow (upload, review, save to cohort).
- **Migration**: Verify row counts and data integrity post-migration. Compare PostgreSQL counts with SQLite source.
- **Auth**: Test access code login, admin login, session expiry, and unauthorized access rejection.

---

## Appendix A: Complete Field Catalogue

### CMR Fields (151 columns in SQLite schema)

Note: The groupings below enumerate the primary fields. The 151-column count comes from the actual SQLite `cmr` table schema (`PRAGMA table_info(cmr)`). All columns are ported to PostgreSQL.

**Metadata** (7): id, hn, date_cmr, status, status_date, created_at, source_file

**Study setup** (7): indication, height, weight, heart_rate, contrast, stress, flow

**LV** (15): lvef, lv_size, lv_function, lvedv, lvedvi, lvesv, lvesvi, lvsv, lvsvi, lv_mass, lvmi, max_lv_wall, lvh, rwma, mapse

**RV** (11): rvef, rv_size, rv_function, rvedv, rvedvi, rvesv, rvesvi, rvsv, rvsvi, tapse, rv_lv_ratio

**Atria** (3): la_size, la_volume, ra_size

**Septal / RH physiology** (9): d_shaped_lv, d_shape_phase, septal_flattening, flattening_phase, septal_bounce, ias_bowing, ias_direction, rap, pcwp

**PA / PH** (7): mpa_size, lpa_size, rpa_size, mpa_vortex, mpa_flow, ph, constrictive_physiology

**Tissue characterisation** (4): native_t1, t2, t2_star, ecv

**LGE / scar** (6): lge, lge_pattern, lge_location, lge_transmurality, fibrosis, rv_insertion_point_lge

**Perfusion** (6): perfusion_defect, inducible_ischaemia, fixed_defect, reversible_defect, perfusion_territory, perfusion_coronary_territory

**Aortic valve / aorta** (10): asc_aorta, ao_forward_volume, ao_backward_volume, ar_volume, ar_rf, ar_severity, as_severity, ao_vmax, ao_mean_grad, holo_diastolic_reversal

**Mitral valve** (3): mr_volume, mr_rf, mr_severity

**Tricuspid valve** (3): tr_volume, tr_rf, tr_severity

**Pulmonary valve** (6): pulmonary_forward_volume, pulmonary_backward_volume, pr_volume, pr_rf, pr_severity, qp_qs

**Pericardium** (3): pericardial_effusion, pericardial_thickening, pericardial_inflammation

**Thrombus / mass** (4): thrombus, thrombus_location, mass, mass_location

**Congenital** (2): congenital, congenital_detail

**Surgery / device** (3): cardiac_surgery, surgery_detail, device_prosthesis

**Classification / conclusions** (8): cmr_class, primary_dx, secondary_dx, conclusions, classification_note, extracardiac_findings, other_extractable_text, qc_notes

### Echo Fields (57 total)

**Demographics** (5): hn, study_date, case_type, primary_diagnosis, secondary_pathology

**Clinical context** (3): rhythm, heart_rate_bpm, bsa_m2

**LV** (5): lv_size_description, lv_wall_thickness_description, lv_systolic_function_description, lvef_percent, lvef_visual_estimate_text

**RV** (6): rv_size_description, rv_function_description, rv_s_prime_cm_s, rvsp_mmhg, tapse_mm, fac_percent

**Atria** (2): left_atrium_size_description, right_atrium_size_description

**IVC** (2): ivc_size_description, ivc_diameter_mm

**Aorta** (2): aortic_root_description, ascending_aorta_description

**Septal / geometry** (3): septal_flattening_present, septal_bounce_present, d_shaped_lv_present

**PA / PH** (3): main_pulmonary_artery_diameter_mm, pulmonary_artery_dilated_present, pulmonary_hypertension_probability

**Aortic valve** (5): aortic_valve_description, aortic_stenosis_severity, aortic_regurgitation_severity, aortic_regurgitation_pht_ms, aortic_regurgitation_pat_ms

**Mitral valve** (3): mitral_valve_description, mitral_stenosis_severity, mitral_regurgitation_severity

**Tricuspid valve** (3): tricuspid_valve_description, tricuspid_stenosis_severity, tricuspid_regurgitation_severity

**Pulmonary valve** (3): pulmonary_valve_description, pulmonary_stenosis_severity, pulmonary_regurgitation_severity

**Other** (4): interatrial_septum_intact, image_quality, ward_or_op, rap_mmhg

**Conclusions** (4): conclusion_text_exact, conclusion_items, extraction_warnings, uncertain_fields

### RHC Fields (~30 total)

**Pressures** (15): ra_mean, ra_a, ra_v, rv_systolic, rv_diastolic, pa_systolic, pa_diastolic, pa_mean, pcwp_mean, pcwp_a, pcwp_v, aorta_systolic, aorta_diastolic, aorta_mean, lv_systolic, lv_diastolic

**O2 saturations** (4): ra_o2_sat_percent, rv_o2_sat_percent, pa_o2_sat_percent, aorta_o2_sat_percent

**Cardiac function** (2): cardiac_output, cardiac_index

**Resistance / gradients** (3): pvr_wu, pvr_dyn, tpg

**Narrative** (1): rhc_comments

**Metadata** (4): date_rhc, status, status_date, created_at

### Recruitment Fields (30+ total)

**Status** (5): eligible_for_study, cohort, recruitment_status, comments, source

**Contact** (4): contact_method, contact_number, email_address, consent_to_email

**Dates** (4): date_identified, date_first_contact, date_pis_sent, date_consent

**Per-modality tracking** (20): {cpex,cmr,rhc,echo}_{required,requested,scheduled,completed,appropriate}

**Consent** (2): pis_sent, consent_obtained

### Coded Value Enumerations

**Chamber size**: Normal, Small, Mildly dilated, Moderately dilated, Severely dilated

**Chamber function**: Normal, Mildly impaired, Moderately impaired, Severely impaired

**Valve severity**: None, Trace, Mild, Mild to moderate, Moderate, Severe

**PH probability**: Low, Intermediate, High

**Image quality**: Excellent, Good, Fair, Suboptimal, Poor

**Echo case_type**: Normal, Valve, Heart failure / cardiomyopathy, Ischaemic, Arrhythmia / EP, Pulmonary hypertension / right heart, Pericardial, Aortic, Congenital, Mass / thrombus / infective, Post-operative / prosthetic / device, Other

**CMR cmr_class**: Normal, Limited / non-diagnostic, Ischaemic, Non-ischaemic cardiomyopathy, Hypertrophic cardiomyopathy / LVH, Myocarditis / inflammatory, Infiltrative / storage, Valve disease, Pulmonary hypertension / right heart, Congenital heart disease, Pericardial disease, Mass / thrombus, Post-operative / prosthetic, Other

**CMR primary_dx / secondary_dx**: Normal study, Limited / non-diagnostic study, Inducible myocardial ischaemia, Prior myocardial infarction / ischaemic scar, Ischaemic cardiomyopathy, Dilated cardiomyopathy, Non-dilated LV cardiomyopathy, Restrictive cardiomyopathy, Hypertrophic cardiomyopathy, Arrhythmogenic cardiomyopathy, Non-ischaemic myocardial fibrosis / scar, Myocarditis, Prior myocarditis / post-inflammatory scar, Myopericarditis, Cardiac amyloidosis pattern, Cardiac sarcoidosis pattern, Anderson-Fabry disease pattern, Pericardial disease, Pulmonary hypertension phenotype, Congenital heart disease, LV thrombus, Cardiac mass, Moderate aortic regurgitation, Moderate-to-severe aortic regurgitation, Severe aortic regurgitation, Moderate aortic stenosis, Moderate-to-severe aortic stenosis, Severe aortic stenosis, Moderate mitral regurgitation, Moderate-to-severe mitral regurgitation, Severe mitral regurgitation, Moderate tricuspid regurgitation, Moderate-to-severe tricuspid regurgitation, Severe tricuspid regurgitation, Moderate pulmonary regurgitation, Moderate-to-severe pulmonary regurgitation, Severe pulmonary regurgitation

**Recruitment status**: Screening, Eligible, Approached, Consented, Enrolled, Completed, Declined, Withdrawn, Not Eligible

**LGE pattern**: Subendocardial, Transmural, Mid-wall, Epicardial, Patchy, Diffuse
