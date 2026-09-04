"""Modal deployment wrapper — serves the existing FastAPI app in backend.py remotely."""
import os
import modal

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "agno>=1.0",
        "openai>=1.50",
        "fastapi>=0.110",
        "python-dotenv>=1.0",
        "pydantic>=2.0",
        "httpx>=0.27",
    )
    .add_local_file("backend.py", "/root/backend.py")
    .add_local_dir("frontend", "/root/frontend")
)

app = modal.App("live-agent", image=image)


@app.function(
    secrets=[modal.Secret.from_name("live-agent-env"), modal.Secret.from_name("elevenlabs-key")],
)
@modal.asgi_app()
def serve():
    os.chdir("/root")  # backend.py serves StaticFiles("frontend") relative to cwd
    import backend
    return backend.app
