from __future__ import annotations

import os
import platform
import sys
import traceback
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LOG_PATH = ROOT / "backend-dev-launcher.log"
ERR_PATH = ROOT / "backend-dev-launcher.err.log"


def main() -> None:
    os.chdir(ROOT)
    sys.path.insert(0, str(ROOT / "src"))

    # Python 3.12 on this Windows machine is hanging in platform._wmi_query()
    # during SQLAlchemy import. Pin machine() from env to avoid the WMI call.
    arch = os.environ.get("PROCESSOR_ARCHITECTURE", "AMD64")
    platform.machine = lambda: arch  # type: ignore[assignment]

    with LOG_PATH.open("a", encoding="utf-8") as stdout, ERR_PATH.open(
        "a", encoding="utf-8"
    ) as stderr:
        sys.stdout = stdout
        sys.stderr = stderr

        print("Starting backend launcher", flush=True)

        try:
            import uvicorn

            uvicorn.run(
                "research_os.api.app:app",
                host="127.0.0.1",
                port=8000,
                log_level="info",
                reload=False,
            )
        except Exception:
            traceback.print_exc(file=stderr)
            stderr.flush()
            raise


if __name__ == "__main__":
    main()
