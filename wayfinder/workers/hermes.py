"""Bounded transport to the existing OpenShell-managed Hermes installation."""

import base64
import json
import os
from pathlib import Path
import subprocess
import threading
import time


class HermesUnavailable(RuntimeError):
    pass


class HermesBridge:
    def __init__(self, *, command=None, timeout=110):
        self.native_root = os.environ.get("WAYFINDER_HERMES_ROOT")
        native_python = os.environ.get("WAYFINDER_HERMES_PYTHON")
        if bool(self.native_root) != bool(native_python):
            raise HermesUnavailable("The private Hermes runtime installation is incomplete.")
        self.command = command or ([native_python, "-I", "-"] if native_python else [
            "wsl.exe",
            "-d",
            "Ubuntu-24.04",
            "-u",
            "assistant",
            "--",
            "/home/assistant/.local/bin/openshell",
            "sandbox",
            "exec",
            "-n",
            "ai-assistant",
            "--no-tty",
            "--timeout",
            "100",
            "--",
            "/opt/hermes/.venv/bin/python",
            "-",
        ])
        self.timeout = timeout
        raw = os.environ.get("WAYFINDER_PRIVATE_MODEL_ROUTE")
        self._route = json.loads(raw) if raw else None

    def prepare_source(self, source):
        if not self.native_root:
            return source
        # This root comes only from the owned desktop bootstrap, never an API task.
        return ("HERMES_ROOT = " + repr(self.native_root) + "\n"
                "import os,sys,tempfile,atexit\n"
                "_profile=tempfile.TemporaryDirectory(prefix='wayfinder-runtime-')\n"
                "atexit.register(_profile.cleanup)\n"
                "os.environ.update(HERMES_HOME=_profile.name,HERMES_IGNORE_RULES='1',HERMES_SAFE_MODE='1')\n"
                "sys.path.insert(0,HERMES_ROOT)\n" + source)

    def run(self, payload, cancelled=None):
        if payload.get('role')=='CHAT':
            from .opencode import OpenCodeBridge
            return OpenCodeBridge(route=self._route,timeout=self.timeout).run(payload,cancelled)
        cancelled = cancelled or threading.Event()
        script = (
            Path(__file__).with_name("hermes_runner.py").read_text(encoding="utf-8")
        )
        # The request is data, never shell code or command-line interpolation.
        encoded = base64.b64encode(
            json.dumps(dict(payload, **({"_trusted_route":self._route} if self._route else {})), allow_nan=False).encode()
        ).decode("ascii")
        source = self.prepare_source("REQUEST_B64 = " + repr(encoded) + "\n" + script)
        if cancelled.is_set():
            raise HermesUnavailable("Worker stopped.")
        try:
            process = subprocess.Popen(
                self.command,
                env={k:v for k,v in os.environ.items() if not k.startswith(("FALKORDB_","WAYFINDER_"))},
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=(
                    subprocess.CREATE_NO_WINDOW if __import__("os").name == "nt" else 0
                ),
            )
        except OSError as error:
            raise HermesUnavailable(
                "The installed Hermes sandbox is unavailable. Start Ubuntu/OpenShell."
            ) from error
        deadline = time.monotonic() + self.timeout
        outgoing = source.encode("utf-8")
        try:
            while True:
                if cancelled.is_set() or time.monotonic() > deadline:
                    process.kill()
                    process.communicate()
                    raise HermesUnavailable(
                        "Worker stopped or timed out; no result is confirmed."
                    )
                try:
                    output, _ = process.communicate(input=outgoing, timeout=0.2)
                    break
                except subprocess.TimeoutExpired:
                    outgoing = None
            if process.returncode:
                raise HermesUnavailable(
                    "Hermes could not complete this bounded worker run."
                )
            marker = b"WAYFINDER_WORKER_RESULT="
            lines = [
                line[len(marker) :]
                for line in output.splitlines()
                if line.startswith(marker)
            ]
            if len(lines) != 1 or len(lines[0]) > 400000:
                raise HermesUnavailable("Hermes returned an invalid worker response.")
            result = json.loads(lines[0])
            if not result.get("ok") or result.get("effective_tools") != []:
                raise HermesUnavailable(
                    result.get("error", "Worker tool isolation failed.")
                    + " "
                    + json.dumps(result.get("diagnostic", {}))
                )
            return result
        finally:
            if process.poll() is None:
                process.kill()
                process.communicate()
