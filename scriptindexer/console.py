import sys
from collections.abc import Sequence
from typing import TextIO


class Reporter:
    def __init__(self, stream: TextIO | None = None, stages: Sequence[str] = ()) -> None:
        self.stream = stream or sys.stdout
        self._indent = 6
        self._stages: list[str] = list(stages)
        self._index = 0
        self._total = len(self._stages)

    def configure(self, stages: Sequence[str]) -> None:
        self._stages = list(stages)
        self._index = 0
        self._total = len(self._stages)

    def write(self, message: str = "") -> None:
        print(message, file=self.stream, flush=True)

    def stage(self, title: str) -> None:
        if self._stages and title in self._stages:
            self._index = self._stages.index(title) + 1
        else:
            self._index += 1
        total = self._total or self._index
        self.write(f"[{self._index}/{total}] {title}")

    def info(self, message: str) -> None:
        self.write(" " * self._indent + message)

    def warn(self, message: str) -> None:
        self.write(" " * self._indent + f"[warn] {message}")

    def error(self, message: str) -> None:
        self.write(" " * self._indent + f"[error] {message}")

    def blank(self) -> None:
        self.write("")
