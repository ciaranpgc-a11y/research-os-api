from research_os.services.manuscript_service import draft_methods_from_notes


if __name__ == "__main__":
    notes = """
Systematic review of paired LGE-CMR and invasive coronary angiography.
Databases: PubMed, Embase, CENTRAL.
Two independent reviewers.
Primary outcome: residual prevalence of obstructive CAD in scar-negative patients.
Random-effects meta-analysis using REML with Hartung-Knapp adjustment.
"""

    print(draft_methods_from_notes(notes))
