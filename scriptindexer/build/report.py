from pathlib import Path

from ..jsonio import write_json
from ..schema.report import ReportPayload


def write_report(path: Path, payload: ReportPayload) -> int:
    return write_json(path, payload, indent=2)
