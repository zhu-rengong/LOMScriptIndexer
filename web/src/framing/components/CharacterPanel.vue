<script setup lang="ts">
import { ref } from "vue";
import type { CharacterRow } from "../../stores/framing";
import { useFramingStore } from "../../stores/framing";

const store = useFramingStore();
const expanded = ref<Set<string>>(new Set());

const isOpen = (row: CharacterRow): boolean =>
  expanded.value.has(row.id) || row.partial || store.current?.character === row.id;

const toggle = (id: string): void => {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
};

const pick = (character: string, expression: string): void => store.select(character, expression);

const initials = (label: string): string => {
  const text = label.trim();
  if (!text) return "?";
  return /^[A-Za-z]/.test(text) ? text.slice(0, 2).toUpperCase() : text.slice(0, 2);
};
</script>

<template>
  <aside class="fx-panel fx-list">
    <div class="fx-list-head">
      <label class="fx-search">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10.8" cy="10.8" r="6.4" />
          <path d="m15.6 15.6 4.6 4.6" />
        </svg>
        <input
          v-model="store.query"
          type="search"
          placeholder="Search character or expression"
          spellcheck="false"
        />
        <button
          v-if="store.query"
          type="button"
          class="fx-search-clear"
          aria-label="Clear search"
          @click="store.query = ''"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
        </button>
      </label>
      <div class="fx-list-meta">
        <span>{{ store.rows.length }} characters</span>
        <span class="fx-sep">/</span>
        <span class="fx-mono">{{ store.customizedCount }} custom</span>
      </div>
    </div>

    <div class="fx-list-scroll">
      <p v-if="store.status === 'loading'" class="fx-list-note">Loading portraits…</p>
      <p v-else-if="!store.rows.length" class="fx-list-note">
        No character matches “{{ store.query }}”.
      </p>
      <section
        v-for="row in store.rows"
        :key="row.id"
        class="fx-char"
        :class="{
          'is-active': store.current?.character === row.id,
          'has-custom': row.customized > 0,
        }"
      >
        <button
          type="button"
          class="fx-char-head"
          :aria-expanded="isOpen(row)"
          @click="toggle(row.id)"
        >
          <span class="fx-char-mark">{{ initials(row.label) }}</span>
          <span class="fx-char-text">
            <strong>{{ row.label }}</strong>
            <small>{{ row.id }}</small>
          </span>
          <span v-if="row.customized" class="fx-count">{{ row.customized }}</span>
          <svg
            class="fx-chev"
            :class="{ 'is-open': isOpen(row) }"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="m6.5 9.4 5.5 5.4 5.5-5.4" />
          </svg>
        </button>
        <div v-if="isOpen(row)" class="fx-expr-grid">
          <button
            v-for="expr in row.expressions"
            :key="expr.name"
            type="button"
            class="fx-expr"
            :class="{
              'is-active':
                store.current?.character === row.id && store.current?.expression === expr.name,
              'is-custom': expr.customized,
            }"
            @click="pick(row.id, expr.name)"
          >
            <i class="fx-expr-dot" :class="{ 'is-saved': expr.saved }"></i>
            <span>{{ expr.name }}</span>
          </button>
        </div>
      </section>
    </div>
  </aside>
</template>
