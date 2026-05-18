"""Tests for CMR access control."""

import json
import os
import sqlite3
from types import SimpleNamespace
import bcrypt
import pytest
from fastapi.testclient import TestClient


def _set_cmr_test_env(monkeypatch, tmp_path):
    """Isolate CMR tests with a fresh database."""
    import research_os.api.app as api_module

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = tmp_path / "cmr_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("DATA_LIBRARY_ROOT", str((tmp_path / "dl").resolve()))
    monkeypatch.setenv("CMR_ADMIN_PASSWORD", "test-admin-pass")
    api_module._AUTH_RATE_LIMIT_EVENTS.clear()

    from research_os.db import reset_database_state
    reset_database_state()

    import research_os.cmr_auth.service as cmr_service
    cmr_service._admin_seeded = False


@pytest.fixture()
def cmr_client(monkeypatch, tmp_path):
    _set_cmr_test_env(monkeypatch, tmp_path)
    from research_os.api.app import app
    with TestClient(app) as client:
        yield client


# --- Admin login ---

def test_admin_login_success(cmr_client):
    resp = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Admin"
    assert data["is_admin"] is True
    assert data["access_code_id"] == "admin"
    assert "session_token" in data


def test_admin_login_wrong_password(cmr_client):
    resp = cmr_client.post("/v1/cmr/admin/login", json={"password": "wrong"})
    assert resp.status_code == 401


# --- Admin CRUD ---

def test_admin_create_and_list_codes(cmr_client):
    login = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    token = login.json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Dr. Smith", "code": "smith-secret-123"},
        headers=headers,
    )
    assert resp.status_code == 201
    code_id = resp.json()["id"]

    resp = cmr_client.get("/v1/cmr/admin/codes", headers=headers)
    assert resp.status_code == 200
    codes = resp.json()
    names = [c["name"] for c in codes]
    assert "Dr. Smith" in names
    for c in codes:
        assert "code" not in c
        assert "code_hash" not in c


def test_admin_revoke_code(cmr_client):
    login = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    token = login.json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Temp User", "code": "temp-123"},
        headers=headers,
    )
    code_id = resp.json()["id"]

    resp = cmr_client.delete(f"/v1/cmr/admin/codes/{code_id}", headers=headers)
    assert resp.status_code == 204

    codes = cmr_client.get("/v1/cmr/admin/codes", headers=headers).json()
    revoked = [c for c in codes if c["id"] == code_id]
    assert revoked[0]["is_active"] is False


def test_admin_cannot_revoke_admin_row(cmr_client):
    login = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    token = login.json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = cmr_client.delete("/v1/cmr/admin/codes/admin", headers=headers)
    assert resp.status_code == 400


# --- User login ---

def test_user_login_success(cmr_client):
    login = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    headers = {"Authorization": f"Bearer {login.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Dr. Jones", "code": "jones-code"},
        headers=headers,
    )

    resp = cmr_client.post("/v1/cmr/auth/login", json={"code": "jones-code"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Dr. Jones"
    assert data["is_admin"] is False
    assert isinstance(data["access_code_id"], str)
    assert data["access_code_id"]
    assert "session_token" in data


def test_user_login_invalid_code(cmr_client):
    resp = cmr_client.post("/v1/cmr/auth/login", json={"code": "nonexistent"})
    assert resp.status_code == 401


def test_user_login_revoked_code(cmr_client):
    login = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    headers = {"Authorization": f"Bearer {login.json()['session_token']}"}
    resp = cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Revoked", "code": "revoked-code"},
        headers=headers,
    )
    code_id = resp.json()["id"]
    cmr_client.delete(f"/v1/cmr/admin/codes/{code_id}", headers=headers)

    resp = cmr_client.post("/v1/cmr/auth/login", json={"code": "revoked-code"})
    assert resp.status_code == 401


# --- /me endpoint ---

def test_me_valid_session(cmr_client):
    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Dr. Patel", "code": "patel-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "patel-code"})
    user_token = user_login.json()["session_token"]

    resp = cmr_client.get(
        "/v1/cmr/auth/me",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Dr. Patel"
    assert resp.json()["is_admin"] is False
    assert isinstance(resp.json()["access_code_id"], str)


def test_me_invalid_token(cmr_client):
    resp = cmr_client.get(
        "/v1/cmr/auth/me",
        headers={"Authorization": "Bearer invalid-token"},
    )
    assert resp.status_code == 401


def test_me_revoked_code_invalidates_session(cmr_client):
    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    resp = cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Soon Revoked", "code": "soon-revoked"},
        headers=admin_headers,
    )
    code_id = resp.json()["id"]
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "soon-revoked"})
    user_token = user_login.json()["session_token"]

    cmr_client.delete(f"/v1/cmr/admin/codes/{code_id}", headers=admin_headers)

    resp = cmr_client.get(
        "/v1/cmr/auth/me",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert resp.status_code == 401


# --- Logout ---

def test_logout(cmr_client):
    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Logout Test", "code": "logout-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "logout-code"})
    user_token = user_login.json()["session_token"]
    user_headers = {"Authorization": f"Bearer {user_token}"}

    resp = cmr_client.post("/v1/cmr/auth/logout", headers=user_headers)
    assert resp.status_code == 204

    resp = cmr_client.get("/v1/cmr/auth/me", headers=user_headers)
    assert resp.status_code == 401


# --- Admin endpoints require admin session ---

def test_admin_endpoints_reject_user_session(cmr_client):
    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Regular User", "code": "regular-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "regular-code"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    assert cmr_client.get("/v1/cmr/admin/codes", headers=user_headers).status_code == 403
    assert cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "X", "code": "x"},
        headers=user_headers,
    ).status_code == 403


def test_case_open_payload_roundtrip_and_summary_sections(cmr_client):
    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Case User", "code": "case-user-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "case-user-code"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    created = cmr_client.post("/v1/cmr/cases", json={"title": "First report"}, headers=user_headers)
    assert created.status_code == 201
    case_id = created.json()["id"]

    payload = {
        "schemaVersion": 1,
        "reportInput": {
            "reportText": "Example uploaded report",
            "reportType": "standard",
            "fourDFlow": False,
            "nonContrast": False,
            "fileName": "report.txt",
        },
        "extractionResult": {
            "demographics": {"study_date": "2026-03-26"},
            "measurements": [{"parameter": "LV EF", "value": 55}],
        },
        "previousStudies": [{"id": "prev-1", "source": "cmr", "label": "Prior"}],
        "rwma": {
            "segStates": {"1": 2},
            "activeBrush": 2,
        },
        "perfusion": {
            "stressSegStates": {"3": 1},
            "restSegStates": {"3": 0},
            "stressPersistenceBeats": 8,
            "restPersistenceBeats": 0,
            "llmProse": "Inducible perfusion defect.",
        },
        "ph": {
            "manualNumeric": {"mpaDiameter": "34"},
            "choices": {"septalFlattening": "present"},
            "texts": {"additionalDetails": "Raised PA size"},
        },
        "thrombus": {
            "entries": [
                {
                    "id": "thr-1",
                    "primary": "lv",
                    "sublocation": "apex",
                    "otherLocation": "",
                    "morphology": {
                        "maxDiameter": 12,
                        "shape": "round",
                        "mobility": None,
                        "attachment": None,
                        "surface": None,
                    },
                    "confidence": "high",
                }
            ],
            "activeEntryId": "thr-1",
        },
    }

    updated = cmr_client.patch(
        f"/v1/cmr/cases/{case_id}",
        json={
            "report_tag": "Stress testing",
            "last_completed_step": "perfusion",
            "payload": payload,
        },
        headers=user_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["report_tag"] == "Stress testing"
    assert updated.json()["last_completed_step"] == "perfusion"
    assert updated.json()["payload"]["reportInput"]["reportText"] == "Example uploaded report"

    loaded = cmr_client.get(f"/v1/cmr/cases/{case_id}", headers=user_headers)
    assert loaded.status_code == 200
    assert loaded.json()["report_tag"] == "Stress testing"
    assert loaded.json()["payload"]["perfusion"]["stressPersistenceBeats"] == 8
    assert loaded.json()["payload"]["thrombus"]["activeEntryId"] == "thr-1"

    listed = cmr_client.get("/v1/cmr/cases", headers=user_headers)
    assert listed.status_code == 200
    assert listed.json()["items"][0]["report_tag"] == "Stress testing"
    sections = listed.json()["items"][0]["content_sections"]
    assert sections == [
        "upload",
        "metrics",
        "previous-studies",
        "rwma",
        "perfusion",
        "thrombus",
        "ph",
    ]


def test_delete_case_removes_report(cmr_client):
    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Delete User", "code": "delete-user-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "delete-user-code"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    created = cmr_client.post("/v1/cmr/cases", json={"title": "Delete me"}, headers=user_headers)
    assert created.status_code == 201
    case_id = created.json()["id"]

    deleted = cmr_client.delete(f"/v1/cmr/cases/{case_id}", headers=user_headers)
    assert deleted.status_code == 204

    listed = cmr_client.get("/v1/cmr/cases", headers=user_headers)
    assert listed.status_code == 200
    assert listed.json()["items"] == []

    loaded = cmr_client.get(f"/v1/cmr/cases/{case_id}", headers=user_headers)
    assert loaded.status_code == 404


def test_legacy_sqlite_cmr_cases_schema_is_migrated(monkeypatch, tmp_path):
    _set_cmr_test_env(monkeypatch, tmp_path)
    db_path = tmp_path / "cmr_test.db"

    connection = sqlite3.connect(db_path)
    cursor = connection.cursor()
    cursor.executescript(
        """
        CREATE TABLE cmr_access_codes (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            code_hash TEXT,
            created_at DATETIME NOT NULL,
            last_accessed_at DATETIME,
            session_count INTEGER NOT NULL,
            is_active BOOLEAN NOT NULL
        );
        CREATE TABLE cmr_cases (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            owner_user_id VARCHAR(36) NOT NULL,
            label VARCHAR(255) NOT NULL,
            scan_date DATE,
            protocol VARCHAR(32) NOT NULL,
            patient_age FLOAT,
            patient_sex VARCHAR(8),
            patient_bsa FLOAT,
            height_cm FLOAT,
            weight_kg FLOAT,
            contrast_administered BOOLEAN NOT NULL,
            indexing_mode VARCHAR(32) NOT NULL,
            notes TEXT NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        );
        CREATE INDEX ix_cmr_cases_owner_user_id ON cmr_cases (owner_user_id);
        """
    )
    cursor.execute(
        """
        INSERT INTO cmr_access_codes (
            id, name, code_hash, created_at, last_accessed_at, session_count, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "legacy-user",
            "Legacy User",
            bcrypt.hashpw(b"legacy-code", bcrypt.gensalt()).decode(),
            "2026-03-26T10:00:00+00:00",
            "2026-03-26T12:00:00+00:00",
            1,
            1,
        ),
    )
    cursor.execute(
        """
        INSERT INTO cmr_cases (
            id, owner_user_id, label, scan_date, protocol, patient_age, patient_sex,
            patient_bsa, height_cm, weight_kg, contrast_administered, indexing_mode,
            notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "legacy-case-1",
            "old-owner",
            "Migrated legacy report",
            "2026-03-01",
            "standard",
            52,
            "F",
            1.7,
            168,
            68,
            1,
            "indexed",
            "Legacy notes",
            "2026-03-26T10:30:00+00:00",
            "2026-03-26T11:30:00+00:00",
        ),
    )
    connection.commit()
    connection.close()

    from research_os.api.app import app

    with TestClient(app) as client:
        login = client.post("/v1/cmr/auth/login", json={"code": "legacy-code"})
        assert login.status_code == 200
        user_headers = {"Authorization": f"Bearer {login.json()['session_token']}"}

        listed = client.get("/v1/cmr/cases", headers=user_headers)
        assert listed.status_code == 200
        items = listed.json()["items"]
        assert len(items) == 1
        assert items[0]["id"] == "legacy-case-1"
        assert items[0]["title"] == "Migrated legacy report"
        assert items[0]["patient_label"] == "Migrated legacy report"
        assert items[0]["study_date"] == "2026-03-01"

        loaded = client.get("/v1/cmr/cases/legacy-case-1", headers=user_headers)
        assert loaded.status_code == 200
        assert loaded.json()["payload"]["reportInput"]["reportText"] == ""


def _sample_lge_summary_payload() -> dict:
    return {
        "deterministicText": (
            "There is focal subendocardial enhancement of the basal anterior wall "
            "(26-50% transmurality). LGE score index 0.29 (2 of 17 segments enhanced)."
        ),
        "segments": [
            {
                "name": "basal anterior",
                "pattern": 1,
                "transmurality": 2,
                "territory": "LAD",
                "wall": "anterior",
                "level": "basal",
            }
        ],
        "territories": {
            "LAD": {
                "segments": ["basal anterior"],
                "patterns": [1],
                "transRange": [2, 2],
            }
        },
        "territoryCount": 1,
        "isDiffuse": False,
        "nonIschaemicSegments": [],
        "unspecifiedSegments": [],
        "viability": {
            "viable": ["basal anterior"],
            "nonViable": [],
        },
        "ischaemicCount": 1,
        "scoreIndex": 0.29,
        "enhancedCount": 2,
    }


def _sample_rwma_summary_payload() -> dict:
    return {
        "deterministicText": (
            "Regional wall motion abnormality: hypokinesis of the basal and mid "
            "inferior wall. Distribution suggests RCA territory involvement. "
            "Wall motion score index 1.18 (mild)."
        ),
        "wmsi": 1.18,
        "severity": "mild",
        "hasAbnormality": True,
        "territories": ["RCA"],
        "abnormalCount": 2,
        "stateCounts": {
            "hypokinesis": 2,
            "akinesis": 0,
            "dyskinesis": 0,
        },
        "abnormalSegments": [
            {
                "segment": 4,
                "state": 1,
                "stateLabel": "Hypokinesis",
                "territory": "RCA",
                "wall": "inferior",
                "level": "basal",
            },
            {
                "segment": 10,
                "state": 1,
                "stateLabel": "Hypokinesis",
                "territory": "RCA",
                "wall": "inferior",
                "level": "mid",
            },
        ],
    }


def _sample_perfusion_summary_payload() -> dict:
    return {
        "deterministicText": (
            "Stress perfusion: Adequate vasodilator stress. Inducible "
            "subendocardial perfusion defect involving 2 segments in the "
            "inferior wall (RCA), without corresponding infarct-pattern LGE, "
            "consistent with ischaemia in viable myocardium."
        ),
        "impression": "inducible",
        "adequateStress": True,
        "rest": {
            "abnormalCount": 0,
            "subendocardialCount": 0,
            "transmuralCount": 0,
            "persistenceBeats": 0,
            "territories": [],
            "segmentDescription": None,
            "segments": [],
        },
        "stress": {
            "abnormalCount": 2,
            "subendocardialCount": 2,
            "transmuralCount": 0,
            "persistenceBeats": 8,
            "territories": ["RCA"],
            "segmentDescription": "basal and mid inferior wall",
            "segments": [
                {
                    "seg": 4,
                    "name": "basal inferior",
                    "extent": 1,
                    "territory": "RCA",
                    "wall": "inferior",
                    "level": "basal",
                },
                {
                    "seg": 10,
                    "name": "mid inferior",
                    "extent": 1,
                    "territory": "RCA",
                    "wall": "inferior",
                    "level": "mid",
                },
            ],
        },
        "stressOnlyCount": 2,
        "fixedCount": 0,
        "restOnlyCount": 0,
        "stressOnlySegmentDescription": "basal and mid inferior wall",
        "fixedSegmentDescription": None,
        "restOnlySegmentDescription": None,
        "lge": {
            "hasAnyLge": False,
            "hasInfarctPatternLge": False,
            "infarctPatternCount": 0,
            "infarctTerritories": [],
            "hasAnyOverlapLge": False,
            "overlapAnyLgeCount": 0,
            "overlapNonInfarctCount": 0,
            "matchedWithinLgeCount": 0,
            "exceedsBySegmentCount": 2,
            "exceedsByThicknessCount": 0,
            "stressBeyondInfarctCount": 2,
            "lgeElsewhere": False,
            "indeterminateRelation": False,
            "matchedStressSegmentDescription": None,
            "stressBeyondInfarctSegmentDescription": "basal and mid inferior wall",
        },
    }


def _sample_mitral_valve_summary_payload() -> dict:
    return {
        "deterministicText": (
            "Severe mitral regurgitation due to flail posterior leaflet with "
            "chordal rupture (RF 52%, MR volume 71 mL)."
        ),
        "severity": "severe",
        "severityLabel": "Severe",
        "regurgitantFraction": 52.0,
        "regurgitantVolume": 71.0,
        "primaryMechanism": "degenerative",
        "primaryMechanismLabel": "Degenerative",
        "descriptors": ["flail posterior leaflet", "chordal rupture"],
        "findingKeys": ["chordalRupture", "prolapse"],
        "lvef": 61.0,
        "lvedvi": 108.0,
        "laMaxVolumeIndex": 58.0,
    }


def _sample_ph_summary_payload() -> dict:
    return {
        "deterministicText": (
            "Severe pulmonary hypertension physiology with RV-pulmonary arterial uncoupling. "
            "Supported by severely impaired RV systolic function (RVEF 31 %), "
            "markedly reduced TAPSE (TAPSE 9 mm), and severely dilated right ventricle (RV EDVi 148 mL/m2)."
        ),
        "probability": "high",
        "probabilityLabel": "High probability",
        "severity": "severe",
        "severityLabel": "Severe",
        "phenotype": "rv-pa-uncoupling",
        "phenotypeLabel": "RV-PA uncoupling physiology",
        "domainScores": {
            "rvRemodelling": 7,
            "rvMaladaptation": 8,
            "pressureOverload": 4,
            "pulmonaryVascular": 5,
            "leftHeart": 0,
        },
        "keyFindings": [
            "severely dilated right ventricle (RV EDVi 148 mL/m2)",
            "severely impaired RV systolic function (RVEF 31 %)",
            "markedly reduced TAPSE (TAPSE 9 mm)",
            "systolic and diastolic septal flattening",
            "dilated vena cava",
            "reduced pulmonary artery distensibility (PA distensibility 8 %)",
        ],
        "leftHeartFindings": [],
        "contextualFindings": ["branch pulmonary flow split of RPA 70% and LPA 30%"],
        "rvRemodellingFindings": [
            "severely dilated right ventricle (RV EDVi 148 mL/m2)",
            "moderately increased RV mass index (RV mass index 28 g/m2)",
            "mildly enlarged right atrium",
        ],
        "rvMaladaptationFindings": [
            "severely impaired RV systolic function (RVEF 31 %)",
            "markedly reduced TAPSE (TAPSE 9 mm)",
            "moderate tricuspid regurgitation",
        ],
        "pressureOverloadFindings": [
            "systolic and diastolic septal flattening",
            "paradoxical septal motion",
            "dilated vena cava",
        ],
        "pulmonaryVascularFindings": [
            "marked 4D-flow vortex formation",
            "reduced pulmonary artery distensibility (PA distensibility 8 %)",
            "moderately dilated main pulmonary artery (MPA 35 mm)",
        ],
        "rvSize": "severely dilated right ventricle (RV EDVi 148 mL/m2)",
        "rvFunction": "severely impaired RV systolic function (RVEF 31 %)",
        "tapse": "markedly reduced TAPSE (TAPSE 9 mm)",
        "rvMassIndex": "moderately increased RV mass index (RV mass index 28 g/m2)",
        "rvStrokeVolumeIndex": None,
        "rvCardiacIndex": None,
        "rvLvRatio": None,
        "raSize": "mildly enlarged right atrium",
        "laSize": None,
        "lvFunction": None,
        "mainPa": "moderately dilated main pulmonary artery (MPA 35 mm)",
        "paDistensibility": "reduced pulmonary artery distensibility (PA distensibility 8 %)",
        "estimatedPcwp": None,
        "estimatedRap": None,
        "septalFlattening": "both",
        "septalMotion": "paradoxical",
        "interatrialSeptalBowing": "toward-la",
        "pericardialEffusion": "small",
        "pericardialEffusionSize": 6.0,
        "venaCava": "dilated",
        "trSeverity": "moderate",
        "trSeverityLabel": "Moderate",
        "mrSeverity": None,
        "mrSeverityLabel": None,
        "vortexFormation": "present",
        "vortexSeverity": "marked",
        "helicity": "present",
        "helicitySeverity": "moderate",
        "rpaPercent": 70.0,
        "lpaPercent": 30.0,
    }


def _sample_aortic_valve_summary_payload() -> dict:
    return {
        "deterministicText": (
            "Severe aortic stenosis with severe diffuse cusp calcification "
            "(peak velocity 4.3 m/s; mean gradient 48 mmHg)."
        ),
        "phenotype": "stenosis",
        "phenotypeLabel": "Aortic stenosis",
        "regurgitationSeverity": None,
        "regurgitationSeverityLabel": None,
        "regurgitantFraction": None,
        "regurgitantVolume": None,
        "stenosisSeverity": "severe",
        "stenosisSeverityLabel": "Severe",
        "peakVelocity": 4.3,
        "meanGradient": 48.0,
        "peakGradient": 74.0,
        "primaryMechanism": "calcific-degenerative",
        "primaryMechanismLabel": "Calcific / degenerative",
        "descriptors": ["severe diffuse cusp calcification"],
        "findingKeys": ["calcified"],
    }


def _sample_tricuspid_valve_summary_payload() -> dict:
    return {
        "deterministicText": (
            "Moderate tricuspid regurgitation due to pacemaker lead impingement "
            "(RF 28%, TR volume 34 mL)."
        ),
        "severity": "moderate",
        "severityLabel": "Moderate",
        "regurgitantFraction": 28.0,
        "regurgitantVolume": 34.0,
        "primaryMechanism": "device-related",
        "primaryMechanismLabel": "Device-related",
        "descriptors": ["pacemaker lead impingement"],
        "findingKeys": ["pacemakerLead"],
        "rvef": 49.0,
        "rvedvi": 96.0,
        "raMaxVolumeIndex": 49.0,
    }


def _sample_thrombus_summary_payload() -> dict:
    return {
        "deterministicText": (
            "Definite left ventricular apex thrombus (12 mm), mural and fixed, "
            "without internal enhancement on post-contrast imaging."
        ),
        "hasThrombus": True,
        "thrombusCount": 1,
        "locations": ["left ventricular apex"],
        "confidenceLabels": ["definite"],
        "entries": [
            {
                "location": "left ventricular apex",
                "confidence": "definite",
                "maxDiameter": 12.0,
                "descriptors": ["mural", "fixed"],
                "postContrast": "non-enhancing-supportive",
                "postContrastLabel": "Non-enhancing lesion, supportive of thrombus",
            }
        ],
    }


def _sample_report_conclusions_payload() -> dict:
    return {
        "reportType": "stress",
        "deterministicLines": [
            "Preserved LV systolic function (LVEF 63%) with a non-dilated LV and normal wall thickness, with regional dysfunction in the RCA territory.",
            "Preserved RV systolic function (RVEF 58%) with a non-dilated RV.",
            "Matched scar without inducible ischaemia. Prior infarction in the RCA territory, predominantly non-viable.",
        ],
    }


def _sample_case_lessons_payload() -> dict:
    return {
        "mode": "case-discussion",
        "deterministicText": (
            "Why this case is instructive:\n"
            "The key interpretive step is deciding whether the perfusion abnormality matches infarct-pattern scar "
            "or extends beyond it, because that is what separates scar alone from residual inducible ischaemia in viable myocardium.\n\n"
            "Acquisition and confidence:\n"
            "This is a contrast-enhanced stress CMR study, so cine function, LGE, and stress perfusion can be interpreted together rather than in isolation. "
            "Stress adequacy was established, so a negative or positive perfusion result carries more interpretive weight than it would in a submaximal study.\n\n"
            "CMR learning point:\n"
            "In ischaemic cases, mapping can add supportive context, but transmural LGE and the perfusion-scar relationship usually remain the decisive CMR teaching points."
        ),
        "reportType": "stress",
        "protocolHighlights": [
            "This is a contrast-enhanced stress CMR study, so cine function, LGE, and stress perfusion can be interpreted together rather than in isolation."
        ],
        "confidenceHighlights": [
            "Stress adequacy was established, so a negative or positive perfusion result carries more interpretive weight than it would in a submaximal study.",
            "Confidence is strengthened because perfusion and infarct-pattern LGE can be matched territory-by-territory rather than inferred from one sequence alone.",
        ],
        "interpretiveHighlights": [
            "The key interpretive step is deciding whether the perfusion abnormality matches infarct-pattern scar or extends beyond it, because that is what separates scar alone from residual inducible ischaemia in viable myocardium."
        ],
        "advancedLearningHighlights": [
            "In ischaemic cases, mapping can add supportive context, but transmural LGE and the perfusion-scar relationship usually remain the decisive CMR teaching points."
        ],
        "reportingPearls": [
            "In the report, state explicitly whether the perfusion defect is confined to scar or extends beyond it, because that relationship is what makes the conclusion clinically useful."
        ],
        "teachingThemes": [
            "stress perfusion and viability",
            "perfusion-scar correlation",
            "ischaemic CMR reasoning",
        ],
        "notableMeasurements": ["LVEF 38 %", "Native T1 1062 ms", "ECV 31 %"],
        "sectionSummaries": {
            "lv": "Moderate LV systolic impairment with regional dysfunction in the LCx territory.",
            "rv": "Preserved RV systolic function with a non-dilated RV.",
            "tissue": "Regional subendocardial enhancement in the LCx territory with 26-50% transmurality, consistent with viable myocardium.",
            "perfusion": "Adequate vasodilator stress. Stress perfusion defect exceeds infarct-pattern LGE, consistent with inducible ischaemia in adjacent viable myocardium.",
            "valves": None,
            "ph": None,
            "thrombus": None,
        },
        "conclusionLines": [
            "Moderate LV systolic impairment (LVEF 38%) with regional dysfunction in the LCx territory.",
            "Perfusion defects extend beyond infarct-pattern scar, consistent with peri-infarct ischaemia in adjacent viable myocardium. Prior LCx infarction with 26-50% transmural scar and preserved viability.",
        ],
    }


def _sample_case_question_payload() -> dict:
    return {
        "reportType": "stress",
        "question": "Why does this still count as viable myocardium?",
        "conversation": [
            {
                "role": "user",
                "content": "What is the main teaching point in this case?",
            },
            {
                "role": "assistant",
                "content": "The main teaching point is the perfusion-scar relationship.",
            },
        ],
        "reportOutputText": (
            "Left ventricle:\n"
            "Moderate LV systolic impairment with regional dysfunction in the LCx territory.\n\n"
            "Tissue characterisation:\n"
            "Regional subendocardial enhancement in the LCx territory with 26-50% transmurality, consistent with viable myocardium.\n\n"
            "Stress perfusion:\n"
            "Adequate vasodilator stress. Stress perfusion defect exceeds infarct-pattern LGE, consistent with inducible ischaemia in adjacent viable myocardium.\n\n"
            "Conclusions:\n"
            "1. Moderate LV systolic impairment (LVEF 38%) with regional dysfunction in the LCx territory.\n"
            "2. Perfusion defects extend beyond infarct-pattern scar, consistent with peri-infarct ischaemia in adjacent viable myocardium. Prior LCx infarction with 26-50% transmural scar and preserved viability."
        ),
        "sectionSummaries": {
            "lv": "Moderate LV systolic impairment with regional dysfunction in the LCx territory.",
            "rv": "Preserved RV systolic function with a non-dilated RV.",
            "tissue": "Regional subendocardial enhancement in the LCx territory with 26-50% transmurality, consistent with viable myocardium.",
            "perfusion": "Adequate vasodilator stress. Stress perfusion defect exceeds infarct-pattern LGE, consistent with inducible ischaemia in adjacent viable myocardium.",
            "valves": None,
            "ph": None,
            "thrombus": None,
        },
        "conclusionLines": [
            "Moderate LV systolic impairment (LVEF 38%) with regional dysfunction in the LCx territory.",
            "Perfusion defects extend beyond infarct-pattern scar, consistent with peri-infarct ischaemia in adjacent viable myocardium. Prior LCx infarction with 26-50% transmural scar and preserved viability.",
        ],
        "notableMeasurements": ["LVEF 38 %", "Native T1 1062 ms", "ECV 31 %"],
    }


def _sample_expert_chat_payload() -> dict:
    return {
        "scope": "case",
        "currentPage": "Report output",
        "question": "Why is this matched scar rather than residual inducible ischaemia?",
        "conversation": [
            {
                "role": "user",
                "content": "What is the main message of this case?",
            },
            {
                "role": "assistant",
                "content": "The main message is the relationship between stress perfusion and infarct-pattern scar.",
            },
        ],
        "caseId": "case-123",
        "caseTitle": "Example case",
        "reportType": "stress",
        "sourceReportText": "Example uploaded report text.",
        "reportOutputText": (
            "Conclusions:\n"
            "1. Severe LV systolic impairment with LAD territory scar.\n"
            "2. No inducible ischaemia beyond scar."
        ),
        "sectionSummaries": {
            "lv": None,
            "rv": None,
            "tissue": "Extensive LAD infarction with dense transmural scar and no meaningful viability.",
            "perfusion": "Adequate stress. Perfusion abnormality is confined to infarct-pattern LGE, without extension beyond scar.",
            "valves": "Moderate mitral regurgitation.",
            "ph": None,
            "thrombus": None,
        },
        "conclusionLines": [
            "Severe LV systolic impairment with regional LAD territory dysfunction.",
            "No inducible ischaemia beyond scar. Prior LAD infarction with no meaningful viability.",
        ],
        "notableMeasurements": ["LVEF 24 %", "MAPSE 6 mm"],
    }


def _sample_report_selection_refinement_payload() -> dict:
    return {
        "reportType": "standard",
        "instruction": (
            "Tighten this so it sounds more natural, and make it clearer that the longitudinal impairment is discordant rather than contradictory."
        ),
        "selectedText": (
            "The RV is not dilated, with preserved global systolic function (RVEF 56%) and markedly reduced longitudinal function (TAPSE 12 mm)."
        ),
        "selectionContextBefore": "Right ventricle:",
        "selectionContextAfter": "Atria:\nThe atria are normal in size.",
        "conversation": [
            {
                "role": "user",
                "content": "Can you make this less clunky?",
            },
            {
                "role": "assistant",
                "content": "I would keep the discordance explicit.",
                "replacementText": (
                    "The RV is not dilated. Global systolic function is preserved (RVEF 56%), while longitudinal shortening is markedly reduced (TAPSE 12 mm)."
                ),
            },
        ],
        "reportOutputText": (
            "Right ventricle:\n"
            "The RV is not dilated, with preserved global systolic function (RVEF 56%) and markedly reduced longitudinal function (TAPSE 12 mm).\n\n"
            "Atria:\n"
            "The atria are normal in size."
        ),
        "sectionSummaries": {
            "lv": "Preserved LV systolic function.",
            "rv": "The RV is not dilated, with preserved global systolic function (RVEF 56%) and markedly reduced longitudinal function (TAPSE 12 mm).",
            "tissue": None,
            "perfusion": None,
            "valves": None,
            "ph": None,
            "thrombus": None,
        },
        "conclusionLines": [
            "Preserved LV systolic function (LVEF 61%) with normal size and normal wall thickness.",
            "Preserved RV systolic function (RVEF 56%) with a non-dilated RV.",
        ],
        "notableMeasurements": ["RVEF 56%", "TAPSE 12 mm"],
    }


def test_report_extraction_requires_session(cmr_client):
    response = cmr_client.post(
        "/v1/cmr/report-extraction",
        json={"reportText": "Example uploaded report"},
    )
    assert response.status_code == 401


def test_report_extraction_with_user_session(cmr_client, monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                '{"demographics":{"sex":"Male","age":52,"height_cm":178,"weight_kg":82,'
                '"bsa":2.01,"heart_rate":68,"study_date":"2026-04-11"},'
                '"measurements":[{"parameter":"LV EF","value":55},{"parameter":"RV EF","value":48}]}'
            )
        ),
    )

    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Extraction User", "code": "extract-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "extract-code"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    response = cmr_client.post(
        "/v1/cmr/report-extraction",
        json={"reportText": "Example uploaded report"},
        headers=user_headers,
    )
    assert response.status_code == 200
    assert response.json() == {
        "demographics": {
            "sex": "Male",
            "age": 52,
            "height_cm": 178,
            "weight_kg": 82,
            "bsa": 2.01,
            "heart_rate": 68,
            "study_date": "2026-04-11",
        },
        "measurements": [
            {"parameter": "LV EF", "value": 55},
            {"parameter": "RV EF", "value": 48},
        ],
    }


def test_report_extraction_accepts_local_dev_token_on_localhost(
    monkeypatch, tmp_path
):
    _set_cmr_test_env(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                '{"demographics":{"sex":"Female","age":47,"height_cm":165,"weight_kg":63,'
                '"bsa":1.69,"heart_rate":72,"study_date":"2026-04-10"},'
                '"measurements":[{"parameter":"LV EDVi","value":71}]}'
            )
        ),
    )

    from research_os.api.app import app

    with TestClient(app, base_url="http://localhost") as client:
        response = client.post(
            "/v1/cmr/report-extraction",
            json={"reportText": "Example uploaded report"},
            headers={"Authorization": "Bearer cmr-local-dev-test-token"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "demographics": {
            "sex": "Female",
            "age": 47,
            "height_cm": 165,
            "weight_kg": 63,
            "bsa": 1.69,
            "heart_rate": 72,
            "study_date": "2026-04-10",
        },
        "measurements": [
            {"parameter": "LV EDVi", "value": 71},
        ],
    }


def test_generate_lge_prose_requires_session(cmr_client):
    response = cmr_client.post(
        "/v1/cmr/summaries/lge/prose",
        json=_sample_lge_summary_payload(),
    )
    assert response.status_code == 401


def test_generate_lge_prose_with_user_session(cmr_client, monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text="Generated clinical prose."
        ),
    )

    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Summary User", "code": "summary-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "summary-code"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    response = cmr_client.post(
        "/v1/cmr/summaries/lge/prose",
        json=_sample_lge_summary_payload(),
        headers=user_headers,
    )
    assert response.status_code == 200
    assert response.json() == {"prose": "Generated clinical prose."}


def test_generate_lge_prose_accepts_local_dev_token_on_localhost(
    monkeypatch, tmp_path
):
    _set_cmr_test_env(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(output_text="Local dev prose."),
    )

    from research_os.api.app import app

    with TestClient(app, base_url="http://localhost") as client:
        response = client.post(
            "/v1/cmr/summaries/lge/prose",
            json=_sample_lge_summary_payload(),
            headers={"Authorization": "Bearer cmr-local-dev-test-token"},
        )

    assert response.status_code == 200
    assert response.json() == {"prose": "Local dev prose."}


def test_generate_case_lessons_prose_with_user_session(cmr_client, monkeypatch):
    expected = (
        "Why this case is instructive:\n"
        "This case is a good example of why stress perfusion and infarct-pattern LGE have to be read together, "
        "because viability depends on whether the defect exceeds scar rather than merely co-localising with it.\n\n"
        "Acquisition and confidence:\n"
        "The protocol is strong because vasodilator stress was adequate and both perfusion and LGE were available for direct territorial correlation.\n\n"
        "CMR learning point:\n"
        "Mapping is supportive here, but the main teaching still comes from the perfusion-scar relationship and the viability implications of 26-50% transmural infarct scar."
    )
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(output_text=expected),
    )

    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Case Lessons User", "code": "case-lessons-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "case-lessons-code"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    response = cmr_client.post(
        "/v1/cmr/summaries/case-lessons/prose",
        json=_sample_case_lessons_payload(),
        headers=user_headers,
    )
    assert response.status_code == 200
    assert response.json() == {"prose": expected}


def test_generate_case_question_answer_with_user_session(cmr_client, monkeypatch):
    expected = (
        "It still counts as viable myocardium because the infarct scar in the LCx territory remains 26-50% transmural rather than >50% transmural. "
        "In this case the stress defect extends beyond the scar, so the case teaches residual ischaemia in myocardium that still retains recovery potential."
    )
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(output_text=expected),
    )

    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Case Question User", "code": "case-question-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "case-question-code"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    response = cmr_client.post(
        "/v1/cmr/summaries/case-question/answer",
        json=_sample_case_question_payload(),
        headers=user_headers,
    )
    assert response.status_code == 200
    assert response.json() == {"answer": expected}


def test_generate_expert_chat_answer_with_user_session(cmr_client, monkeypatch):
    expected = (
        "It reads as matched scar because the stress perfusion abnormality is confined to infarct-pattern LGE and does not extend into adjacent viable myocardium. "
        "In that setting the case is about scar burden and absent residual viability, not residual inducible ischaemia."
    )
    recorded_request: dict[str, object] = {}

    def _fake_create_response(**kwargs):
        recorded_request.update(kwargs)
        return SimpleNamespace(output_text=expected)

    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        _fake_create_response,
    )

    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Expert Chat User", "code": "expert-chat-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "expert-chat-code"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    response = cmr_client.post(
        "/v1/cmr/summaries/expert-chat/answer",
        json=_sample_expert_chat_payload(),
        headers=user_headers,
    )
    assert response.status_code == 200
    assert response.json() == {"answer": expected}
    assert recorded_request["model"] == "gpt-5.4"
    assert "Question type: interpretive distinction." in str(recorded_request["input"])


def test_generate_report_selection_refinement_requires_session(cmr_client):
    response = cmr_client.post(
        "/v1/cmr/summaries/report-selection-refinement/answer",
        json=_sample_report_selection_refinement_payload(),
    )
    assert response.status_code == 401


def test_generate_report_selection_refinement_with_user_session(cmr_client, monkeypatch):
    expected = {
        "answer": (
            "I separated global function from longitudinal shortening so the sentence reads more naturally while still making the discordant TAPSE explicit."
        ),
        "replacementText": (
            "The RV is not dilated. Global systolic function is preserved (RVEF 56%), with discordantly marked reduction in longitudinal shortening (TAPSE 12 mm)."
        ),
    }
    recorded_request: dict[str, object] = {}

    def _fake_create_response(**kwargs):
        recorded_request.update(kwargs)
        return SimpleNamespace(output_text=json.dumps(expected))

    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        _fake_create_response,
    )

    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Report Refine User", "code": "report-refine-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "report-refine-code"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    response = cmr_client.post(
        "/v1/cmr/summaries/report-selection-refinement/answer",
        json=_sample_report_selection_refinement_payload(),
        headers=user_headers,
    )
    assert response.status_code == 200
    assert response.json() == expected
    assert recorded_request["model"] == "gpt-5.4"
    assert '"selectedText":"The RV is not dilated, with preserved global systolic function (RVEF 56%) and markedly reduced longitudinal function (TAPSE 12 mm)."' in str(recorded_request["input"])


def test_generate_rwma_prose_requires_session(cmr_client):
    response = cmr_client.post(
        "/v1/cmr/summaries/rwma/prose",
        json=_sample_rwma_summary_payload(),
    )
    assert response.status_code == 401


def test_generate_rwma_prose_with_user_session(cmr_client, monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text="Generated wall motion prose."
        ),
    )

    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "RWMA User", "code": "rwma-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "rwma-code"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    response = cmr_client.post(
        "/v1/cmr/summaries/rwma/prose",
        json=_sample_rwma_summary_payload(),
        headers=user_headers,
    )
    assert response.status_code == 200
    assert response.json() == {"prose": "Generated wall motion prose."}


def test_generate_rwma_prose_accepts_local_dev_token_on_localhost(
    monkeypatch, tmp_path
):
    _set_cmr_test_env(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(output_text="Local wall motion prose."),
    )

    from research_os.api.app import app

    with TestClient(app, base_url="http://localhost") as client:
        response = client.post(
            "/v1/cmr/summaries/rwma/prose",
            json=_sample_rwma_summary_payload(),
            headers={"Authorization": "Bearer cmr-local-dev-test-token"},
        )

    assert response.status_code == 200
    assert response.json() == {"prose": "Local wall motion prose."}


def test_generate_rwma_prose_normalizes_present_with_phrasing(monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                "Regional wall motion abnormalities present, with hypokinesis "
                "of the basal and mid inferior wall. Wall motion score index 1.18 (mild)."
            )
        ),
    )

    from research_os.cmr_summaries.service import generate_rwma_prose

    assert generate_rwma_prose(_sample_rwma_summary_payload()) == (
        "Regional wall motion abnormality involving hypokinesis of the basal and mid inferior wall."
    )


def test_generate_rwma_prose_normalizes_normal_case(monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                "Normal wall motion. No regional wall motion abnormalities identified. "
                "Wall motion score index 1.00 (normal)."
            )
        ),
    )

    from research_os.cmr_summaries.service import generate_rwma_prose

    assert generate_rwma_prose(_sample_rwma_summary_payload()) == (
        "No regional wall motion abnormality."
    )


def test_generate_rwma_prose_removes_duplicate_involving_prefix(monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                "Regional wall motion abnormality involving regional wall motion "
                "abnormality involving the basal and mid inferior and inferolateral "
                "walls with hypokinesis in the RCA and LCx territories."
            )
        ),
    )

    from research_os.cmr_summaries.service import generate_rwma_prose

    assert generate_rwma_prose(_sample_rwma_summary_payload()) == (
        "Regional wall motion abnormality involving the basal and mid inferior and "
        "inferolateral walls with hypokinesis in the RCA and LCx territories."
    )


def test_generate_perfusion_prose_requires_session(cmr_client):
    response = cmr_client.post(
        "/v1/cmr/summaries/perfusion/prose",
        json=_sample_perfusion_summary_payload(),
    )
    assert response.status_code == 401


def test_generate_perfusion_prose_with_user_session(cmr_client, monkeypatch):
    expected = (
        "Stress perfusion: Adequate vasodilator stress. Inducible "
        "subendocardial perfusion defect involving 2 segments in the "
        "inferior wall (RCA), without corresponding infarct-pattern LGE, "
        "consistent with ischaemia in viable myocardium."
    )
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=expected
        ),
    )

    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Perfusion User", "code": "perfusion-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "perfusion-code"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    response = cmr_client.post(
        "/v1/cmr/summaries/perfusion/prose",
        json=_sample_perfusion_summary_payload(),
        headers=user_headers,
    )
    assert response.status_code == 200
    assert response.json() == {"prose": expected}


def test_generate_perfusion_prose_falls_back_to_canonical_matched_scar(
    cmr_client, monkeypatch
):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                "Stress perfusion: Adequate vasodilator stress. "
                "Subendocardial perfusion abnormality involving 3 segments in the "
                "inferior wall (RCA) is confined to regions of infarct-pattern "
                "LGE, without clear extension beyond scar."
            )
        ),
    )

    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Perfusion Canonical User", "code": "perfusion-canonical"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "perfusion-canonical"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    payload = _sample_perfusion_summary_payload()
    payload["deterministicText"] = (
        "Stress perfusion: Adequate vasodilator stress. Perfusion abnormality "
        "involving 3 segments in the inferior wall (RCA) is confined to "
        "regions of infarct-pattern LGE, without clear extension beyond scar."
    )
    payload["impression"] = "matched-scar"
    payload["stress"]["abnormalCount"] = 3
    payload["stress"]["segmentDescription"] = "inferior wall"
    payload["stress"]["segments"] = [
        {
            "seg": 4,
            "name": "basal inferior",
            "extent": 1,
            "territory": "RCA",
            "wall": "inferior",
            "level": "basal",
        },
        {
            "seg": 10,
            "name": "mid inferior",
            "extent": 1,
            "territory": "RCA",
            "wall": "inferior",
            "level": "mid",
        },
        {
            "seg": 15,
            "name": "apical inferior",
            "extent": 1,
            "territory": "RCA",
            "wall": "inferior",
            "level": "apical",
        },
    ]
    payload["lge"] = {
        "hasAnyLge": True,
        "hasInfarctPatternLge": True,
        "infarctPatternCount": 3,
        "infarctTerritories": ["RCA"],
        "hasAnyOverlapLge": True,
        "overlapAnyLgeCount": 3,
        "overlapNonInfarctCount": 0,
        "matchedWithinLgeCount": 3,
        "exceedsBySegmentCount": 0,
        "exceedsByThicknessCount": 0,
        "stressBeyondInfarctCount": 0,
        "lgeElsewhere": False,
        "indeterminateRelation": False,
        "matchedStressSegmentDescription": "inferior wall",
        "stressBeyondInfarctSegmentDescription": None,
    }

    response = cmr_client.post(
        "/v1/cmr/summaries/perfusion/prose",
        json=payload,
        headers=user_headers,
    )

    assert response.status_code == 200
    assert response.json() == {"prose": payload["deterministicText"]}


def test_generate_perfusion_prose_accepts_local_dev_token_on_localhost(
    monkeypatch, tmp_path
):
    _set_cmr_test_env(monkeypatch, tmp_path)
    expected = (
        "Stress perfusion: Adequate vasodilator stress. Inducible "
        "subendocardial perfusion defect involving 2 segments in the "
        "inferior wall (RCA), without corresponding infarct-pattern LGE, "
        "consistent with ischaemia in viable myocardium."
    )
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(output_text=expected),
    )

    from research_os.api.app import app

    with TestClient(app, base_url="http://localhost") as client:
        response = client.post(
            "/v1/cmr/summaries/perfusion/prose",
            json=_sample_perfusion_summary_payload(),
            headers={"Authorization": "Bearer cmr-local-dev-test-token"},
        )

    assert response.status_code == 200
    assert response.json() == {"prose": expected}


def test_generate_ph_prose_requires_session(cmr_client):
    response = cmr_client.post(
        "/v1/cmr/summaries/ph/prose",
        json=_sample_ph_summary_payload(),
    )
    assert response.status_code == 401


def test_generate_ph_prose_with_user_session(cmr_client, monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                "Severe pulmonary hypertension physiology with RV-pulmonary arterial uncoupling. "
                "Supported by severely impaired RV systolic function (RVEF 31 %), "
                "markedly reduced TAPSE (TAPSE 9 mm), and severely dilated right ventricle (RV EDVi 148 mL/m2)."
            )
        ),
    )

    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "PH Summary User", "code": "ph-summary-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "ph-summary-code"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    response = cmr_client.post(
        "/v1/cmr/summaries/ph/prose",
        json=_sample_ph_summary_payload(),
        headers=user_headers,
    )
    assert response.status_code == 200
    assert response.json() == {
        "prose": (
            "Severe pulmonary hypertension physiology with RV-pulmonary arterial uncoupling. "
            "Supported by severely impaired RV systolic function (RVEF 31 %), "
            "markedly reduced TAPSE (TAPSE 9 mm), and severely dilated right ventricle (RV EDVi 148 mL/m2)."
        )
    }


def test_generate_ph_prose_accepts_local_dev_token_on_localhost(
    monkeypatch, tmp_path
):
    _set_cmr_test_env(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                "Severe pulmonary hypertension physiology with RV-pulmonary arterial uncoupling. "
                "Supported by severely impaired RV systolic function (RVEF 31 %), "
                "markedly reduced TAPSE (TAPSE 9 mm), and severely dilated right ventricle (RV EDVi 148 mL/m2)."
            )
        ),
    )

    from research_os.api.app import app

    with TestClient(app, base_url="http://localhost") as client:
        response = client.post(
            "/v1/cmr/summaries/ph/prose",
            json=_sample_ph_summary_payload(),
            headers={"Authorization": "Bearer cmr-local-dev-test-token"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "prose": (
            "Severe pulmonary hypertension physiology with RV-pulmonary arterial uncoupling. "
            "Supported by severely impaired RV systolic function (RVEF 31 %), "
            "markedly reduced TAPSE (TAPSE 9 mm), and severely dilated right ventricle (RV EDVi 148 mL/m2)."
        )
    }


def test_generate_mitral_valve_prose_requires_session(cmr_client):
    response = cmr_client.post(
        "/v1/cmr/summaries/mitral-valve/prose",
        json=_sample_mitral_valve_summary_payload(),
    )
    assert response.status_code == 401


def test_generate_mitral_valve_prose_with_user_session(cmr_client, monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text="Severe mitral regurgitation due to flail posterior leaflet with chordal rupture (RF 52%, MR volume 71 mL)."
        ),
    )

    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Mitral Summary User", "code": "mitral-summary-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "mitral-summary-code"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    response = cmr_client.post(
        "/v1/cmr/summaries/mitral-valve/prose",
        json=_sample_mitral_valve_summary_payload(),
        headers=user_headers,
    )
    assert response.status_code == 200
    assert response.json() == {
        "prose": "Severe mitral regurgitation due to flail posterior leaflet with chordal rupture (RF 52%, MR volume 71 mL)."
    }


def test_generate_mitral_valve_prose_accepts_local_dev_token_on_localhost(
    monkeypatch, tmp_path
):
    _set_cmr_test_env(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text="Moderate mitral regurgitation due to posterior leaflet prolapse (RF 28%, MR volume 34 mL)."
        ),
    )

    from research_os.api.app import app

    with TestClient(app, base_url="http://localhost") as client:
        response = client.post(
            "/v1/cmr/summaries/mitral-valve/prose",
            json=_sample_mitral_valve_summary_payload(),
            headers={"Authorization": "Bearer cmr-local-dev-test-token"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "prose": "Moderate mitral regurgitation due to posterior leaflet prolapse (RF 28%, MR volume 34 mL)."
    }


def test_generate_mitral_valve_prose_falls_back_when_model_infers_stenosis(monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                "Mitral valve: Severe mitral regurgitation due to flail posterior leaflet "
                "with chordal rupture and mild mitral stenosis."
            )
        ),
    )

    from research_os.cmr_summaries.service import generate_mitral_valve_prose

    assert generate_mitral_valve_prose(_sample_mitral_valve_summary_payload()) == (
        "Severe mitral regurgitation due to flail posterior leaflet with chordal rupture (RF 52%, MR volume 71 mL)."
    )


def test_generate_mitral_valve_prose_falls_back_when_moderate_or_severe_values_are_omitted(monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text="Severe mitral regurgitation due to flail posterior leaflet with chordal rupture."
        ),
    )

    from research_os.cmr_summaries.service import generate_mitral_valve_prose

    assert generate_mitral_valve_prose(_sample_mitral_valve_summary_payload()) == (
        "Severe mitral regurgitation due to flail posterior leaflet with chordal rupture (RF 52%, MR volume 71 mL)."
    )


def test_generate_mitral_valve_prose_falls_back_when_qualifier_rich_descriptors_are_omitted(monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text="Moderate mitral regurgitation with leaflet thickening and calcification (RF 21%, MR volume 16 mL)."
        ),
    )

    from research_os.cmr_summaries.service import generate_mitral_valve_prose

    payload = {
        "deterministicText": (
            "Moderate mitral regurgitation with diffuse anterior leaflet thickening "
            "and mild focal leaflet calcification (RF 21%, MR volume 16 mL)."
        ),
        "severity": "moderate",
        "severityLabel": "Moderate",
        "regurgitantFraction": 21.0,
        "regurgitantVolume": 16.0,
        "primaryMechanism": "structural",
        "primaryMechanismLabel": "Structural",
        "descriptors": [
            "diffuse anterior leaflet thickening",
            "mild focal leaflet calcification",
        ],
        "findingKeys": ["calcified", "thickened"],
        "lvef": 63.0,
        "lvedvi": 46.0,
        "laMaxVolumeIndex": 35.0,
    }

    assert generate_mitral_valve_prose(payload) == payload["deterministicText"]


def test_generate_aortic_valve_prose_with_user_session(cmr_client, monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text="Severe aortic stenosis with severe diffuse cusp calcification (peak velocity 4.3 m/s; mean gradient 48 mmHg)."
        ),
    )

    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Aortic Summary User", "code": "aortic-summary-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "aortic-summary-code"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    response = cmr_client.post(
        "/v1/cmr/summaries/aortic-valve/prose",
        json=_sample_aortic_valve_summary_payload(),
        headers=user_headers,
    )
    assert response.status_code == 200
    assert response.json() == {
        "prose": "Severe aortic stenosis with severe diffuse cusp calcification (peak velocity 4.3 m/s; mean gradient 48 mmHg)."
    }


def test_generate_aortic_valve_prose_accepts_local_dev_token_on_localhost(
    monkeypatch, tmp_path
):
    _set_cmr_test_env(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text="Moderate aortic regurgitation with bicuspid aortic valve (R-L fusion, high raphe) (RF 28%, regurgitant volume 34 mL)."
        ),
    )

    payload = {
        "deterministicText": "Moderate aortic regurgitation with bicuspid aortic valve (R-L fusion, high raphe) (RF 28%, regurgitant volume 34 mL).",
        "phenotype": "regurgitation",
        "phenotypeLabel": "Aortic regurgitation",
        "regurgitationSeverity": "moderate",
        "regurgitationSeverityLabel": "Moderate",
        "regurgitantFraction": 28.0,
        "regurgitantVolume": 34.0,
        "stenosisSeverity": None,
        "stenosisSeverityLabel": None,
        "peakVelocity": None,
        "meanGradient": None,
        "peakGradient": None,
        "primaryMechanism": "congenital",
        "primaryMechanismLabel": "Congenital",
        "descriptors": ["bicuspid aortic valve (R-L fusion, high raphe)"],
        "findingKeys": ["bicuspid"],
    }

    from research_os.api.app import app

    with TestClient(app, base_url="http://localhost") as client:
        response = client.post(
            "/v1/cmr/summaries/aortic-valve/prose",
            json=payload,
            headers={"Authorization": "Bearer cmr-local-dev-test-token"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "prose": "Moderate aortic regurgitation with bicuspid aortic valve (R-L fusion, high raphe) (RF 28%, regurgitant volume 34 mL)."
    }


def test_generate_aortic_valve_prose_falls_back_when_stenosis_values_are_omitted(monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text="Severe aortic stenosis with severe diffuse cusp calcification."
        ),
    )

    from research_os.cmr_summaries.service import generate_aortic_valve_prose

    assert generate_aortic_valve_prose(_sample_aortic_valve_summary_payload()) == (
        "Severe aortic stenosis with severe diffuse cusp calcification (peak velocity 4.3 m/s; mean gradient 48 mmHg)."
    )


def test_generate_tricuspid_valve_prose_with_user_session(cmr_client, monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text="Moderate tricuspid regurgitation due to pacemaker lead impingement (RF 28%, TR volume 34 mL)."
        ),
    )

    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Tricuspid Summary User", "code": "tricuspid-summary-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "tricuspid-summary-code"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    response = cmr_client.post(
        "/v1/cmr/summaries/tricuspid-valve/prose",
        json=_sample_tricuspid_valve_summary_payload(),
        headers=user_headers,
    )
    assert response.status_code == 200
    assert response.json() == {
        "prose": "Moderate tricuspid regurgitation due to pacemaker lead impingement (RF 28%, TR volume 34 mL)."
    }


def test_generate_tricuspid_valve_prose_falls_back_when_moderate_or_severe_values_are_omitted(monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text="Moderate tricuspid regurgitation due to pacemaker lead impingement."
        ),
    )

    from research_os.cmr_summaries.service import generate_tricuspid_valve_prose

    assert generate_tricuspid_valve_prose(_sample_tricuspid_valve_summary_payload()) == (
        "Moderate tricuspid regurgitation due to pacemaker lead impingement (RF 28%, TR volume 34 mL)."
    )


def test_generate_thrombus_prose_with_user_session(cmr_client, monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text="Definite left ventricular apex thrombus (12 mm), mural and fixed, without internal enhancement on post-contrast imaging."
        ),
    )

    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Thrombus Summary User", "code": "thrombus-summary-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "thrombus-summary-code"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    response = cmr_client.post(
        "/v1/cmr/summaries/thrombus/prose",
        json=_sample_thrombus_summary_payload(),
        headers=user_headers,
    )
    assert response.status_code == 200
    assert response.json() == {
        "prose": "Definite left ventricular apex thrombus (12 mm), mural and fixed, without internal enhancement on post-contrast imaging."
    }


def test_generate_thrombus_prose_falls_back_when_location_is_omitted(monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text="Definite thrombus (12 mm), mural and fixed."
        ),
    )

    from research_os.cmr_summaries.service import generate_thrombus_prose

    assert generate_thrombus_prose(_sample_thrombus_summary_payload()) == (
        "Definite left ventricular apex thrombus (12 mm), mural and fixed, without internal enhancement on post-contrast imaging."
    )


def test_generate_report_conclusions_prose_requires_session(cmr_client):
    response = cmr_client.post(
        "/v1/cmr/summaries/report-conclusions/prose",
        json=_sample_report_conclusions_payload(),
    )
    assert response.status_code == 401


def test_generate_report_conclusions_prose_with_user_session(cmr_client, monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                "Preserved LV systolic function (LVEF 63%) with a non-dilated LV and normal wall thickness, with regional dysfunction in the RCA territory.\n"
                "Preserved RV systolic function (RVEF 58%) with a non-dilated RV.\n"
                "Matched scar without inducible ischaemia. Prior infarction in the RCA territory, predominantly non-viable."
            )
        ),
    )

    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Conclusion Summary User", "code": "conclusion-summary-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "conclusion-summary-code"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    response = cmr_client.post(
        "/v1/cmr/summaries/report-conclusions/prose",
        json=_sample_report_conclusions_payload(),
        headers=user_headers,
    )
    assert response.status_code == 200
    assert response.json() == {
        "lines": [
            "Preserved LV systolic function (LVEF 63%) with a non-dilated LV and normal wall thickness, with regional dysfunction in the RCA territory.",
            "Preserved RV systolic function (RVEF 58%) with a non-dilated RV.",
            "Matched scar without inducible ischaemia. Prior infarction in the RCA territory, predominantly non-viable.",
        ]
    }


def test_generate_report_conclusions_prose_falls_back_when_facts_are_weakened(monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                "Normal LV function with regional change.\n"
                "Normal RV function.\n"
                "Prior scar."
            )
        ),
    )

    from research_os.cmr_summaries.service import generate_report_conclusions_prose

    assert generate_report_conclusions_prose(_sample_report_conclusions_payload()) == (
        _sample_report_conclusions_payload()["deterministicLines"]
    )


def test_generate_report_selection_refinement_parses_structured_output(monkeypatch):
    expected = {
        "answer": (
            "This tightens the phrasing and makes the preserved global function versus reduced longitudinal shortening clearer."
        ),
        "replacementText": (
            "The RV is not dilated. Global systolic function is preserved (RVEF 56%), while longitudinal shortening is markedly reduced (TAPSE 12 mm)."
        ),
    }
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(output_text=json.dumps(expected)),
    )

    from research_os.cmr_summaries.service import generate_report_selection_refinement

    assert generate_report_selection_refinement(
        _sample_report_selection_refinement_payload()
    ) == expected


def test_generate_report_conclusions_prose_falls_back_when_transmurality_is_blurred(monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                "Severe LV systolic impairment (LVEF 22%) with severe dilatation (LV EDVi 114 mL/m2), eccentric hypertrophy, and regional dyskinetic change in the LCx and RCA territories.\n"
                "Preserved RV systolic function (RVEF 50%) with a non-dilated RV.\n"
                "Widespread subendocardial inducible ischaemia across the LAD, LCx, and RCA territories, consistent with multivessel disease. Prior RCA and LCx infarction, predominantly viable."
            )
        ),
    )

    from research_os.cmr_summaries.service import generate_report_conclusions_prose

    deterministic_lines = [
        "Severe LV systolic impairment (LVEF 22%) with severe dilatation (LV EDVi 114 mL/m2), eccentric hypertrophy, and regional dyskinetic change in the LCx and RCA territories.",
        "Preserved RV systolic function (RVEF 50%) with a non-dilated RV.",
        "Widespread subendocardial inducible ischaemia across the LAD, LCx, and RCA territories, consistent with multivessel disease. Prior RCA infarction with 51-75% transmural scar and limited viability, and LCx infarction with 26-50% transmural scar and preserved viability.",
    ]

    assert generate_report_conclusions_prose(
        {"reportType": "stress", "deterministicLines": deterministic_lines}
    ) == deterministic_lines


def test_generate_report_conclusions_prose_falls_back_when_non_ischaemic_pattern_is_dropped(monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                "Preserved LV systolic function (LVEF 58%) with marked concentric hypertrophy (maximal wall thickness 24 mm) and normal size.\n"
                "Preserved RV systolic function (RVEF 57%) with a non-dilated RV.\n"
                "No inducible ischaemia."
            )
        ),
    )

    from research_os.cmr_summaries.service import generate_report_conclusions_prose

    deterministic_lines = [
        "Preserved LV systolic function (LVEF 58%) with marked concentric hypertrophy (maximal wall thickness 24 mm) and normal size.",
        "Preserved RV systolic function (RVEF 57%) with a non-dilated RV.",
        "No inducible ischaemia. Extensive non-ischaemic mid-wall enhancement involving the anterior, anteroseptal, and septal walls extending to the apex.",
    ]

    assert generate_report_conclusions_prose(
        {"reportType": "stress", "deterministicLines": deterministic_lines}
    ) == deterministic_lines


def test_generate_report_conclusions_prose_falls_back_when_infarct_pattern_scar_relation_is_dropped(monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                "Inducible LAD territory ischaemia in viable myocardium.\n"
                "Preserved LV systolic function (LVEF 56%) with normal size and mildly increased LV mass.\n"
                "Preserved RV systolic function (RVEF 63%) with a non-dilated RV."
            )
        ),
    )

    from research_os.cmr_summaries.service import generate_report_conclusions_prose

    deterministic_lines = [
        "Inducible LAD territory ischaemia in viable myocardium, without infarct-pattern scar.",
        "Preserved LV systolic function (LVEF 56%) with normal size and mildly increased LV mass.",
        "Preserved RV systolic function (RVEF 63%) with a non-dilated RV.",
    ]

    assert generate_report_conclusions_prose(
        {"reportType": "stress", "deterministicLines": deterministic_lines}
    ) == deterministic_lines


def test_generate_ph_prose_falls_back_when_pcwp_severity_is_overcalled(monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                "Intermediate probability of pulmonary hypertension physiology, with features raising the possibility of post-capillary or mixed physiology. "
                "The pattern is driven by severely elevated estimated PCWP (PCWP 17 mmHg) and mildly impaired LV systolic function."
            )
        ),
    )

    from research_os.cmr_summaries.service import generate_ph_prose

    payload = {
        "deterministicText": (
            "Moderate post-capillary pulmonary hypertension physiology, in the context of elevated estimated left-sided filling pressure and mild LV systolic dysfunction."
        ),
        "probability": "intermediate",
        "severity": "moderate",
        "phenotype": "post-capillary-or-mixed",
    }

    assert generate_ph_prose(payload) == payload["deterministicText"]


def test_generate_ph_prose_falls_back_when_borderline_pcwp_is_added_as_elevated(monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                "Intermediate probability of pulmonary hypertension physiology with early right-sided pressure loading. "
                "In the context of elevated estimated left-sided filling pressure. "
                "Supported by mildly dilated right ventricle and mildly dilated main pulmonary artery."
            )
        ),
    )

    from research_os.cmr_summaries.service import generate_ph_prose

    payload = {
        "deterministicText": (
            "Intermediate probability of pulmonary hypertension physiology with early right-sided pressure loading. "
            "Supported by mildly dilated right ventricle and mildly dilated main pulmonary artery."
        ),
        "probability": "intermediate",
        "phenotype": "early-pressure-overload",
        "leftHeartFindings": [],
    }

    assert generate_ph_prose(payload) == payload["deterministicText"]


def test_generate_ph_prose_falls_back_when_vortex_and_helicity_are_collapsed(monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                "High probability of pulmonary hypertension physiology with RV-pulmonary arterial uncoupling. "
                "Supported by severely impaired RV systolic function (RVEF 31%), markedly reduced TAPSE (9 mm), "
                "and 4D-flow vortex/helicity."
            )
        ),
    )

    from research_os.cmr_summaries.service import generate_ph_prose

    payload = {
        "deterministicText": (
            "High probability of pulmonary hypertension physiology with RV-pulmonary arterial uncoupling. "
            "Supported by severely impaired RV systolic function (RVEF 31%), markedly reduced TAPSE (9 mm), "
            "and marked 4D-flow vortex formation with moderate helicity, representing disorganised flow."
        ),
        "probability": "high",
        "phenotype": "rv-pa-uncoupling",
    }

    assert generate_ph_prose(payload) == payload["deterministicText"]


def test_generate_ph_prose_falls_back_when_uncoupling_and_left_heart_context_are_added(monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                "High probability of pulmonary hypertension physiology with RV-pulmonary arterial uncoupling, "
                "in the context of elevated estimated left-sided filling pressure. "
                "Supported by reduced TAPSE (11 mm) and small pericardial effusion."
            )
        ),
    )

    from research_os.cmr_summaries.service import generate_ph_prose

    payload = {
        "deterministicText": (
            "High probability of pulmonary hypertension physiology with an RV pressure-overload / pulmonary vascular phenotype. "
            "Supported by moderately dilated right ventricle (RV EDVi 132 mL/m2) and moderately dilated main pulmonary artery (MPA 34 mm)."
        ),
        "probability": "high",
        "phenotype": "pressure-overload-pulmonary-vascular",
        "adaptation": "stressed",
        "leftHeartFindings": [],
    }

    assert generate_ph_prose(payload) == payload["deterministicText"]


def test_generate_ph_prose_normalizes_spaced_slash_terminology(monkeypatch):
    monkeypatch.setattr(
        "research_os.cmr_summaries.service.create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                "Moderate post-capillary / mixed pulmonary hypertension physiology."
            )
        ),
    )

    from research_os.cmr_summaries.service import generate_ph_prose

    assert generate_ph_prose(
        {
            "deterministicText": (
                "Moderate post-capillary or mixed pulmonary hypertension physiology."
            ),
            "probability": "intermediate",
            "severity": "moderate",
            "phenotype": "post-capillary-or-mixed",
        }
    ) == (
        "Moderate post-capillary or mixed pulmonary hypertension physiology."
    )
