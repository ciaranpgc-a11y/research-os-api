"""Add extract tables.

Creates 8 extract tables: extract_access_codes, extract_sessions,
extract_patients, extract_rhc, extract_echocardiogram, extract_cmr,
extract_cpex, extract_study_recruitment.

Revision ID: 20260414_0025
Revises: 20260322_0024
Create Date: 2026-04-14
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260414_0025"
down_revision = "20260322_0024"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    from sqlalchemy import inspect as sa_inspect
    conn = op.get_bind()
    return name in sa_inspect(conn).get_table_names()


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. extract_access_codes
    # ------------------------------------------------------------------
    if not _table_exists("extract_access_codes"):
        op.create_table(
            "extract_access_codes",
            sa.Column("id", sa.String(36), nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("code_hash", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("last_accessed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("session_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
            sa.PrimaryKeyConstraint("id"),
        )

    # ------------------------------------------------------------------
    # 2. extract_sessions
    # ------------------------------------------------------------------
    if not _table_exists("extract_sessions"):
        op.create_table(
            "extract_sessions",
            sa.Column("id", sa.String(36), nullable=False),
            sa.Column("access_code_id", sa.String(36), nullable=False),
            sa.Column("session_token", sa.String(128), nullable=False),
            sa.Column("is_admin", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(
                ["access_code_id"],
                ["extract_access_codes.id"],
                ondelete="CASCADE",
            ),
        )
        op.create_index(
            "ix_extract_sessions_access_code_id",
            "extract_sessions",
            ["access_code_id"],
        )
        op.create_index(
            "ix_extract_sessions_session_token",
            "extract_sessions",
            ["session_token"],
            unique=True,
        )

    # ------------------------------------------------------------------
    # 3. extract_patients
    # ------------------------------------------------------------------
    if not _table_exists("extract_patients"):
        op.create_table(
            "extract_patients",
            sa.Column("id", sa.Text(), nullable=False),
            sa.Column("hn", sa.Text(), nullable=False),
            sa.Column("name", sa.Text(), nullable=True),
            sa.Column("dob", sa.Text(), nullable=True),
            sa.Column("gender", sa.Text(), nullable=True),
            sa.Column("study_id", sa.Text(), nullable=True),
            sa.Column("source", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_extract_patients_hn",
            "extract_patients",
            ["hn"],
            unique=True,
        )

    # ------------------------------------------------------------------
    # 4. extract_rhc
    # ------------------------------------------------------------------
    if not _table_exists("extract_rhc"):
        op.create_table(
            "extract_rhc",
            sa.Column("id", sa.Text(), nullable=False),
            sa.Column("hn", sa.Text(), nullable=False),
            sa.Column("date_rhc", sa.Text(), nullable=True),
            sa.Column("pending", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("height", sa.Float(), nullable=True),
            sa.Column("weight", sa.Float(), nullable=True),
            sa.Column("ra_mean", sa.Float(), nullable=True),
            sa.Column("ra_a", sa.Float(), nullable=True),
            sa.Column("ra_v", sa.Float(), nullable=True),
            sa.Column("ra_o2_sat", sa.Float(), nullable=True),
            sa.Column("rv_systolic", sa.Float(), nullable=True),
            sa.Column("rv_diastolic", sa.Float(), nullable=True),
            sa.Column("rv_o2_sat", sa.Float(), nullable=True),
            sa.Column("pa_systolic", sa.Float(), nullable=True),
            sa.Column("pa_diastolic", sa.Float(), nullable=True),
            sa.Column("pa_mean", sa.Float(), nullable=True),
            sa.Column("pcwp_mean", sa.Float(), nullable=True),
            sa.Column("pcwp_a", sa.Float(), nullable=True),
            sa.Column("pcwp_v", sa.Float(), nullable=True),
            sa.Column("pa_o2_sat", sa.Float(), nullable=True),
            sa.Column("aorta_systolic", sa.Float(), nullable=True),
            sa.Column("aorta_diastolic", sa.Float(), nullable=True),
            sa.Column("aorta_mean", sa.Float(), nullable=True),
            sa.Column("aorta_o2_sat", sa.Float(), nullable=True),
            sa.Column("lv_systolic", sa.Float(), nullable=True),
            sa.Column("lv_diastolic", sa.Float(), nullable=True),
            sa.Column("cardiac_output", sa.Float(), nullable=True),
            sa.Column("cardiac_index", sa.Float(), nullable=True),
            sa.Column("pvr_wu", sa.Float(), nullable=True),
            sa.Column("pvr_dyn", sa.Float(), nullable=True),
            sa.Column("tpg", sa.Float(), nullable=True),
            sa.Column("rhc_comments", sa.Text(), nullable=True),
            sa.Column("source_file", sa.Text(), nullable=True),
            sa.Column("raw_text", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("status", sa.Text(), nullable=False, server_default="Pending"),
            sa.Column("rv_mean", sa.Float(), nullable=True),
            sa.Column("pcwp_o2_sat", sa.Float(), nullable=True),
            sa.Column("lv_mean", sa.Float(), nullable=True),
            sa.Column("lv_o2_sat", sa.Float(), nullable=True),
            sa.Column("status_date", sa.Text(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_extract_rhc_hn", "extract_rhc", ["hn"])
        op.create_index("ix_extract_rhc_pa_mean", "extract_rhc", ["pa_mean"])
        op.create_index("ix_extract_rhc_pcwp_mean", "extract_rhc", ["pcwp_mean"])
        op.create_index("ix_extract_rhc_pvr_wu", "extract_rhc", ["pvr_wu"])

    # ------------------------------------------------------------------
    # 5. extract_echocardiogram
    # ------------------------------------------------------------------
    if not _table_exists("extract_echocardiogram"):
        op.create_table(
            "extract_echocardiogram",
            sa.Column("id", sa.Text(), nullable=False),
            sa.Column("hn", sa.Text(), nullable=False),
            sa.Column("study_date", sa.Text(), nullable=True),
            sa.Column("report_date", sa.Text(), nullable=True),
            sa.Column("consultant", sa.Text(), nullable=True),
            sa.Column("ward_op", sa.Text(), nullable=True),
            sa.Column("study_reason", sa.Text(), nullable=True),
            sa.Column("rhythm", sa.Text(), nullable=True),
            sa.Column("hr", sa.Float(), nullable=True),
            sa.Column("bp_text", sa.Text(), nullable=True),
            sa.Column("image_quality", sa.Text(), nullable=True),
            sa.Column("height", sa.Float(), nullable=True),
            sa.Column("weight", sa.Float(), nullable=True),
            sa.Column("bsa", sa.Float(), nullable=True),
            sa.Column("lv_size", sa.Text(), nullable=True),
            sa.Column("lv_wall", sa.Text(), nullable=True),
            sa.Column("lvh", sa.Integer(), nullable=True),
            sa.Column("rwma", sa.Integer(), nullable=True),
            sa.Column("lv_fn", sa.Text(), nullable=True),
            sa.Column("lvef", sa.Float(), nullable=True),
            sa.Column("gls", sa.Float(), nullable=True),
            sa.Column("mapse", sa.Float(), nullable=True),
            sa.Column("med_s", sa.Float(), nullable=True),
            sa.Column("lat_s", sa.Float(), nullable=True),
            sa.Column("sept_e", sa.Float(), nullable=True),
            sa.Column("lat_e", sa.Float(), nullable=True),
            sa.Column("avg_e_ep", sa.Float(), nullable=True),
            sa.Column("sept_e_ep", sa.Float(), nullable=True),
            sa.Column("mv_e", sa.Float(), nullable=True),
            sa.Column("mv_a", sa.Float(), nullable=True),
            sa.Column("e_a", sa.Float(), nullable=True),
            sa.Column("dt_ms", sa.Float(), nullable=True),
            sa.Column("diast_fn", sa.Text(), nullable=True),
            sa.Column("fill_press", sa.Text(), nullable=True),
            sa.Column("rv_size", sa.Text(), nullable=True),
            sa.Column("rv_fn", sa.Text(), nullable=True),
            sa.Column("tapse", sa.Float(), nullable=True),
            sa.Column("rv_s", sa.Float(), nullable=True),
            sa.Column("fac", sa.Float(), nullable=True),
            sa.Column("tr_vmax", sa.Float(), nullable=True),
            sa.Column("rvsp", sa.Float(), nullable=True),
            sa.Column("rap", sa.Float(), nullable=True),
            sa.Column("ivc_size", sa.Text(), nullable=True),
            sa.Column("ivc_coll", sa.Text(), nullable=True),
            sa.Column("ph_prob", sa.Text(), nullable=True),
            sa.Column("sept_flat", sa.Integer(), nullable=True),
            sa.Column("sept_bounce", sa.Integer(), nullable=True),
            sa.Column("d_shaped_lv", sa.Integer(), nullable=True),
            sa.Column("pa_dilated", sa.Integer(), nullable=True),
            sa.Column("peric_eff", sa.Integer(), nullable=True),
            sa.Column("ias_intact", sa.Integer(), nullable=True),
            sa.Column("shunt", sa.Integer(), nullable=True),
            sa.Column("la_size", sa.Text(), nullable=True),
            sa.Column("ra_size", sa.Text(), nullable=True),
            sa.Column("mv_desc", sa.Text(), nullable=True),
            sa.Column("ms_grade", sa.Text(), nullable=True),
            sa.Column("mr_grade", sa.Text(), nullable=True),
            sa.Column("tv_desc", sa.Text(), nullable=True),
            sa.Column("ts_grade", sa.Text(), nullable=True),
            sa.Column("tr_grade", sa.Text(), nullable=True),
            sa.Column("av_desc", sa.Text(), nullable=True),
            sa.Column("av_vmax", sa.Float(), nullable=True),
            sa.Column("av_pk_grad", sa.Float(), nullable=True),
            sa.Column("av_mn_grad", sa.Float(), nullable=True),
            sa.Column("ava", sa.Float(), nullable=True),
            sa.Column("as_grade", sa.Text(), nullable=True),
            sa.Column("ar_grade", sa.Text(), nullable=True),
            sa.Column("ar_pht", sa.Float(), nullable=True),
            sa.Column("pv_desc", sa.Text(), nullable=True),
            sa.Column("ps_grade", sa.Text(), nullable=True),
            sa.Column("pr_grade", sa.Text(), nullable=True),
            sa.Column("pat", sa.Float(), nullable=True),
            sa.Column("pv_vmax", sa.Float(), nullable=True),
            sa.Column("ao_root_desc", sa.Text(), nullable=True),
            sa.Column("asc_ao_desc", sa.Text(), nullable=True),
            sa.Column("lvidd", sa.Float(), nullable=True),
            sa.Column("lvids", sa.Float(), nullable=True),
            sa.Column("ivsd", sa.Float(), nullable=True),
            sa.Column("lvpwd", sa.Float(), nullable=True),
            sa.Column("lvedvi", sa.Float(), nullable=True),
            sa.Column("lvesvi", sa.Float(), nullable=True),
            sa.Column("rwt", sa.Float(), nullable=True),
            sa.Column("lvmi", sa.Float(), nullable=True),
            sa.Column("la_diam", sa.Float(), nullable=True),
            sa.Column("la_vol", sa.Float(), nullable=True),
            sa.Column("la_voli", sa.Float(), nullable=True),
            sa.Column("ra_area", sa.Float(), nullable=True),
            sa.Column("ra_areai", sa.Float(), nullable=True),
            sa.Column("rvd1", sa.Float(), nullable=True),
            sa.Column("rvd2", sa.Float(), nullable=True),
            sa.Column("rvd3", sa.Float(), nullable=True),
            sa.Column("rvot2", sa.Float(), nullable=True),
            sa.Column("ao_ann", sa.Float(), nullable=True),
            sa.Column("ao_sinus", sa.Float(), nullable=True),
            sa.Column("stj_mm", sa.Float(), nullable=True),
            sa.Column("asc_ao_prox", sa.Float(), nullable=True),
            sa.Column("asc_ao_mid", sa.Float(), nullable=True),
            sa.Column("ao_arch", sa.Float(), nullable=True),
            sa.Column("main_pa_mm", sa.Float(), nullable=True),
            sa.Column("lvot_diam", sa.Float(), nullable=True),
            sa.Column("lvot_vel", sa.Float(), nullable=True),
            sa.Column("lvot_vti", sa.Float(), nullable=True),
            sa.Column("dvi", sa.Float(), nullable=True),
            sa.Column("av_vti", sa.Float(), nullable=True),
            sa.Column("conclusion", sa.Text(), nullable=True),
            sa.Column("conc_items", sa.Text(), nullable=True),
            sa.Column("narrative", sa.Text(), nullable=True),
            sa.Column("meas_table", sa.Text(), nullable=True),
            sa.Column("uncertain", sa.Text(), nullable=True),
            sa.Column("ai_warnings", sa.Text(), nullable=True),
            sa.Column("ai_raw_text", sa.Text(), nullable=True),
            sa.Column("reported_by", sa.Text(), nullable=True),
            sa.Column("ai_conf", sa.Text(), nullable=True),
            sa.Column("case_type", sa.Text(), nullable=True),
            sa.Column("primary_dx", sa.Text(), nullable=True),
            sa.Column("secondary_path", sa.Text(), nullable=True),
            sa.Column("source_file", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("status", sa.Text(), nullable=False, server_default="Pending"),
            sa.Column("status_date", sa.Text(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_extract_echocardiogram_hn", "extract_echocardiogram", ["hn"])

    # ------------------------------------------------------------------
    # 6. extract_cmr
    # ------------------------------------------------------------------
    if not _table_exists("extract_cmr"):
        op.create_table(
            "extract_cmr",
            sa.Column("id", sa.Text(), nullable=False),
            sa.Column("hn", sa.Text(), nullable=False),
            sa.Column("date_cmr", sa.Text(), nullable=True),
            sa.Column("source_file", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("status", sa.Text(), nullable=False, server_default="Pending"),
            sa.Column("height", sa.Text(), nullable=True),
            sa.Column("weight", sa.Text(), nullable=True),
            sa.Column("heart_rate", sa.Text(), nullable=True),
            sa.Column("indication", sa.Text(), nullable=True),
            sa.Column("contrast", sa.Text(), nullable=True),
            sa.Column("stress", sa.Text(), nullable=True),
            sa.Column("flow", sa.Text(), nullable=True),
            sa.Column("cmr_class", sa.Text(), nullable=True),
            sa.Column("primary_dx", sa.Text(), nullable=True),
            sa.Column("secondary_dx", sa.Text(), nullable=True),
            sa.Column("conclusions", sa.Text(), nullable=True),
            sa.Column("lv_size", sa.Text(), nullable=True),
            sa.Column("lv_function", sa.Text(), nullable=True),
            sa.Column("lvef", sa.Text(), nullable=True),
            sa.Column("lvedv", sa.Text(), nullable=True),
            sa.Column("lvesv", sa.Text(), nullable=True),
            sa.Column("lvsv", sa.Text(), nullable=True),
            sa.Column("lvedvi", sa.Text(), nullable=True),
            sa.Column("lvesvi", sa.Text(), nullable=True),
            sa.Column("lvsvi", sa.Text(), nullable=True),
            sa.Column("lv_mass", sa.Text(), nullable=True),
            sa.Column("lvmi", sa.Text(), nullable=True),
            sa.Column("max_lv_wall", sa.Text(), nullable=True),
            sa.Column("lvh", sa.Text(), nullable=True),
            sa.Column("rwma", sa.Text(), nullable=True),
            sa.Column("mapse", sa.Text(), nullable=True),
            sa.Column("pcwp", sa.Text(), nullable=True),
            sa.Column("rv_size", sa.Text(), nullable=True),
            sa.Column("rv_function", sa.Text(), nullable=True),
            sa.Column("rvef", sa.Text(), nullable=True),
            sa.Column("rvedv", sa.Text(), nullable=True),
            sa.Column("rvesv", sa.Text(), nullable=True),
            sa.Column("rvsv", sa.Text(), nullable=True),
            sa.Column("rvedvi", sa.Text(), nullable=True),
            sa.Column("rvesvi", sa.Text(), nullable=True),
            sa.Column("rvsvi", sa.Text(), nullable=True),
            sa.Column("tapse", sa.Text(), nullable=True),
            sa.Column("la_size", sa.Text(), nullable=True),
            sa.Column("la_volume", sa.Text(), nullable=True),
            sa.Column("ra_size", sa.Text(), nullable=True),
            sa.Column("rap", sa.Text(), nullable=True),
            sa.Column("d_shaped_lv", sa.Text(), nullable=True),
            sa.Column("d_shape_phase", sa.Text(), nullable=True),
            sa.Column("septal_flattening", sa.Text(), nullable=True),
            sa.Column("flattening_phase", sa.Text(), nullable=True),
            sa.Column("septal_bounce", sa.Text(), nullable=True),
            sa.Column("ias_bowing", sa.Text(), nullable=True),
            sa.Column("ias_direction", sa.Text(), nullable=True),
            sa.Column("rv_lv_ratio", sa.Text(), nullable=True),
            sa.Column("mpa_size", sa.Text(), nullable=True),
            sa.Column("lpa_size", sa.Text(), nullable=True),
            sa.Column("rpa_size", sa.Text(), nullable=True),
            sa.Column("mpa_vortex", sa.Text(), nullable=True),
            sa.Column("mpa_flow", sa.Text(), nullable=True),
            sa.Column("ph", sa.Text(), nullable=True),
            sa.Column("native_t1", sa.Text(), nullable=True),
            sa.Column("t2", sa.Text(), nullable=True),
            sa.Column("t2_star", sa.Text(), nullable=True),
            sa.Column("ecv", sa.Text(), nullable=True),
            sa.Column("lge", sa.Text(), nullable=True),
            sa.Column("fibrosis", sa.Text(), nullable=True),
            sa.Column("rv_insertion_point_lge", sa.Text(), nullable=True),
            sa.Column("lge_pattern", sa.Text(), nullable=True),
            sa.Column("lge_location", sa.Text(), nullable=True),
            sa.Column("lge_transmurality", sa.Text(), nullable=True),
            sa.Column("perfusion_defect", sa.Text(), nullable=True),
            sa.Column("inducible_ischaemia", sa.Text(), nullable=True),
            sa.Column("fixed_defect", sa.Text(), nullable=True),
            sa.Column("reversible_defect", sa.Text(), nullable=True),
            sa.Column("perfusion_territory", sa.Text(), nullable=True),
            sa.Column("perfusion_coronary_territory", sa.Text(), nullable=True),
            sa.Column("ao_forward_volume", sa.Text(), nullable=True),
            sa.Column("ao_backward_volume", sa.Text(), nullable=True),
            sa.Column("asc_aorta", sa.Text(), nullable=True),
            sa.Column("ar_rf", sa.Text(), nullable=True),
            sa.Column("ar_volume", sa.Text(), nullable=True),
            sa.Column("ar_severity", sa.Text(), nullable=True),
            sa.Column("as_severity", sa.Text(), nullable=True),
            sa.Column("ao_vmax", sa.Text(), nullable=True),
            sa.Column("ao_mean_grad", sa.Text(), nullable=True),
            sa.Column("holo_diastolic_reversal", sa.Text(), nullable=True),
            sa.Column("mr_rf", sa.Text(), nullable=True),
            sa.Column("mr_volume", sa.Text(), nullable=True),
            sa.Column("mr_severity", sa.Text(), nullable=True),
            sa.Column("tr_rf", sa.Text(), nullable=True),
            sa.Column("tr_volume", sa.Text(), nullable=True),
            sa.Column("tr_severity", sa.Text(), nullable=True),
            sa.Column("pulmonary_forward_volume", sa.Text(), nullable=True),
            sa.Column("pulmonary_backward_volume", sa.Text(), nullable=True),
            sa.Column("pr_rf", sa.Text(), nullable=True),
            sa.Column("pr_volume", sa.Text(), nullable=True),
            sa.Column("pr_severity", sa.Text(), nullable=True),
            sa.Column("qp_qs", sa.Text(), nullable=True),
            sa.Column("pericardial_effusion", sa.Text(), nullable=True),
            sa.Column("pericardial_thickening", sa.Text(), nullable=True),
            sa.Column("pericardial_inflammation", sa.Text(), nullable=True),
            sa.Column("constrictive_physiology", sa.Text(), nullable=True),
            sa.Column("thrombus", sa.Text(), nullable=True),
            sa.Column("thrombus_location", sa.Text(), nullable=True),
            sa.Column("mass", sa.Text(), nullable=True),
            sa.Column("mass_location", sa.Text(), nullable=True),
            sa.Column("congenital", sa.Text(), nullable=True),
            sa.Column("congenital_detail", sa.Text(), nullable=True),
            sa.Column("cardiac_surgery", sa.Text(), nullable=True),
            sa.Column("surgery_detail", sa.Text(), nullable=True),
            sa.Column("device_prosthesis", sa.Text(), nullable=True),
            sa.Column("extracardiac_findings", sa.Text(), nullable=True),
            sa.Column("other_extractable_text", sa.Text(), nullable=True),
            sa.Column("qc_notes", sa.Text(), nullable=True),
            sa.Column("classification_note", sa.Text(), nullable=True),
            sa.Column("status_date", sa.Text(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_extract_cmr_hn", "extract_cmr", ["hn"])

    # ------------------------------------------------------------------
    # 7. extract_cpex
    # ------------------------------------------------------------------
    if not _table_exists("extract_cpex"):
        op.create_table(
            "extract_cpex",
            sa.Column("id", sa.Text(), nullable=False),
            sa.Column("hn", sa.Text(), nullable=False),
            sa.Column("date_cpex", sa.Text(), nullable=True),
            sa.Column("source_file", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("status", sa.Text(), nullable=False, server_default="Pending"),
            sa.Column("status_date", sa.Text(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_extract_cpex_hn", "extract_cpex", ["hn"])

    # ------------------------------------------------------------------
    # 8. extract_study_recruitment
    # ------------------------------------------------------------------
    if not _table_exists("extract_study_recruitment"):
        op.create_table(
            "extract_study_recruitment",
            sa.Column("id", sa.Text(), nullable=False),
            sa.Column("hn", sa.Text(), nullable=False),
            sa.Column("patient_id", sa.Text(), nullable=True),
            sa.Column("eligible_for_study", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cohort", sa.Text(), nullable=True),
            sa.Column("contact_method", sa.Text(), nullable=True),
            sa.Column("contact_number", sa.Text(), nullable=True),
            sa.Column("email_address", sa.Text(), nullable=True),
            sa.Column("recruitment_status", sa.Text(), nullable=True),
            sa.Column("comments", sa.Text(), nullable=True),
            sa.Column("date_identified", sa.Text(), nullable=True),
            sa.Column("date_first_contact", sa.Text(), nullable=True),
            sa.Column("date_pis_sent", sa.Text(), nullable=True),
            sa.Column("date_consent", sa.Text(), nullable=True),
            sa.Column("cpex_date", sa.Text(), nullable=True),
            sa.Column("consent_to_email", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("pis_sent", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("consent_obtained", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cpex_required", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cpex_booked", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cpex_completed", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("status", sa.Text(), nullable=False, server_default="Pending"),
            sa.Column("cpex_scheduled", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cmr_required", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cmr_requested", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cmr_scheduled", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cmr_completed", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("rhc_required", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("rhc_requested", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("rhc_scheduled", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("rhc_completed", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("echo_required", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("echo_requested", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("echo_scheduled", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("echo_completed", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cpex_appropriate", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cmr_appropriate", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("rhc_appropriate", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("echo_appropriate", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("source", sa.Text(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(
                ["patient_id"],
                ["extract_patients.id"],
            ),
        )
        op.create_index(
            "ix_extract_study_recruitment_hn",
            "extract_study_recruitment",
            ["hn"],
        )


def downgrade() -> None:
    op.drop_table("extract_study_recruitment")
    op.drop_table("extract_cpex")
    op.drop_table("extract_cmr")
    op.drop_table("extract_echocardiogram")
    op.drop_table("extract_rhc")
    op.drop_table("extract_patients")
    op.drop_table("extract_sessions")
    op.drop_table("extract_access_codes")
