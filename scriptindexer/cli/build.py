from cyclopts import App

from ..build.pipeline import run_build
from ..console import Reporter
from ..errors import DataError, UsageError
from ..languages import DEFAULT_LANG
from .common import run_app, split_langs

app = App(name="scriptindexer-build", help="Build graph and reader data for the script corpus")


@app.default
def main(
    langs: str = DEFAULT_LANG,
    default_lang: str = DEFAULT_LANG,
    *,
    cache: bool = True,
    jobs: int | None = None,
) -> None:
    selected = split_langs(langs)
    if not selected:
        raise UsageError("no language selected; pass --langs zh-tw")
    target = default_lang if default_lang in selected else selected[0]
    result = run_build(
        langs=selected,
        default_lang=target,
        use_cache=cache,
        jobs=jobs,
        reporter=Reporter(),
    )
    if not result.ok:
        raise DataError("build failed; see the report above")


def cli() -> None:
    run_app(app)
