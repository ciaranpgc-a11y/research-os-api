FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml ./

RUN python -m pip install --upgrade pip && \
    python -c "import tomllib, subprocess; deps = tomllib.load(open('pyproject.toml', 'rb')).get('project', {}).get('dependencies', []); subprocess.check_call(['python', '-m', 'pip', 'install', '--no-cache-dir', *deps])"

COPY src ./src
COPY alembic.ini ./
COPY alembic ./alembic

RUN python -m pip install --no-cache-dir --no-deps . && \
    python -c "import research_os.api.app; import research_os.services.citation_service; import research_os.services.section_planning_service; import research_os.services.claim_linker_service; import research_os.services.grounded_draft_service; import research_os.services.consistency_service; import research_os.services.paragraph_regeneration_service; import research_os.services.title_abstract_service; import research_os.services.submission_pack_service"

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn research_os.api.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
