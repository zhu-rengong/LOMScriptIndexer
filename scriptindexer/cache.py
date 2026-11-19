import gzip
import hashlib
import os
import time
import zlib
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import msgspec

from . import interpreter
from .console import Reporter
from .game.lua_bindings import LUA_BINDINGS
from .jsonio import write_bytes
from .paths import ANALYSIS_CACHE_PATH
from .schema import schema_digest
from .script_model import ScriptAnalysis

STAGE_ANALYSIS = "semantic analysis"
CORPUS_FINGERPRINT = "corpus"


class CacheCorrupted(Exception):
    pass


@dataclass(frozen=True)
class CacheStamp:
    version: str
    fingerprint: str


class CacheEnvelope(msgspec.Struct):
    version: str = ""
    fingerprint: str = ""
    data: bytes = b""


class CacheStore:
    def __init__(self, path: Path, stamp: CacheStamp) -> None:
        self.path = path
        self.stamp = stamp

    def load[T](self, model: type[T]) -> T | None:
        try:
            raw = self.path.read_bytes()
        except OSError:
            return None
        try:
            payload = gzip.decompress(raw)
        except (OSError, EOFError, zlib.error) as exc:
            raise CacheCorrupted(f"{self.path.name} is not a readable cache") from exc
        try:
            envelope = msgspec.msgpack.decode(payload, type=CacheEnvelope)
        except msgspec.DecodeError as exc:
            raise CacheCorrupted(f"{self.path.name} does not match the current schema") from exc
        if envelope.version != self.stamp.version:
            return None
        if envelope.fingerprint != self.stamp.fingerprint:
            return None
        try:
            return msgspec.msgpack.decode(envelope.data, type=model)
        except msgspec.DecodeError as exc:
            raise CacheCorrupted(f"{self.path.name} holds unreadable data") from exc

    def save(self, payload: Any) -> int:
        envelope = CacheEnvelope(
            version=self.stamp.version,
            fingerprint=self.stamp.fingerprint,
            data=msgspec.msgpack.encode(payload),
        )
        compressed = gzip.compress(msgspec.msgpack.encode(envelope), compresslevel=6, mtime=0)
        return write_bytes(self.path, compressed)


class AnalysisEntry(msgspec.Struct):
    signature: str = ""
    analysis: ScriptAnalysis = msgspec.field(default_factory=ScriptAnalysis)


class AnalysisCache(msgspec.Struct):
    entries: dict[str, AnalysisEntry] = msgspec.field(default_factory=dict)


def default_jobs() -> int:
    cores = os.cpu_count() or 1
    return max(1, min(cores // 2, 4))


def _run_pending(
    jobs: list[interpreter.AnalyzeJob], workers: int, reporter: Reporter
) -> list[interpreter.AnalysisOutcome]:
    if workers <= 1 or len(jobs) < max(8, workers * 2):
        return [interpreter.analyze_job(job) for job in jobs]
    chunk = max(1, len(jobs) // (workers * 8))
    try:
        with ProcessPoolExecutor(max_workers=min(workers, len(jobs))) as pool:
            return list(pool.map(interpreter.analyze_job, jobs, chunksize=chunk))
    except Exception as exc:
        reporter.warn(f"parallel analysis unavailable, falling back to serial: {exc}")
        return [interpreter.analyze_job(job) for job in jobs]


def _signature(source: str) -> str:
    return hashlib.blake2b(source.encode("utf-8"), digest_size=8).hexdigest()


def _interpreter_digest() -> str:
    digest = hashlib.sha256()
    root = Path(__file__).parent / "interpreter"
    for path in sorted(root.glob("*.py")):
        digest.update(path.read_bytes())
    digest.update((Path(__file__).parent / "script_model.py").read_bytes())
    return digest.hexdigest()[:12]


def analysis_store() -> CacheStore:
    version = f"{schema_digest(AnalysisCache)}-{_interpreter_digest()}"
    return CacheStore(ANALYSIS_CACHE_PATH, CacheStamp(version, CORPUS_FINGERPRINT))


def analyze_all(
    sources: dict[str, str], use_cache: bool, reporter: Reporter, jobs: int | None = None
) -> tuple[dict[str, ScriptAnalysis], int, int]:
    reporter.stage(STAGE_ANALYSIS)
    store = analysis_store()
    cached = None
    if use_cache:
        try:
            cached = store.load(AnalysisCache)
        except CacheCorrupted as exc:
            reporter.warn(f"{exc}; reanalyzing every script")
    entries = cached.entries if cached is not None else {}
    analyses: dict[str, ScriptAnalysis] = {}
    signatures: dict[str, str] = {}
    pending: list[interpreter.AnalyzeJob] = []
    reused = 0
    failed = 0
    started = time.time()
    for sid, source in sorted(sources.items()):
        signature = _signature(source)
        entry = entries.get(sid)
        if entry is not None and entry.signature == signature:
            analyses[sid] = entry.analysis
            reused += 1
            continue
        signatures[sid] = signature
        pending.append(interpreter.AnalyzeJob(LUA_BINDINGS, sid, source))
    workers = max(1, jobs) if jobs is not None else default_jobs()
    for outcome in _run_pending(pending, workers, reporter):
        analyses[outcome.script_id] = outcome.analysis
        if outcome.is_failed:
            failed += 1
        entries[outcome.script_id] = AnalysisEntry(
            signature=signatures[outcome.script_id], analysis=outcome.analysis
        )
    if use_cache:
        kept = {sid: entry for sid, entry in entries.items() if sid in sources}
        store.save(AnalysisCache(entries=kept))
    reporter.info(
        f"{len(sources)} scripts (reused {reused}, analyzed {len(pending)},"
        f" failed {failed}, workers {workers}), {time.time() - started:.1f}s"
    )
    return analyses, reused, failed
