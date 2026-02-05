FROM python:3.11-slim

# Install uv
RUN pip install --no-cache-dir uv

# Set working directory
WORKDIR /app

# Copy project files
COPY pyproject.toml uv.lock ./

# Install dependencies
RUN uv sync --frozen

# Install Playwright browser
RUN uv run playwright install --with-deps chromium

# Copy source code
COPY src/ ./src/

# Run the application
CMD ["uv", "run", "python", "-m", "src.main"]
