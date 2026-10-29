"""Private owned-process adapter over the existing authenticated Wayfinder API.

No replacement engine/agent/scheduler. Stdio is only inherited by Electron main;
the renderer gets named intents, never this transport or the API bearer token.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import redirect_stdout
import hashlib
import hmac
import uuid
import json
import os
from pathlib import Path
import sys
from threading import Lock

TASK = "general"
MAX_FRAME = 65536
MARKER = "WAYFINDER_DESKTOP="
# Build inclusion is shared with navigation/preload/main, never supplied by a worker.
manifest_path = Path(__file__).with_name('FEATURES.json')
if not manifest_path.exists():
    manifest_path = Path(__file__).parent.parent / 'FEATURES.json'
RELEASE = json.loads(manifest_path.read_text(encoding='utf-8'))
if RELEASE.get('schema') != 'wayfinder.desktop-inclusion/v1' or RELEASE.get('variant') != 'workspace-parity':
    raise RuntimeError('Unsupported desktop inclusion manifest.')
RELEASE_HASH = hashlib.sha256(json.dumps(RELEASE, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
ALLOWED = frozenset(RELEASE['backend_operations'])


class Session:
    def __init__(self, runtime, factory=None):
        self.runtime = Path(runtime).resolve()
        self.factory = factory
        self.generation = uuid.uuid4().hex
        self.service = self.server = self.client = None
        self.lifecycle = Lock()

    def start(self):
        with self.lifecycle:
            if self.service is not None:
                return self.describe()
            from wayfinder.api import Client, serve
            from wayfinder.runtime import open_service

            service = open_service(self.runtime, self.factory) if self.factory else open_service(self.runtime)
            server = None
            try:
                server = serve(service)
                client = Client(server.server_port, service.token)
                status = client.call("status")
                if status.get("contract") != "wayfinder_memory_v2":
                    raise ValueError("Unsupported backend contract. No desktop operation was enabled.")
            except Exception:
                try:
                    if server is not None:
                        server.shutdown()
                        server.server_close()
                finally:
                    service.close()
                raise
            self.service, self.server, self.client = service, server, client
            return self.describe()

    def require(self):
        if self.service is None or self.service.closed:
            raise ValueError("Backend is offline. Start the configured database and retry connection.")

    def describe(self):
        self.require()
        current = self.service.platform.inspector.current()
        return dict(
            state="ready", version=RELEASE["version"], backend=self.client.call("status"),
            release=dict(schema=RELEASE["schema"], variant=RELEASE["variant"], sha256=RELEASE_HASH),
            instance_generation=self.generation,
            runtime=str(self.runtime), owner=self.service.owner,
            capabilities=dict(
                memory=True, files=True, activity_csv=True,
                documents=bool(current.get("compatible")),
                comparison=bool(current.get("compatible")),
                git_branch=bool(self.service.platform.connectors.git.available),
                general_chat=bool(current.get("compatible") and self.service.chat.approved_model and current.get("isolation",{}).get("model_info")==self.service.chat.approved_model), google_live=self.service.platform.connections.qualified('google'), tavily_search=self.service.platform.connections.qualified('tavily'), notion_read=self.service.platform.connections.qualified('notion'), scheduler=False,
                workflow_builder=False, local_tasks=False, native_desktop=False,
            ),
            runtime_inspection=current,
        )

    def snapshot(self, body):
        """Read-only list facade missing from the API; never another state store."""
        self.require()
        if set(body) != {"space"} or not isinstance(body["space"], str):
            raise ValueError("Choose one owned space.")
        who = self.service.authenticate(self.service.token)
        self.service.space(who, body["space"])
        scope = (who.owner, body["space"], TASK)
        from wayfinder.platform.contracts import Scope
        from wayfinder.platform.service import encode

        encoded = encode(Scope(owner=scope[0], space=scope[1], task=scope[2]).model_dump())
        with self.service.db() as db:
            workflows = db.execute(
                "SELECT * FROM platform_workflows WHERE scope=? ORDER BY created DESC LIMIT 60", (encoded,)
            ).fetchall()
            # ActionGate persists tuple scope using the existing JSON representation.
            actions = []
            for table, kind in (("memory_actions", "memory"), ("connector_actions", "git")):
                rows = db.execute(
                    f"SELECT id FROM {table} WHERE scope=? ORDER BY rowid DESC LIMIT 60", (json.dumps(scope),)
                ).fetchall()
                getter = self.service.platform.memory.actions if kind == "memory" else self.service.platform.connectors.actions
                actions.extend(dict(getter.get(scope, row["id"]), kind=kind) for row in rows)
        return dict(
            workflows=[self.service.platform._public(row) for row in workflows],
            actions=actions,
            jobs=self.client.call("worker_jobs", space=body["space"], task=TASK),
            metrics=self.client.call("platform_workflow_metrics", space=body["space"], task=TASK, limit=60),
        )

    def call(self, operation, body):
        if not isinstance(body, dict):
            raise ValueError("Request must be an object.")
        if operation == "boot":
            if body:
                raise ValueError("Boot has no caller-controlled configuration.")
            return self.start()
        if operation == 'connections_configure':
            self.require()
            if set(body)!={'connections'}:raise ValueError('Invalid private connection bootstrap.')
            return self.service.platform.connections.configure(body['connections'])
        if operation == "describe":
            if body:
                raise ValueError("Status has no inputs.")
            return self.describe()
        if operation == "snapshot":
            return self.snapshot(body)
        if operation == "retry_details":
            self.require()
            if set(body) != {"space", "id"}:
                raise ValueError("Choose one original scoped read attempt.")
            who = self.service.authenticate(self.service.token)
            self.service.space(who, body["space"])
            from wayfinder.platform.contracts import Scope
            row = self.service.platform._row(Scope(owner=who.owner, space=body["space"], task=TASK), body["id"])
            original = json.loads(row["body"])
            if not original.get("question") or not original.get("context"):
                raise ValueError("Original read input is unavailable. No retry was dispatched.")
            return dict(question=original["question"], context=original["context"])
        if operation not in ALLOWED:
            raise ValueError("Operation is not included in this desktop build.")
        self.require()
        if operation == "worker_start" and body.get("role") != "W35":
            raise ValueError("Only the qualified document-analysis binding is included.")
        if operation == "settings" and "value" in body and body["value"].get("background") is not False:
            raise ValueError("Background execution is not included.")
        if operation in {"worker_start", "platform_read_start", "platform_read_retry"}:
            self.service.platform.inspector.require()
        # A pending unknown effect blocks another same-family proposal. Observe
        # or reconcile the original; a new request ID must not bypass this UI gate.
        if operation in {"platform_memory_propose", "platform_git_propose"}:
            who = self.service.authenticate(self.service.token)
            self.service.space(who, body.get("space"))
            table = "memory_actions" if operation == "platform_memory_propose" else "connector_actions"
            with self.service.db() as db:
                pending = db.execute(
                    f"SELECT 1 FROM {table} WHERE scope=? AND status IN ('executing','outcome_unknown') LIMIT 1",
                    (json.dumps((who.owner, body["space"], TASK)),),
                ).fetchone()
            if pending:
                raise ValueError("This operation has an unresolved outcome. Inspect and reconcile its original receipt first.")
        return self.client.call(operation, **body)

    def close(self):
        with self.lifecycle:
            if self.server:
                self.server.shutdown()
                self.server.server_close()
            if self.service:
                self.service.close()
            self.service = self.server = self.client = None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--runtime", required=True)
    parser.add_argument('--diagnose',choices=['memory','hermes'])
    args = parser.parse_args()
    sys.path.insert(0, str(Path(args.project).resolve()))
    if args.diagnose:
        with redirect_stdout(sys.stderr):
            if args.diagnose=='memory':
                from memory.embeddings.embedder import get_embedder
                vector=get_embedder(cache_dir=os.environ.get('WAYFINDER_MODELS_ROOT'),use_gpu=False).embed_single('Wayfinder first-run memory check')
                report=dict(ready=len(vector)==384,model='BAAI/bge-small-en-v1.5',dimensions=len(vector))
            else:
                from wayfinder.platform.runtime import RuntimeInspector
                result=RuntimeInspector().inspect()
                report=dict(ready=bool(result.get('compatible') and result.get('isolation',{}).get('supports_history')),version=result.get('runtime',{}).get('version'),tools=result.get('isolation',{}).get('effective_tools'),memory=result.get('isolation',{}).get('memory'),model_info=result.get('isolation',{}).get('model_info'))
                if report['ready'] and os.environ.get('WAYFINDER_PRIVATE_MODEL_ROUTE'):
                    from wayfinder.workers.hermes import HermesBridge
                    check=HermesBridge().run(dict(role='CHAT',model_pin=report['model_info'],history=[],question='This is a connection test. Reply with OK.'))
                    report['ready']=bool(check.get('ok') and check.get('text'))
                    report['key_verified']=report['ready']
        print('WAYFINDER_DIAGNOSTIC='+json.dumps(report));return
    secret = os.environ.pop("WAYFINDER_HOST_SECRET", "")
    if len(secret) < 32:
        raise SystemExit("Owned bootstrap required.")
    session, output_lock = Session(args.runtime), Lock()
    output = sys.stdout
    # Third-party diagnostic output must not become protocol data.
    sys.stdout = sys.stderr
    if os.environ.get("WAYFINDER_DIAG_THREADS") == "1":
        import faulthandler
        faulthandler.dump_traceback_later(20, repeat=True, file=sys.stderr)

    # Windows native numerical DLL initialization must happen on the owned
    # Python process's main thread. Importing NumPy first inside a pool worker
    # can deadlock the DLL loader; the Electron renderer is a different process
    # and remains responsive throughout this bootstrap.
    from wayfinder.api import wire
    from wayfinder.service import AccessDenied, StaleContext
    from wayfinder.runtime import open_service  # noqa: F401 -- preloads the existing native runtime
    from memory.vector_store.qdrant_store import QdrantVectorStore  # noqa: F401 -- Windows native bootstrap
    from fastembed import TextEmbedding  # noqa: F401 -- native ONNX modules, no model download

    def respond(message):
        raw = json.dumps(message, ensure_ascii=True, allow_nan=False)
        if len((MARKER + raw + '\n').encode('utf-8')) > MAX_FRAME:
            raw = json.dumps(dict(id=message.get("id"), ok=False, error="Result exceeds desktop display limit. Narrow the request."))
        with output_lock:
            output.write(MARKER + raw + "\n")
            output.flush()

    def handle(request):
        rid = request.get("id")
        try:
            with redirect_stdout(sys.stderr):
                data = session.call(request.get("operation"), request.get("body"))
            respond(dict(id=rid, ok=True, data=wire(data)))
        except (ValueError, TypeError) as error:
            # API schema errors are already normalized; do not expose pydantic inputs.
            message = str(error) if type(error) is ValueError or isinstance(error, (AccessDenied, StaleContext)) else "Invalid request schema."
            respond(dict(id=rid, ok=False, error=message[:600]))
        except Exception:
            if request.get("operation") == "boot":
                # Private owned-process diagnostics, never returned to the UI.
                import traceback
                traceback.print_exc(file=sys.stderr)
            respond(dict(id=rid, ok=False, error="Backend unavailable or outcome unconfirmed. Check storage/runtime status; execution was not retried."))

    pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="desktop-api")
    try:
        while True:
            line = sys.stdin.buffer.readline(MAX_FRAME + 1)
            if not line:
                break
            if len(line) > MAX_FRAME or not line.endswith(b"\n"):
                break
            try:
                request = json.loads(line)
                if not isinstance(request, dict) or not hmac.compare_digest(str(request.get("secret", "")), secret):
                    break
                if set(request) != {"id", "secret", "operation", "body"} or not isinstance(request["id"], str):
                    break
                if request["operation"] == "shutdown":
                    break
                pool.submit(handle, request)
            except (ValueError, UnicodeError):
                break
    finally:
        pool.shutdown(wait=True, cancel_futures=True)
        session.close()


if __name__ == "__main__":
    main()
