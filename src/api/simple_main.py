"""Simple health check for Railway deployment testing."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI(
    title="PROJETUS API",
    description="Transfer Gov Automation - Health Check Endpoints",
    version="1.0.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Simple health check that always returns 200."""
    return {
        "status": "healthy",
        "message": "Service is running",
        "port": os.getenv("PORT", "not_set"),
    }


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "PROJETUS API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
        },
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
