FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml ./

RUN python -m pip install --upgrade pip && \
    python -c "import tomllib, subprocess; deps = tomllib.load(open('pyproject.toml', 'rb')).get('project', {}).get('dependencies', []); subprocess.check_call(['python', '-m', 'pip', 'install', '--no-cache-dir', *deps])"

COPY src ./src

RUN python -m pip install --no-cache-dir --no-deps .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn research_os.api.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
