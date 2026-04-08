FROM python:3.12-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy project files
COPY pyproject.toml ./
COPY api/ ./api/
COPY scripts/ ./scripts/

# Install dependencies
RUN uv sync --no-dev

# Data volume (mount at runtime)
RUN mkdir -p /app/data

EXPOSE 8001

CMD ["uv", "run", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8001"]
