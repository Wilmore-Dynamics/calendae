FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir -e . || pip install --no-cache-dir \
    fastapi uvicorn[standard] sqlalchemy psycopg2-binary \
    python-multipart pydantic-settings \
    "python-jose[cryptography]" "passlib[bcrypt]" "bcrypt>=3.2.0,<4.0.0"

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
