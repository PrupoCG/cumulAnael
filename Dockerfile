FROM python:3.12-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy project files
COPY pyproject.toml ./
COPY api/ ./api/
COPY scripts/ ./scripts/
COPY entrypoint.sh ./

# Seed data (Excel intégré à l'image)
COPY seed/ ./data/

# Install dependencies
RUN uv sync --no-dev

# Generate DuckDB at build time
RUN uv run python scripts/load_suivi_mun.py

EXPOSE 8001

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uv", "run", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8001"]
