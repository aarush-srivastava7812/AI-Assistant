"""Inspect the installed runtime through the existing bridge; never trust registry labels."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
from threading import RLock
import time

from wayfinder.workers.hermes import HermesBridge


class RuntimeInspector:
    def __init__(self, bridge=None, *, clock=time.time):
        self.bridge, self.clock = bridge or HermesBridge(), clock
        self.snapshot = None
        self.lock = RLock()

    def inspect(self):
        with self.lock:
            source = (
                Path(__file__).with_name("runtime_probe.py").read_text(encoding="utf-8")
            )
            self.snapshot = None  # Failed refresh cannot leave stale evidence usable.
            process = subprocess.run(
                self.bridge.command,
                env={k:v for k,v in os.environ.items() if not k.startswith(("FALKORDB_","WAYFINDER_"))},
                input=self.bridge.prepare_source(source) if hasattr(self.bridge,'prepare_source') else source,
                text=True,
                capture_output=True,
                timeout=105,
                encoding="utf-8",
                creationflags=subprocess.CREATE_NO_WINDOW
                if __import__("os").name == "nt"
                else 0,
            )
            lines = [
                line.removeprefix("WAYFINDER_RUNTIME=")
                for line in process.stdout.splitlines()
                if line.startswith("WAYFINDER_RUNTIME=")
            ]
            if process.returncode or len(lines) != 1 or len(lines[0]) > 300000:
                raise ValueError(
                    "Installed Hermes inspection failed; no capability is qualified."
                )
            runtime = json.loads(lines[0])
            required = {
                "enabled_toolsets",
                "disabled_toolsets",
                "skip_memory",
                "session_db",
                "request_overrides",
                "run_budget_seconds",
            }
            compatible = required <= set(runtime["agent_parameters"])
            isolation = self.bridge.run(dict(role="probe")) if compatible else {}
            qualified = (
                compatible
                and isolation.get("ok") is True
                and isolation.get("effective_tools") == []
                and isolation.get("memory") is False
            )
            body = dict(
                contract="wayfinder.platform/1",
                runtime=runtime,
                isolation=isolation,
                compatible=bool(qualified),
            )
            fingerprint = hashlib.sha256(
                json.dumps(body, sort_keys=True).encode()
            ).hexdigest()
            self.snapshot = dict(
                body,
                fingerprint=fingerprint,
                observed=self.clock(),
                expires=self.clock() + 300,
            )
            return self.current()

    def current(self):
        with self.lock:
            if not self.snapshot or self.snapshot["expires"] <= self.clock():
                return dict(compatible=False, state="inspection_required")
            return json.loads(json.dumps(self.snapshot))

    def require(self, fingerprint=None):
        current = self.current()
        if not current.get("compatible") or (
            fingerprint and current["fingerprint"] != fingerprint
        ):
            raise ValueError("Runtime is unavailable, changed, or requires inspection.")
        return current
