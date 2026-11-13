from ..console import Reporter
from ..errors import ScriptIndexerError


def split_langs(raw: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in raw.split(",") if item.strip())


def run_app(app: object) -> None:
    try:
        app()  # type: ignore[operator]
    except ScriptIndexerError as exc:
        Reporter().error(str(exc))
        raise SystemExit(exc.exit_code) from exc
