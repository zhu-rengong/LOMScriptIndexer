from collections.abc import Sequence

from ..script_model import (
    Beat,
    BranchBeat,
    ChoiceBeat,
    JumpBeat,
    LoreBeat,
    MetaBeat,
    SayBeat,
    SceneBeat,
)


class BeatWalker:
    def walk(self, beats: Sequence[Beat]) -> None:
        for beat in beats:
            self.visit(beat)

    def visit(self, beat: Beat) -> None:
        match beat:
            case SayBeat():
                self.say(beat)
            case ChoiceBeat():
                self.choice(beat)
            case BranchBeat():
                self.branch(beat)
            case JumpBeat():
                self.jump(beat)
            case MetaBeat():
                self.meta(beat)
            case LoreBeat():
                self.lore(beat)
            case SceneBeat():
                self.scene(beat)

    def say(self, beat: SayBeat) -> None:
        pass

    def choice(self, beat: ChoiceBeat) -> None:
        for option in beat.options:
            self.walk(option.beats)

    def branch(self, beat: BranchBeat) -> None:
        self.walk(beat.beats)

    def jump(self, beat: JumpBeat) -> None:
        pass

    def meta(self, beat: MetaBeat) -> None:
        pass

    def lore(self, beat: LoreBeat) -> None:
        pass

    def scene(self, beat: SceneBeat) -> None:
        pass
