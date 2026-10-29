"""Scoped job orchestration; model reasoning is delegated to installed Hermes."""

import base64
import io
import json
from threading import Event, RLock, Thread
import time
import uuid
import zipfile

from . import ROLES
from .actions import ActionGate, DesktopPlan
from pydantic import BaseModel, ConfigDict, Field
from .files import FileBroker, TEXT_TYPES
from .hermes import HermesBridge, HermesUnavailable


class PlanOutline(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    summary: str = Field(min_length=1, max_length=1000)
    proposed_steps: list[str] = Field(min_length=1, max_length=12)
    needs_context: str = Field(min_length=1, max_length=2000)


PLAN_INSTRUCTIONS = """Return ONLY a JSON object with these fields:
summary (string), app (string), window (positive integer), process (positive integer),
state (observed target fingerprint string), observation ('selected_window'),
completion (string), steps (1Ã¢â‚¬â€œ12 objects).
Each step is exactly one of {action:'type_text',text:string},
{action:'press_key',key:'ENTER'|'TAB'|'ESC'|'CTRL+S'|'CTRL+A'},
{action:'click',x:integer,y:integer}. Use JSON double quotes.
If the source does not provide a real window/process/state identity, return ONLY
a JSON object with summary (string), proposed_steps (1Ã¢â‚¬â€œ12 short strings describing
the proposed workflow), and needs_context (a specific explanation of which user
selection, exact text, or destination is missing before executable planning).
Never invent window IDs or state. Describe a useful proposed workflow even when
execution context is missing. Ask for a selected app/window, not technical process IDs.
The result is a proposal; no approval or action has occurred."""

OUTLINE_INSTRUCTIONS = """Return ONLY one JSON object, with exactly these three fields:
"summary": a short string explaining the proposed workflow;
"proposed_steps": an array of 1Ã¢â‚¬â€œ12 short strings describing the proposed steps;
"needs_context": a specific string explaining which app/window selection, exact
text, or destination is needed before execution could be reviewed.
No window has been selected. Do not invent a target. No action has been approved
or executed. Give a useful proposed workflow, not instructions to run tools.
Use double-quoted valid JSON; do not use Markdown fences or additional fields."""


class WorkerHub:
    def __init__(self, db, *, bridge=None, files=None, driver=None):
        self.db, self.bridge = db, bridge or HermesBridge()
        self.files = files or FileBroker()
        self.lock, self.stops, self.images = RLock(), {}, {}
        self.closed = False
        self.completion_listeners = {}
        self.actions = ActionGate(db, driver)
        with db() as connection:
            connection.execute("""CREATE TABLE IF NOT EXISTS worker_jobs(
                id TEXT PRIMARY KEY, scope TEXT, role TEXT, status TEXT, created REAL, result TEXT)""")
            connection.execute(
                "UPDATE worker_jobs SET status='interrupted' WHERE status IN ('queued','running','stopping')"
            )

    def subscribe_completion(self,callback):
        """Trusted in-process lifecycle hook; never exposed as a worker tool."""
        key=uuid.uuid4().hex
        with self.lock:self.completion_listeners[key]=callback
        def unsubscribe():
            with self.lock:self.completion_listeners.pop(key,None)
        return unsubscribe

    def status(self):
        return dict(
            roles=ROLES,
            runtime="Installed Hermes via OpenShell",
            analysis="available on request; no tools or memory exposed",
            desktop="connected"
            if self.actions.available
            else "locked: Windows driver not verified",
            grants="read-only; expire after 15 minutes and on application exit",
            storage="Results stored locally until cleared; artifacts and grants remain in memory.",
        )

    def share_image(self, scope, path, expected_sha256):
        # Only explicit file-picker input; no clipboard or desktop capture API.
        gid = self.files.grant(scope, path)
        try:
            if not gid["file_only"]:
                raise ValueError("Choose one PNG or JPEG image.")
            found = self.files.discover(scope, gid["id"])["files"]
            if len(found) != 1:
                raise ValueError("Selected image unavailable.")
            source = self.files.read(scope, found[0]["id"], image=True)
            if source["sha256"] != expected_sha256:
                raise ValueError("Image changed after preview. Select it again.")
            from PIL import Image

            with Image.open(io.BytesIO(source["data"])) as image:
                if image.width * image.height > 16_000_000:
                    raise ValueError("Choose an image no larger than 16 megapixels.")
                clean = image.convert("RGB")
                clean.thumbnail((1600, 1600))
                output = io.BytesIO()
                clean.save(output, format="PNG")
                width, height = clean.size
            with self.lock:
                if len(self.images) >= 16:
                    raise ValueError("Clear image shares before adding more.")
                iid = uuid.uuid4().hex
                self.images[iid] = (
                    tuple(scope),
                    time.monotonic() + 900,
                    output.getvalue(),
                )
            return dict(
                id=iid,
                name=source["name"],
                width=width,
                height=height,
                expires_in=900,
                metadata_removed=True,
            )
        finally:
            self.files.revoke(scope, gid["id"])

    def clear_images(self, scope):
        with self.lock:
            self.images = {k: v for k, v in self.images.items() if v[0] != tuple(scope)}
            self._cancel_role(scope, "W33")
        return dict(cleared=True)

    def revoke_files(self, scope, gid):
        with self.lock:
            result = self.files.revoke(scope, gid)
            self._cancel_role(scope, "W35")
            return result

    def _cancel_role(self, scope, role):
        for jid, event in self.stops.items():
            try:
                job = self.get(scope, jid)
            except ValueError:
                continue
            if job["role"] == role:
                event.set()

    def _image(self, scope, iid):
        with self.lock:
            image = self.images.get(iid)
            if not image or image[0] != tuple(scope) or image[1] <= time.monotonic():
                raise ValueError(
                    "Image sharing expired or is unavailable in this task."
                )
            return "data:image/png;base64," + base64.b64encode(image[2]).decode("ascii")

    def start_chat(self, scope, message, history, model_pin):
        if not isinstance(history,list) or len(history)>12 or any(not isinstance(m,dict) or set(m)!={'role','content'} or m['role'] not in {'user','assistant'} or not isinstance(m['content'],str) for m in history):
            raise ValueError('Invalid canonical chat history.')
        if len(json.dumps(history,ensure_ascii=True).encode())>20000:raise ValueError('Chat history exceeds its context budget.')
        return self.start(scope,role='CHAT',question=message,_chat=(history,model_pin))

    def start_context(self,scope,*,role,question,context,evidence,revalidate):
        if not isinstance(context,str) or len(context.encode())>24000 or not callable(revalidate):raise ValueError('Context exceeds the bounded worker adapter.')
        return self.start(scope,role=role,question=question,_provided=(context,evidence,revalidate))

    def start(self, scope, *, role, question, reference=None, image=None, context="", _chat=None,_provided=None):
        from wayfinder.platform.worker_bindings import SOURCE_ROLES,instructions
        if role not in ({"W33", "W35", "W36"}|SOURCE_ROLES) and not (role=="CHAT" and _chat is not None):
            raise ValueError(
                "Choose an analysis/planning worker; discovery and approved actions have separate routes."
            )
        if not isinstance(question, str) or not 1 <= len(question.strip()) <= 4000:
            raise ValueError("Enter a question of 1Ã¢â‚¬â€œ4000 characters.")
        if not isinstance(context, str) or len(context) > 12000:
            raise ValueError("Observation context exceeds its limit.")
        payload = dict(role=role, question=question, context=context)
        if role=="CHAT":payload.update(history=_chat[0],model_pin=_chat[1])
        evidence = None
        if _provided is not None:
            if role not in SOURCE_ROLES|{'W35'}:raise ValueError('No context adapter for this role.')
            _provided[2]();payload['context']=_provided[0];evidence=_provided[1]
        if role in SOURCE_ROLES:
            if not reference and _provided is None:raise ValueError("Choose a scoped source for this worker.")
            payload["instructions"]=instructions(role)
            payload["structured"]=True
        if (role == "W35" or role in SOURCE_ROLES) and _provided is None:
            selected = self.files.read(scope, reference)
            evidence = dict(source=selected["source"], sha256=selected["sha256"])
            if selected["extension"] in TEXT_TYPES:
                decoded = selected["data"].decode("utf-8-sig")
                if "\x00" in decoded:
                    raise ValueError("This file is not readable UTF-8 text.")
                lines = decoded.splitlines()
                content = "\n".join(f"{i}: {line}" for i, line in enumerate(lines, 1))
                payload["context"] = selected["source"] + "\n" + content[:60000]
                evidence["truncated"] = len(content) > 60000
            else:
                if selected["extension"] in {".docx", ".xlsx"}:
                    with zipfile.ZipFile(io.BytesIO(selected["data"])) as archive:
                        entries = archive.infolist()
                        if (
                            len(entries) > 500
                            or sum(item.file_size for item in entries)
                            > 20 * 1024 * 1024
                            or any(
                                item.file_size > 8 * 1024 * 1024 or item.flag_bits & 1
                                for item in entries
                            )
                        ):
                            raise ValueError(
                                "Document archive exceeds safe extraction limits."
                            )
                payload["source"] = selected["source"]
                payload["document"] = dict(
                    extension=selected["extension"],
                    data=base64.b64encode(selected["data"]).decode("ascii"),
                )
        if role == "W33":
            payload["image"] = self._image(scope, image)
        if role == "W36":
            payload["instructions"] = (
                PLAN_INSTRUCTIONS if context.strip() else OUTLINE_INSTRUCTIONS
            )
        with self.lock:
            if self.closed or len(self.stops) >= 2:
                raise ValueError("Workers are stopped or two runs are already active.")
            jid = uuid.uuid4().hex
            cancelled = Event()
            self.stops[jid] = cancelled
            with self.db() as connection:
                connection.execute(
                    "INSERT INTO worker_jobs VALUES (?,?,?,'queued',?,NULL)",
                    (jid, json.dumps(scope), role, time.time()),
                )
            Thread(
                target=self._run,
                args=(scope, jid, payload, cancelled, evidence, reference, image,_provided[2] if _provided else None),
                daemon=True,
            ).start()
        return self.get(scope, jid)

    def _run(self, scope, jid, payload, cancelled, evidence, reference, image,revalidate=None):
        phase='dispatch'
        try:
            self._finish(jid, "running")
            phase='model_transport'
            result = self.bridge.run(payload, cancelled)
            phase='output_validation'
            from wayfinder.platform.worker_bindings import SOURCE_ROLES,validate_output
            if payload["role"] in SOURCE_ROLES:
                result["structured"]=validate_output(payload["role"],result["text"])
                result["definition_binding"]="hermes.definition/1"
            if payload["role"] == "W36":
                answer = result["text"].strip()
                if answer.startswith("```json\n") and answer.endswith("```"):
                    answer = answer[8:-3].strip()
                raw = json.loads(answer)
                if (
                    isinstance(raw, dict)
                    and set(raw) == {"needs_context"}
                    and isinstance(raw["needs_context"], str)
                ):
                    result = dict(
                        needs_context=raw["needs_context"][:2000], executed=False
                    )
                elif isinstance(raw, dict) and "proposed_steps" in raw:
                    outline = PlanOutline.model_validate(raw)
                    if any(
                        not step.strip() or len(step) > 1000
                        for step in outline.proposed_steps
                    ):
                        raise ValueError("Planning step exceeds its limit.")
                    result = dict(
                        outline=outline.model_dump(),
                        needs_context=outline.needs_context,
                        executed=False,
                    )
                else:
                    plan = DesktopPlan.model_validate(raw)
                    result = dict(
                        plan=plan.model_dump(),
                        executed=False,
                        note="Review required. Model output is not an observation or authorization.",
                    )
            if evidence:
                result["evidence"] = evidence
            with self.lock:
                phase='source_revalidation'
                if revalidate:revalidate()
                if reference:
                    self.files.check_reference(scope, reference)
                if image:
                    self._image(scope, image)
                if cancelled.is_set() or self.closed:
                    self._finish(jid, "stopped")
                else:
                    phase='result_storage'
                    self._finish(jid, "completed", result)
        except Exception as error:
            self._finish(
                jid,
                "stopped" if cancelled.is_set() else "failed",
                dict(
                    failure_type=type(error).__name__,
                    phase=phase,
                    error=(
                        str(error)
                        if isinstance(error, HermesUnavailable)
                        else "Analysis unavailable, revoked, or invalid. No desktop action or memory write occurred."
                    )
                ),
            )
        finally:
            with self.lock:
                self.stops.pop(jid, None)
                listeners=list(self.completion_listeners.values())
            # Notify after releasing the hub lock: coordinators may admit the
            # next finite step through this same bounded worker lifecycle.
            for callback in listeners:
                try:callback(scope,jid)
                except Exception:pass  # Persisted state remains observable; no replay.

    def _finish(self, jid, status, result=None):
        with self.db() as connection:
            connection.execute(
                "UPDATE worker_jobs SET status=?,result=? WHERE id=?",
                (
                    status,
                    json.dumps(result, ensure_ascii=False) if result else None,
                    jid,
                ),
            )

    def get(self, scope, jid):
        with self.db() as connection:
            row = connection.execute(
                "SELECT * FROM worker_jobs WHERE id=? AND scope=?",
                (jid, json.dumps(scope)),
            ).fetchone()
        if not row:
            raise ValueError("Run unavailable in this task.")
        return dict(
            id=row[0],
            role=row[2],
            status=row[3],
            created=row[4],
            result=json.loads(row[5]) if row[5] else None,
        )

    def list(self, scope):
        with self.db() as connection:
            ids = [
                r[0]
                for r in connection.execute(
                    "SELECT id FROM worker_jobs WHERE scope=? ORDER BY created DESC LIMIT 30",
                    (json.dumps(scope),),
                )
            ]
        return [self.get(scope, jid) for jid in ids]

    def cancel(self, scope, jid):
        with self.lock:
            current = self.get(scope, jid)
            event = self.stops.get(jid)
            if event and current["status"] in {"queued", "running", "stopping"}:
                event.set()
                self._finish(jid, "stopping")
                return self.get(scope, jid)
            return current

    def forget(self, scope, jid):
        with self.lock:
            current = self.get(scope, jid)
            if current["status"] in {"queued", "running", "stopping"}:
                raise ValueError("Stop the worker before clearing its result.")
            with self.db() as connection:
                connection.execute("DELETE FROM worker_jobs WHERE id=?", (jid,))
        return dict(cleared=True)

    def close(self):
        with self.lock:
            self.closed = True
            for event in self.stops.values():
                event.set()
            self.completion_listeners.clear()
            self.images.clear()
            self.files.clear()
