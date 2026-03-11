FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

COPY pyproject.toml ./
COPY scripts/oa-browser-fetch/package.json ./scripts/oa-browser-fetch/package.json

RUN apt-get update && \
    apt-get install -y --no-install-recommends nodejs npm && \
    npm install --prefix ./scripts/oa-browser-fetch && \
    npx --prefix ./scripts/oa-browser-fetch playwright install --with-deps chromium && \
    rm -rf /var/lib/apt/lists/*

RUN python -m pip install --upgrade pip && \
    python -c "import tomllib, subprocess; deps = tomllib.load(open('pyproject.toml', 'rb')).get('project', {}).get('dependencies', []); subprocess.check_call(['python', '-m', 'pip', 'install', '--no-cache-dir', *deps])"

COPY src ./src
COPY alembic.ini ./
COPY alembic ./alembic
COPY scripts/oa-browser-fetch ./scripts/oa-browser-fetch

RUN python -m pip install --no-cache-dir --no-deps . && \
    python -c "import research_os.api.app; import research_os.services.citation_service; import research_os.services.section_planning_service; import research_os.services.claim_linker_service; import research_os.services.grounded_draft_service; import research_os.services.consistency_service; import research_os.services.paragraph_regeneration_service; import research_os.services.title_abstract_service; import research_os.services.submission_pack_service"

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn research_os.api.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
