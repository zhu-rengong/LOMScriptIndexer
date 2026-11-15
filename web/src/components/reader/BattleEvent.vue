<script setup lang="ts">
import { t } from "../../i18n";
import type { BattleEvent, BattleLine, BattlePart } from "../../types/beats";
import AppIcon from "../ui/AppIcon.vue";
import JumpLink from "./JumpLink.vue";
import SayLine from "./SayLine.vue";
import { usePanelsStore } from "../../stores/panels";

type BattleSegment =
  | { kind: "say"; line: BattleLine }
  | { kind: "jump"; line: BattleLine }
  | { kind: "scene"; line: BattleLine }
  | { kind: "after"; line: BattleLine }
  | { kind: "chips"; lines: BattleLine[] };

const panels = usePanelsStore();

const props = defineProps<{ event: BattleEvent }>();

const items = computed<BattleSegment[]>(() => {
  const out: BattleSegment[] = [];
  let chips: BattleLine[] | null = null;
  const flush = () => {
    if (chips && chips.length) out.push({ kind: "chips", lines: chips });
    chips = null;
  };
  for (const line of props.event.lines) {
    if (line.kind === "say") {
      flush();
      out.push({ kind: "say", line });
      continue;
    }
    if (line.kind === "jump") {
      flush();
      out.push({ kind: "jump", line });
      continue;
    }
    if (line.kind === "scene") {
      flush();
      out.push({ kind: "scene", line });
      continue;
    }
    if (line.kind === "after") {
      flush();
      out.push({ kind: "after", line });
      continue;
    }
    if (!chips) chips = [];
    chips.push(line);
  }
  flush();
  return out;
});

const linkable = (item: BattlePart | BattleLine) =>
  !!item.key && (item.kind === "flag" || item.kind === "stat" || item.kind === "rel");

const openLookup = (item: BattlePart | BattleLine, event: Event) => {
  event.stopPropagation();
  panels.openLookup(item.kind, item.key, event.currentTarget as HTMLElement);
};
</script>

<template>
  <div class="battle-event">
    <div class="meta-chips battle-when">
      <template v-for="(part, index) in event.when.parts" :key="index">
        <span v-if="index && event.when.logic" class="option-cond battle-logic">
          {{ t(event.when.logic === "or" ? "cxOr" : "cxAnd") }}
        </span>
        <button
          v-if="linkable(part)"
          class="tag"
          data-interactive
          type="button"
          aria-haspopup="dialog"
          @click="openLookup(part, $event)"
        >
          {{ part.text }}
        </button>
        <span v-else class="tag">{{ part.text }}</span>
      </template>
    </div>

    <div v-if="event.lines.length" class="battle-lines">
      <template v-for="(item, index) in items" :key="index">
        <SayLine
          v-if="item.kind === 'say'"
          inBattle
          :mode="item.line.mode"
          :speaker="item.line.speaker"
          :text="item.line.text"
        />
        <JumpLink
          v-else-if="item.kind === 'jump'"
          :jump="{ target: item.line.target, dynamicSource: '' }"
        />
        <div v-else-if="item.kind === 'scene'" class="scene-switch">
          <span class="scene-label">{{ t("sceneSwitch") }}</span>
          <template v-if="item.line.sceneName">
            <AppIcon name="arrow-right" class="scene-arrow" />
            <span class="scene-next">{{ item.line.sceneName }}</span>
          </template>
        </div>
        <div v-else-if="item.kind === 'after'" class="scene-switch">
          <span class="scene-label">{{ t("battleAfterStory") }}</span>
          <JumpLink :jump="{ target: item.line.target, dynamicSource: '' }" />
        </div>
        <div v-else class="meta-chips">
          <template v-for="(chip, position) in item.lines" :key="position">
            <button
              v-if="linkable(chip)"
              class="tag"
              data-interactive
              type="button"
              aria-haspopup="dialog"
              @click="openLookup(chip, $event)"
            >
              {{ chip.text }}
            </button>
            <span v-else class="tag">{{ chip.text }}</span>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>
