from dataclasses import dataclass

from ..script_model import ScriptAnalysis
from .analyzer import Analyzer, analyze
from .spec import CallSpec, Semantics


@dataclass(frozen=True)
class AnalyzeJob:
    semantics: Semantics
    script_id: str
    source: str


@dataclass(frozen=True)
class AnalysisOutcome:
    script_id: str
    is_failed: bool
    analysis: ScriptAnalysis


def analyze_job(job: AnalyzeJob) -> AnalysisOutcome:
    try:
        return AnalysisOutcome(
            job.script_id, False, analyze(job.script_id, job.source, job.semantics)
        )
    except Exception as exc:
        return AnalysisOutcome(
            job.script_id,
            True,
            ScriptAnalysis(id=job.script_id, error=f"{type(exc).__name__}: {exc}"),
        )


__all__ = [
    "AnalysisOutcome",
    "AnalyzeJob",
    "Analyzer",
    "CallSpec",
    "Semantics",
    "analyze",
    "analyze_job",
]
