from typing import Any

from .assets import AssetSession, try_build_generator
from .layout import GameLayout

try:
    import TypeTreeGeneratorAPI
except ImportError as exc:
    TypeTreeGeneratorAPI = None
    GENERATOR_MISSING = f"TypeTreeGeneratorAPI is not installed ({exc})"
else:
    GENERATOR_MISSING = (
        "TypeTreeGeneratorAPI cannot build a type tree generator; check the .NET runtime"
    )


def available() -> bool:
    return TypeTreeGeneratorAPI is not None


def build_generator(layout: GameLayout) -> Any | None:
    if not available():
        return None
    return try_build_generator(layout)


def require_generator(session: AssetSession) -> Any:
    if session.generator is None:
        raise RuntimeError(GENERATOR_MISSING)
    return session.generator
