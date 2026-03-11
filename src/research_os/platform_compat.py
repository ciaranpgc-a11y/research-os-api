from __future__ import annotations

import os
import platform
import sys


def patch_windows_platform_machine() -> None:
    """Avoid Windows WMI stalls during early dependency imports.

    On some Windows environments, ``platform.machine()`` and
    ``platform.system()`` can block while querying WMI. SQLAlchemy and the
    OpenAI SDK both call those functions during import/request setup, so use
    stable Windows values first when available.
    """

    if not sys.platform.startswith("win"):
        return

    current_machine = platform.machine
    current_uname = platform.uname
    if getattr(current_uname, "__module__", "") == __name__:
        return

    def _fast_windows_machine() -> str:
        for env_name in ("PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER"):
            value = os.getenv(env_name, "").strip()
            if value:
                return value
        return current_machine()

    def _fast_windows_uname() -> platform.uname_result:
        machine = _fast_windows_machine()
        node = (
            os.getenv("COMPUTERNAME", "").strip()
            or os.getenv("HOSTNAME", "").strip()
            or "localhost"
        )
        return platform.uname_result(
            system="Windows",
            node=node,
            release="",
            version="",
            machine=machine,
        )

    def _fast_windows_system() -> str:
        return _fast_windows_uname().system

    def _fast_windows_platform(
        aliased: bool = False, terse: bool = False
    ) -> str:
        _ = aliased
        _ = terse
        uname = _fast_windows_uname()
        return f"{uname.system}-{uname.machine}"

    platform.uname = _fast_windows_uname
    platform.machine = _fast_windows_machine
    platform.system = _fast_windows_system
    platform.platform = _fast_windows_platform
