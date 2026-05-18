# Cardiology Data Extractor Web Application — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the CLI-based Cardiology Data Extractor to a web app bolted onto Axiomos at `extract.localhost:5173`, with PH cohort management, AI-powered extraction, and recruitment tracking.

**Architecture:** Compartmentalized subsystem within `research-os-api` — separate auth, `/v1/extract/*` routes, and frontend pages sharing the same FastAPI server and PostgreSQL database. Follows the exact patterns established by the CMR analysis tool (`cmr_auth/`, `cmr_cases/`).

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL, React 18, TypeScript, Vite, Tailwind CSS, Radix UI, OpenAI GPT-4o API.

**Spec:** `docs/superpowers/specs/2026-04-14-cardiology-data-extractor-web-design.md`

**Pattern references:** All backend code follows the patterns in `cmr_auth/`, `cmr_cases/`, and `cmr_summaries/`. All frontend code follows the patterns in `frontend/src/lib/cmr-auth.ts` and `frontend/src/AppRouter.tsx`.

---

## Phase 1: Backend Auth & Database Models

### Task 1: Create extract_auth module (models + service + router)

**Files:**
- Create: `src/research_os/extract_auth/__init__.py`
- Create: `src/research_os/extract_auth/models.py`
- Create: `src/research_os/extract_auth/service.py`
- Create: `src/research_os/extract_auth/router.py`
- Modify: `src/research_os/api/app.py` (add router mount + CORS origins)

**Reference:** Copy patterns exactly from `src/research_os/cmr_auth/` — same guard functions, token extraction, bcrypt hashing, session management. Change all prefixes from `cmr_` to `extract_` and table names from `cmr_access_codes`/`cmr_sessions` to `extract_access_codes`/`extract_sessions`.

- [ ] **Step 1: Create models.py**

```python
# src/research_os/extract_auth/models.py
# Same pattern as cmr_auth/models.py
# Tables: extract_access_codes, extract_sessions
# Classes: ExtractAccessCode, ExtractSession
# Use Mapped[T], mapped_column(), uuid4 defaults, _utcnow
```

Follow `cmr_auth/models.py` exactly. Key differences:
- `__tablename__ = "extract_access_codes"` (not `cmr_access_codes`)
- `__tablename__ = "extract_sessions"` (not `cmr_sessions`)
- Class names: `ExtractAccessCode`, `ExtractSession`
- FK reference: `ForeignKey("extract_access_codes.id", ondelete="CASCADE")`

- [ ] **Step 2: Create service.py**

```python
# src/research_os/extract_auth/service.py
# Same pattern as cmr_auth/service.py
# Functions: user_login, admin_login, get_session_context, list_access_codes, create_access_code, delete_access_code, logout
# Uses: bcrypt, secrets.token_hex(32), session_scope(), create_all_tables()
```

Follow `cmr_auth/service.py` exactly. Import from `extract_auth.models` instead of `cmr_auth.models`. Read env var `EXTRACT_ADMIN_PASSWORD` instead of `CMR_ADMIN_PASSWORD`.

- [ ] **Step 3: Create router.py**

```python
# src/research_os/extract_auth/router.py
# router = APIRouter(prefix="/v1/extract", tags=["extract"])
# Endpoints: /auth/login, /auth/admin-login, /auth/logout, /auth/session (GET), /auth/codes (GET, POST, DELETE)
# Guard functions: _require_admin, _require_session, _extract_token
```

Follow `cmr_auth/router.py` exactly. Change prefix to `/v1/extract`. Import from `extract_auth.service`.

- [ ] **Step 4: Create __init__.py**

```python
# src/research_os/extract_auth/__init__.py
# Empty file
```

- [ ] **Step 5: Mount router and add CORS origins in app.py**

Add to imports (near existing CMR router imports):
```python
from research_os.extract_auth.router import router as extract_auth_router
```

Add to router mounting (near existing CMR mounts):
```python
app.include_router(extract_auth_router)
```

Add to CORS origins list:
```python
"http://extract.localhost:5173",
"https://extract.axiomos.studio",
```

- [ ] **Step 6: Test auth endpoints manually**

```bash
cd C:\Users\Ciaran\Documents\GitHub\research-os-api
# Start server
python -m uvicorn --app-dir src research_os.api.app:app --reload --port 8011

# Test admin login (set EXTRACT_ADMIN_PASSWORD in .env first)
curl -X POST http://127.0.0.1:8011/v1/extract/auth/admin-login -H "Content-Type: application/json" -d '{"password":"your_password"}'

# Create access code
curl -X POST http://127.0.0.1:8011/v1/extract/auth/codes -H "Authorization: Bearer <admin_token>" -H "Content-Type: application/json" -d '{"name":"Test User","code":"test123"}'

# User login
curl -X POST http://127.0.0.1:8011/v1/extract/auth/login -H "Content-Type: application/json" -d '{"code":"test123"}'
```

Expected: 200 responses with session tokens.

- [ ] **Step 7: Commit**

```bash
git add src/research_os/extract_auth/ src/research_os/api/app.py
git commit -m "feat(extract): add auth module with access codes and sessions"
```

---

### Task 2: Create database models for all extract tables

**Files:**
- Create: `src/research_os/extract_patients/__init__.py`
- Create: `src/research_os/extract_patients/models.py`
- Create: `src/research_os/extract_records/__init__.py`
- Create: `src/research_os/extract_records/models.py`
- Create: `src/research_os/extract_recruitment/__init__.py`
- Create: `src/research_os/extract_recruitment/models.py`

**Reference:** Follow `cmr_cases/models.py` pattern. Use `Mapped[T]` type hints, `mapped_column()`, `_utcnow` defaults.

- [ ] **Step 1: Create extract_patients/models.py**

```python
# Table: extract_patients
# Columns: id (PK uuid), hn (TEXT UNIQUE NOT NULL), name, dob, gender, study_id, source (default 'web'), created_at, updated_at
```

Key: `hn` must have `unique=True, index=True`.

- [ ] **Step 2: Create extract_records/models.py**

Four model classes in one file:

```python
# ExtractRhc — table: extract_rhc
#   ~30 columns: id, hn (TEXT NOT NULL, index=True), date_rhc, ra_mean (Numeric), ra_a, ra_v, ra_o2_sat_percent,
#   rv_systolic, rv_diastolic, rv_o2_sat_percent, pa_systolic, pa_diastolic, pa_mean (Numeric),
#   pa_o2_sat_percent, pcwp_mean (Numeric), pcwp_a, pcwp_v, aorta_systolic, aorta_diastolic,
#   aorta_mean, aorta_o2_sat_percent, lv_systolic, lv_diastolic, cardiac_output (Numeric),
#   cardiac_index (Numeric), pvr_wu (Numeric), pvr_dyn, tpg, rhc_comments (Text),
#   status (default 'Pending'), status_date, created_at
# Key haemodynamic columns (pa_mean, pvr_wu, pcwp_mean, cardiac_output, cardiac_index) use Float type for sorting/filtering.

# ExtractEchocardiogram — table: extract_echocardiogram
#   hn column: Mapped[str] = mapped_column(Text, nullable=False, index=True)
#   57 columns from spec Appendix A. All TEXT except:
#   - lvef_percent, rv_s_prime_cm_s, rvsp_mmhg, rap_mmhg, tapse_mm, fac_percent,
#     ivc_diameter_mm, main_pulmonary_artery_diameter_mm, heart_rate_bpm,
#     bsa_m2, aortic_regurgitation_pht_ms, aortic_regurgitation_pat_ms → Float/Integer
#   - septal_flattening_present, septal_bounce_present, d_shaped_lv_present,
#     pulmonary_artery_dilated_present → Boolean
#   - conclusion_items, extraction_warnings, uncertain_fields → Text (JSON strings)

# ExtractCmr — table: extract_cmr
#   hn column: Mapped[str] = mapped_column(Text, nullable=False, index=True)
#   151 columns from SQLite schema. All TEXT type (matching existing schema) except id and created_at.
#   Generate column list from: sqlite3 research.db "PRAGMA table_info(cmr)"
#   Every column is Mapped[str | None] = mapped_column(Text, nullable=True) except id and hn.

# ExtractCpex — table: extract_cpex
#   7 columns: id, hn, date_cpex, source_file, status (default 'Pending'), status_date, created_at
```

For the 151-column CMR model: generate the column definitions programmatically from the SQLite PRAGMA output rather than hand-typing. Use a script or just map them all as `Mapped[str | None] = mapped_column(Text, nullable=True)`.

- [ ] **Step 3: Create extract_recruitment/models.py**

```python
# ExtractStudyRecruitment — table: extract_study_recruitment
#   30+ columns from spec. Boolean fields for per-modality tracking:
#   {cpex,cmr,rhc,echo}_{required,requested,scheduled,completed,appropriate}
#   Plus: eligible_for_study, cohort, recruitment_status, comments, contact info, dates, consent flags
```

- [ ] **Step 4: Create __init__.py files**

Empty `__init__.py` in each new package directory.

- [ ] **Step 5: Verify models load without errors**

```bash
cd C:\Users\Ciaran\Documents\GitHub\research-os-api
python -c "from research_os.extract_patients.models import ExtractPatient; print('OK')"
python -c "from research_os.extract_records.models import ExtractRhc, ExtractEchocardiogram, ExtractCmr, ExtractCpex; print('OK')"
python -c "from research_os.extract_recruitment.models import ExtractStudyRecruitment; print('OK')"
```

Expected: `OK` for each.

- [ ] **Step 6: Commit**

```bash
git add src/research_os/extract_patients/ src/research_os/extract_records/ src/research_os/extract_recruitment/
git commit -m "feat(extract): add SQLAlchemy models for patients, records, recruitment"
```

---

### Task 3: Create Alembic migration for all extract tables

**Files:**
- Create: `alembic/versions/xxxx_add_extract_tables.py` (auto-generated)

- [ ] **Step 1: Generate migration**

```bash
cd C:\Users\Ciaran\Documents\GitHub\research-os-api
# Ensure all models are imported so Alembic sees them
python -c "
from research_os.extract_auth.models import ExtractAccessCode, ExtractSession
from research_os.extract_patients.models import ExtractPatient
from research_os.extract_records.models import ExtractRhc, ExtractEchocardiogram, ExtractCmr, ExtractCpex
from research_os.extract_recruitment.models import ExtractStudyRecruitment
print('All models imported')
"

# Generate migration
alembic revision --autogenerate -m "add extract tables"
```

- [ ] **Step 2: Review generated migration**

Open the generated file in `alembic/versions/`. Verify it creates all 8 tables with correct columns, indexes, and foreign keys.

- [ ] **Step 3: Run migration**

```bash
alembic upgrade head
```

Expected: Tables created in PostgreSQL.

- [ ] **Step 4: Verify tables exist**

```bash
python -c "
from research_os.db import get_engine
from sqlalchemy import inspect
engine = get_engine()
inspector = inspect(engine)
tables = [t for t in inspector.get_table_names() if t.startswith('extract_')]
print(sorted(tables))
"
```

Expected: `['extract_access_codes', 'extract_cmr', 'extract_cpex', 'extract_echocardiogram', 'extract_patients', 'extract_rhc', 'extract_sessions', 'extract_study_recruitment']`

- [ ] **Step 5: Commit**

```bash
git add alembic/
git commit -m "feat(extract): add Alembic migration for extract tables"
```

---

## Phase 2: Backend CRUD Services & Routes

### Task 4: Patients CRUD (service + router)

**Files:**
- Create: `src/research_os/extract_patients/service.py`
- Create: `src/research_os/extract_patients/router.py`
- Modify: `src/research_os/api/app.py` (mount router)

**Reference:** Follow `cmr_cases/service.py` and `cmr_cases/router.py` patterns exactly.

- [ ] **Step 1: Create service.py**

```python
# Functions:
# list_patients(search: str | None, limit: int, offset: int) -> list[dict]
# get_patient(hn: str) -> dict  (with all associated record counts)
# create_patient(hn: str, name: str | None, dob: str | None, gender: str | None, study_id: str | None) -> dict
# update_patient(hn: str, **kwargs) -> dict
# get_stats() -> dict  (total patients, record counts per modality)
# find_or_create_patient(hn: str, **kwargs) -> dict  (for extraction save flow)
```

Use `session_scope()`, `create_all_tables()`, `select()`, same patterns as `cmr_cases/service.py`. Custom exceptions: `ExtractPatientNotFoundError`, `ExtractPatientValidationError`.

- [ ] **Step 2: Create router.py**

```python
# router = APIRouter(prefix="/v1/extract", tags=["extract"])
# Endpoints:
# GET /patients?search=&limit=&offset=
# GET /patients/stats
# GET /patients/{hn}
# POST /patients
# PATCH /patients/{hn}
# All require _require_session guard (import from extract_auth.router or create local copy)
```

- [ ] **Step 3: Mount in app.py**

```python
from research_os.extract_patients.router import router as extract_patients_router
app.include_router(extract_patients_router)
```

- [ ] **Step 4: Test endpoints**

```bash
# Create patient
curl -X POST http://127.0.0.1:8011/v1/extract/patients -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"hn":"TEST001","name":"Test Patient","gender":"Male"}'

# List patients
curl http://127.0.0.1:8011/v1/extract/patients -H "Authorization: Bearer <token>"

# Get patient
curl http://127.0.0.1:8011/v1/extract/patients/TEST001 -H "Authorization: Bearer <token>"
```

- [ ] **Step 5: Commit**

```bash
git add src/research_os/extract_patients/ src/research_os/api/app.py
git commit -m "feat(extract): add patients CRUD service and routes"
```

---

### Task 5: Records CRUD (RHC, Echo, CMR, CPEX)

**Files:**
- Create: `src/research_os/extract_records/service.py`
- Create: `src/research_os/extract_records/router.py`
- Modify: `src/research_os/api/app.py` (mount router)

- [ ] **Step 1: Create service.py**

Generic CRUD service that works for all four modalities:

```python
# Functions (parameterised by model class):
# list_records(model_class, hn: str | None, limit: int, offset: int) -> list[dict]
# get_record(model_class, record_id: str) -> dict
# create_record(model_class, data: dict) -> dict
# update_record(model_class, record_id: str, data: dict) -> dict
# delete_record(model_class, record_id: str) -> None
#
# Plus modality-specific serializers that pick key columns for list views:
# _serialize_rhc_summary(row) -> dict  (date, pa_mean, pvr_wu, pcwp_mean, CO, CI)
# _serialize_echo_summary(row) -> dict  (date, lvef, lv_size, rv_size, rvsp, tapse)
# _serialize_cmr_summary(row) -> dict  (date, lvef, rvef, cmr_class, primary_dx)
# _serialize_cpex_summary(row) -> dict  (date, status)
```

- [ ] **Step 2: Create router.py**

```python
# router = APIRouter(prefix="/v1/extract", tags=["extract"])
# Endpoints for each modality: GET list, GET detail, POST, PATCH, DELETE
# /records/rhc, /records/rhc/{id}
# /records/echo, /records/echo/{id}
# /records/cmr, /records/cmr/{id}
# /records/cpex, /records/cpex/{id}
```

- [ ] **Step 3: Mount in app.py**

```python
from research_os.extract_records.router import router as extract_records_router
app.include_router(extract_records_router)
```

- [ ] **Step 4: Test key endpoints**

```bash
# Create RHC record
curl -X POST http://127.0.0.1:8011/v1/extract/records/rhc -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"hn":"TEST001","date_rhc":"2026-01-15","pa_mean":40,"pvr_wu":6.7}'

# List RHC records
curl "http://127.0.0.1:8011/v1/extract/records/rhc?hn=TEST001" -H "Authorization: Bearer <token>"
```

- [ ] **Step 5: Commit**

```bash
git add src/research_os/extract_records/ src/research_os/api/app.py
git commit -m "feat(extract): add records CRUD for RHC, Echo, CMR, CPEX"
```

---

### Task 6: Recruitment CRUD + Bulk operations

**Files:**
- Create: `src/research_os/extract_recruitment/service.py`
- Create: `src/research_os/extract_recruitment/router.py`
- Modify: `src/research_os/api/app.py` (mount router)

- [ ] **Step 1: Create service.py**

```python
# Functions:
# list_recruitment(cohort: str | None, status: str | None) -> list[dict]
# get_recruitment(hn: str) -> dict
# create_recruitment(hn: str, data: dict) -> dict
# update_recruitment(hn: str, data: dict) -> dict
# bulk_update_status(hns: list[str], status: str) -> int  (returns count updated)
```

- [ ] **Step 2: Create router.py**

```python
# GET /recruitment, GET /recruitment/{hn}, POST /recruitment, PATCH /recruitment/{hn}
# PATCH /recruitment/bulk-status
```

- [ ] **Step 3: Mount in app.py and test**

- [ ] **Step 4: Commit**

```bash
git add src/research_os/extract_recruitment/ src/research_os/api/app.py
git commit -m "feat(extract): add recruitment CRUD and bulk status updates"
```

---

### Task 7: Bulk export endpoint (CSV/Excel)

**Files:**
- Create: `src/research_os/extract_bulk/__init__.py`
- Create: `src/research_os/extract_bulk/router.py`
- Create: `src/research_os/extract_bulk/service.py`
- Modify: `src/research_os/api/app.py` (mount router)

- [ ] **Step 1: Create export service**

```python
# Functions:
# export_cohort_csv() -> StreamingResponse  (patients joined with latest RHC/Echo/CMR + recruitment)
# export_cohort_xlsx() -> StreamingResponse  (same data, Excel format via openpyxl)
```

Use `openpyxl` (already in dependencies) for Excel export. CSV via Python stdlib.

- [ ] **Step 2: Create router**

```python
# GET /bulk/export?format=csv
# GET /bulk/export?format=xlsx
```

- [ ] **Step 3: Mount and test**

```bash
curl "http://127.0.0.1:8011/v1/extract/bulk/export?format=csv" -H "Authorization: Bearer <token>" -o export.csv
```

- [ ] **Step 4: Commit**

```bash
git add src/research_os/extract_bulk/ src/research_os/api/app.py
git commit -m "feat(extract): add cohort export (CSV and Excel)"
```

---

## Phase 3: Extraction Service

### Task 8: GPT-4o extraction service

**Files:**
- Create: `src/research_os/extract_extraction/__init__.py`
- Create: `src/research_os/extract_extraction/service.py`
- Create: `src/research_os/extract_extraction/router.py`
- Copy: `C:\Users\Ciaran\AppData\Local\Cardiology Data Extractor\prompts\*.txt` → `src/research_os/extract_extraction/prompts/`
- Modify: `src/research_os/api/app.py` (mount router)

- [ ] **Step 1: Copy prompt files verbatim**

```bash
mkdir -p src/research_os/extract_extraction/prompts
cp "/c/Users/Ciaran/AppData/Local/Cardiology Data Extractor/prompts/cmr_extraction.txt" src/research_os/extract_extraction/prompts/
cp "/c/Users/Ciaran/AppData/Local/Cardiology Data Extractor/prompts/echo_extraction.txt" src/research_os/extract_extraction/prompts/
cp "/c/Users/Ciaran/AppData/Local/Cardiology Data Extractor/prompts/report_extraction.txt" src/research_os/extract_extraction/prompts/
cp "/c/Users/Ciaran/AppData/Local/Cardiology Data Extractor/prompts/email_extraction.txt" src/research_os/extract_extraction/prompts/
cp "/c/Users/Ciaran/AppData/Local/Cardiology Data Extractor/prompts/generic_extraction.txt" src/research_os/extract_extraction/prompts/
```

- [ ] **Step 2: Create service.py**

```python
# Configuration:
# EXTRACT_OPENAI_MODEL from env (default: "gpt-4o")
# EXTRACT_OPENAI_API_KEY from env
#
# Functions:
# extract_from_text(text: str, modality: str, source_type: str | None) -> dict
# extract_from_image(image_base64: str, modality: str, source_type: str | None) -> dict
# extract_from_file(file_bytes: bytes, filename: str, modality: str, source_type: str | None) -> dict
#   - PDF: extract text via PyMuPDF (fitz)
#   - DOCX: extract text via python-docx
#   - Images (PNG/JPG): send as vision API input
#
# Prompt selection:
# modality="rhc" + source_type="email" → email_extraction.txt
# modality="rhc" + source_type="report" → report_extraction.txt
# modality="echo" → echo_extraction.txt
# modality="cmr" → cmr_extraction.txt
# modality="generic" → generic_extraction.txt
#
# OpenAI call:
# Use openai.OpenAI client (already in dependencies)
# System message: prompt file content
# User message: document text or image
# Response: JSON parsed into dict
# Error handling (spec Section 11):
# - OpenAI timeout (>120s): return 504 "Extraction timed out"
# - OpenAI rate limit (429): return 503 with Retry-After header
# - Malformed JSON from model: retry once with same prompt; if still invalid, return 422 with raw output
# - File too large (>20MB): reject with 413 before calling API
# - Unsupported file type: reject with 415 (only PDF, DOCX, PNG, JPG)
# - Token limit exceeded: return 422 suggesting document be split
#
# save_extraction(modality: str, hospital_number: str, create_patient: bool, patient_data: dict, record_data: dict) -> dict
#   - Calls extract_patients.service.find_or_create_patient if create_patient=True
#   - Calls extract_records.service.create_record with record_data
```

- [ ] **Step 3: Create router.py**

```python
# router = APIRouter(prefix="/v1/extract", tags=["extract"])
#
# POST /extraction/extract
#   - Accept multipart (file + modality + source_type) OR JSON (text/image_base64 + modality + source_type)
#   - Returns { modality, source_type, extracted_data }
#
# POST /extraction/save
#   - JSON: { modality, hospital_number, create_patient_if_missing, patient_data, record_data }
#   - Returns created patient + record
```

File upload: Use `fastapi.UploadFile` for multipart. Validate file size (<20MB) and type (PDF, DOCX, PNG, JPG).

- [ ] **Step 4: Mount and test**

```bash
# Test text extraction
curl -X POST http://127.0.0.1:8011/v1/extract/extraction/extract \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"text":"PA systolic 68, diastolic 24, mean 40. PCWP 12. CO 4.2 L/min. PVR 6.7 WU.", "modality":"rhc", "source_type":"report"}'
```

Expected: JSON with extracted haemodynamic values.

- [ ] **Step 5: Commit**

```bash
git add src/research_os/extract_extraction/ src/research_os/api/app.py
git commit -m "feat(extract): add GPT-4o extraction service with all 5 prompts"
```

---

## Phase 4: Frontend Foundation

### Task 9: Frontend auth & routing setup

**Files:**
- Create: `frontend/src/lib/extract-auth.ts`
- Create: `frontend/src/lib/extract-api.ts`
- Modify: `frontend/src/AppRouter.tsx` (add extract routes)
- Create: `frontend/src/pages/extract-login-page.tsx`

**Reference:** Copy patterns exactly from `frontend/src/lib/cmr-auth.ts` and CMR route definitions in `AppRouter.tsx`.

- [ ] **Step 1: Create extract-auth.ts**

```typescript
// Same pattern as cmr-auth.ts
// Session keys: extract_session_token, extract_user_name, extract_is_admin, extract_access_code_id
// Subdomain detection: extract.axiomos.studio, extract.localhost, /extract/* paths
// API base: LOCAL_EXTRACT_DEV_API_BASE = 'http://127.0.0.1:8011'
// Functions: getExtractSessionToken, setExtractSession, clearExtractSession, isExtractSubdomain
// Login/logout: extractLogin, extractLogout, extractCheckSession
// All fetch calls to /v1/extract/auth/* endpoints
```

- [ ] **Step 2: Create extract-api.ts**

```typescript
// API client for all extract endpoints
// Functions:
// fetchPatients(search?, limit?, offset?) → GET /v1/extract/patients
// fetchPatient(hn) → GET /v1/extract/patients/{hn}
// createPatient(data) → POST /v1/extract/patients
// updatePatient(hn, data) → PATCH /v1/extract/patients/{hn}
// fetchRecords(modality, hn?) → GET /v1/extract/records/{modality}
// fetchRecord(modality, id) → GET /v1/extract/records/{modality}/{id}
// createRecord(modality, data) → POST /v1/extract/records/{modality}
// updateRecord(modality, id, data) → PATCH /v1/extract/records/{modality}/{id}
// deleteRecord(modality, id) → DELETE /v1/extract/records/{modality}/{id}
// fetchRecruitment(hn?) → GET /v1/extract/recruitment
// runExtraction(formData | json) → POST /v1/extract/extraction/extract
// saveExtraction(data) → POST /v1/extract/extraction/save
// exportCohort(format) → GET /v1/extract/bulk/export
// fetchStats() → GET /v1/extract/patients/stats
```

- [ ] **Step 3: Create extract-login-page.tsx**

Copy from CMR login page, adapt for extract auth. Same layout, different branding ("Cardiology Data Extractor").

- [ ] **Step 4: Add routes to AppRouter.tsx**

```typescript
// Public
<Route path="/extract-login" element={<ExtractLoginPage />} />

// Protected (RequireExtractSession guard)
<Route element={<RequireExtractSession />}>
  <Route path="/extract-admin" element={<ExtractAdminPage />} />
  <Route path="/extract-cohort" element={<ExtractCohortPage />} />
  <Route path="/extract-new" element={<ExtractExtractionPage />} />
  <Route path="/extract-patient/:hn" element={<ExtractPatientDetailPage />}>
    <Route index element={<ExtractPatientOverview />} />
    <Route path="rhc" element={<ExtractPatientRhc />} />
    <Route path="echo" element={<ExtractPatientEcho />} />
    <Route path="cmr" element={<ExtractPatientCmr />} />
    <Route path="cpex" element={<ExtractPatientCpex />} />
    <Route path="recruitment" element={<ExtractPatientRecruitment />} />
  </Route>
  <Route path="/extract-reference-rhc" element={<ExtractReferenceRhcPage />} />
  <Route path="/extract-reference-echo" element={<ExtractReferenceEchoPage />} />
</Route>
```

Create `RequireExtractSession` guard component (same pattern as `RequireCmrSession`).

- [ ] **Step 5: Verify login flow works**

Start frontend dev server, navigate to `extract.localhost:5173`, should redirect to login. Enter access code, should redirect to cohort page (placeholder).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/extract-auth.ts frontend/src/lib/extract-api.ts frontend/src/pages/extract-login-page.tsx frontend/src/AppRouter.tsx
git commit -m "feat(extract): add frontend auth, routing, and login page"
```

---

### Task 10: Admin page

**Files:**
- Create: `frontend/src/pages/extract-admin-page.tsx`

- [ ] **Step 1: Create admin page**

Copy from CMR admin page. Shows access code management: list codes, create new code, revoke codes. Same layout.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/extract-admin-page.tsx
git commit -m "feat(extract): add admin page for access code management"
```

---

## Phase 5: Frontend PH Cohort & Patient Detail

### Task 11: PH Cohort overview page (main landing)

**Files:**
- Create: `frontend/src/pages/extract-cohort-page.tsx`

- [ ] **Step 1: Build cohort page**

Components:
- **Summary strip**: Total patients, record counts per modality, recruitment funnel. Use MiniProgressRing and MiniBars from Axiomos house-style (`frontend/src/components/publications/PublicationsTopStrip.tsx`).
- **Cohort table**: Using LegacyTablePrimitive pattern. Columns: HN, Name, Cohort, Status, RHC/Echo/CMR/CPEX counts, PA mean, PVR, PCWP. Mini bar charts inline.
- **Search/filter**: Text search on HN/name, filter by cohort/status.
- **Bulk actions**: Multi-select checkboxes, Export CSV/Excel buttons, Bulk status dropdown.
- **Row click**: Navigate to `/extract-patient/{hn}`.

- [ ] **Step 2: Test with real data**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/extract-cohort-page.tsx
git commit -m "feat(extract): add PH cohort overview page with mini charts and bulk ops"
```

---

### Task 12: Patient detail shell + Overview + Recruitment tabs

**Files:**
- Create: `frontend/src/pages/extract-patient-detail-page.tsx`
- Create: `frontend/src/pages/extract-patient-overview.tsx`
- Create: `frontend/src/pages/extract-patient-recruitment.tsx`

- [ ] **Step 1: Create detail page shell with left nav**

```typescript
// Layout: Left sidebar nav + content area (Outlet)
// Nav items: Overview, RHC, Echo, CMR, CPEX, Recruitment
// Each links to /extract-patient/{hn}/{tab}
// Fetch patient data on mount, pass via context
```

- [ ] **Step 2: Create Overview tab**

Demographics card (name, HN, DOB, gender, study ID) with inline editing. Record count summary across modalities.

- [ ] **Step 3: Create Recruitment tab**

Single form per patient. Sections: Eligibility & Cohort, Contact details, Consent tracking, Per-modality tracking (checkboxes for required/requested/scheduled/completed/appropriate per RHC/Echo/CMR/CPEX).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/extract-patient-detail-page.tsx frontend/src/pages/extract-patient-overview.tsx frontend/src/pages/extract-patient-recruitment.tsx
git commit -m "feat(extract): add patient detail shell with overview and recruitment tabs"
```

---

### Task 13: RHC + CPEX patient tabs

**Files:**
- Create: `frontend/src/pages/extract-patient-rhc.tsx`
- Create: `frontend/src/pages/extract-patient-cpex.tsx`

- [ ] **Step 1: Create RHC tab**

Table of RHC records. Key columns: date, PA mean, PVR, PCWP, CO, CI. Click to expand full detail form (all ~30 fields grouped by: RA pressures, RV pressures, PA pressures, PCWP, Aorta, LV, Cardiac function, Comments). Manual entry button opens blank form. Edit button on each record.

- [ ] **Step 2: Create CPEX tab**

Minimal — date, source_file, status. Manual entry form.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/extract-patient-rhc.tsx frontend/src/pages/extract-patient-cpex.tsx
git commit -m "feat(extract): add RHC and CPEX patient tabs"
```

---

### Task 14: Echo + CMR patient tabs

**Files:**
- Create: `frontend/src/pages/extract-patient-echo.tsx`
- Create: `frontend/src/pages/extract-patient-cmr.tsx`

- [ ] **Step 1: Create Echo tab**

Table of Echo records. Key columns: date, LVEF, LV size, RV size/function, RVSP, TAPSE. Full detail form with 57 fields grouped per spec: Demographics/Context, LV, RV, Atria, IVC, Septal/Geometry, PA/PH, Aortic valve, Mitral valve, Tricuspid valve, Pulmonary valve, Conclusions.

- [ ] **Step 2: Create CMR tab**

Table of CMR records. Key columns: date, LVEF, RVEF, LV/RV size, LGE, cmr_class, primary_dx. Full detail form with 151 fields in 14 collapsible sections per spec: Study setup, LV, RV, Atria, Septal/RH physiology, PA/PH, Tissue characterisation, LGE/scar, Perfusion, Aortic valve/aorta, Mitral valve, Tricuspid valve, Pulmonary valve, Pericardium, Thrombus/mass, Congenital, Surgery/device, Classification/conclusions.

Generate CMR form field definitions from `sqlite3 "C:\Users\Ciaran\AppData\Local\Cardiology Data Extractor\research.db" "PRAGMA table_info(cmr)"` — all columns become text inputs grouped into collapsible sections.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/extract-patient-echo.tsx frontend/src/pages/extract-patient-cmr.tsx
git commit -m "feat(extract): add Echo and CMR patient tabs with multi-section forms"
```

---

## Phase 6: Extraction Workflow UI

### Task 15: Extraction page

**Files:**
- Create: `frontend/src/pages/extract-extraction-page.tsx`

- [ ] **Step 1: Build extraction page**

Three-step wizard:

**Step 1 — Input**: Three tabs (Upload file, Paste text, Screenshot). Modality selector (RHC/Echo/CMR/Generic). Source type selector for RHC (Email/Report). Drag-and-drop file area. Max 20MB validation.

**Step 2 — Processing**: Loading spinner while calling `/v1/extract/extraction/extract`. Show model name from response.

**Step 3 — Review**: Polished labelled form with all extracted fields, grouped by domain (same grouping as detail views). Fields pre-filled. User corrects as needed. Two save buttons:
- "Add to PH Cohort" — enter hospital number, auto-match or create patient. Calls `/v1/extract/extraction/save`. Navigates to patient detail.
- "Standalone" — download JSON. No API call.

- [ ] **Step 2: Test full extraction flow**

Upload a PDF from `runtime/word_preview_pdfs/`, verify extraction, review form, save to cohort.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/extract-extraction-page.tsx
git commit -m "feat(extract): add extraction workflow page (upload, review, save)"
```

---

## Phase 7: Reference Tables

### Task 16: Reference tables (RHC, Echo, CMR)

**Files:**
- Create: `frontend/src/pages/extract-reference-rhc-page.tsx`
- Create: `frontend/src/pages/extract-reference-echo-page.tsx`

- [ ] **Step 1: Create RHC reference table**

Follow cmr-app reference table pattern (`cmr-reference-table-page.tsx`). Collapsible sections: RA pressures, RV pressures, PA pressures, PCWP, Cardiac output/index, PVR. Normal ranges from ESC/ERS guidelines. Direction indicators (▲▼).

- [ ] **Step 2: Create Echo reference table**

Same pattern. Sections: LV dimensions/function, RV dimensions/function, Atrial sizes, Valve severity grading, Diastolic function, PH probability criteria. Normal ranges from ASE/EACVI guidelines.

- [ ] **Step 3: Port CMR reference table**

Port or link the existing CMR reference table from cmr-app (`frontend/src/pages/cmr-reference-table-page.tsx`) into the extract app. Use the same `cmr_reference_data.json` data source.

- [ ] **Step 4: Add navigation links**

Add reference table links to the main navigation or as accessible from the cohort/detail pages.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/extract-reference-*.tsx
git commit -m "feat(extract): add RHC, Echo, and CMR reference tables"
```

---

## Phase 8: Data Migration

### Task 17: Migrate existing research.db data to PostgreSQL

**Files:**
- Create: `scripts/migrate_research_db.py`

- [ ] **Step 1: Write migration script**

```python
# Read from: C:\Users\Ciaran\AppData\Local\Cardiology Data Extractor\research.db
# Write to: Axiomos PostgreSQL extract_* tables
#
# Steps:
# 1. Connect to SQLite, read all tables
# 2. For each patient in SQLite patients table → insert into extract_patients
# 3. For each record in rhc/echocardiogram/cmr/cpex → insert into corresponding extract_* table
# 4. For each record in study_recruitment → insert into extract_study_recruitment
# 5. Print counts: X patients, Y RHC, Z echo, etc.
# 6. Verify counts match source
```

- [ ] **Step 2: Run migration**

```bash
cd C:\Users\Ciaran\Documents\GitHub\research-os-api
python scripts/migrate_research_db.py
```

- [ ] **Step 3: Verify data integrity**

Compare row counts between SQLite and PostgreSQL. Spot-check a few patients with all their records.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate_research_db.py
git commit -m "feat(extract): add data migration script from SQLite to PostgreSQL"
```

---

## Phase 9: Polish & Integration Testing

### Task 18: Backend automated tests

**Files:**
- Create: `tests/test_extract_auth.py`
- Create: `tests/test_extract_patients.py`
- Create: `tests/test_extract_records.py`
- Create: `tests/test_extract_extraction.py`

- [ ] **Step 1: Create test_extract_auth.py**

```python
# Test: admin login with correct/incorrect password
# Test: create access code, user login with code
# Test: session validation (valid token, expired token, invalid token)
# Test: admin-only endpoints reject non-admin sessions
# Use create_all_tables() and session_scope() directly (no conftest needed, matching existing pattern)
```

- [ ] **Step 2: Create test_extract_patients.py**

```python
# Test: create patient, list patients, get patient by HN
# Test: update patient fields
# Test: find_or_create_patient (existing patient returns it, new HN creates new)
# Test: duplicate HN rejected
# Test: search by name/HN
```

- [ ] **Step 3: Create test_extract_records.py**

```python
# Test: create RHC record for a patient, list records, get by ID
# Test: update record fields
# Test: delete record
# Test: records linked to correct patient by HN
# Repeat for Echo, CMR, CPEX
```

- [ ] **Step 4: Create test_extract_extraction.py**

```python
# Test: prompt file selection based on modality + source_type
# Test: file type validation (reject unsupported types)
# Test: file size validation (reject >20MB)
# Test: extraction with mock OpenAI response (patch openai.OpenAI.chat.completions.create)
# Test: save extraction creates patient + record
```

- [ ] **Step 5: Run all tests**

```bash
cd C:\Users\Ciaran\Documents\GitHub\research-os-api
pytest tests/test_extract_*.py -v
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add tests/test_extract_*.py
git commit -m "test(extract): add backend tests for auth, patients, records, extraction"
```

---

### Task 19: End-to-end smoke test

- [ ] **Step 1: Start backend and frontend**

```bash
# Terminal 1: Backend
cd C:\Users\Ciaran\Documents\GitHub\research-os-api
python -m uvicorn --app-dir src research_os.api.app:app --reload --port 8011

# Terminal 2: Frontend
cd C:\Users\Ciaran\Documents\GitHub\research-os-api\frontend
npm run dev
```

- [ ] **Step 2: Test full flow**

1. Navigate to `extract.localhost:5173` → redirected to login
2. Login with access code → redirected to PH cohort
3. Verify cohort table shows migrated data
4. Click a patient → verify left nav, all tabs load with data
5. Go to Extract → upload a PDF → review form → save to cohort
6. Verify new record appears on patient detail
7. Test bulk export (CSV download)
8. Test admin page (create/revoke access codes)

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(extract): integration testing fixes and polish"
```
