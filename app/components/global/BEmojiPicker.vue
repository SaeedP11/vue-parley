<script lang="ts">
import { shallowRef } from "vue";
import type { EmojiEntry, EmojiGroupKey, EmojiGroups } from "./emoji/types";

/* The emoji list (~35 KB gzipped) loads the first time a picker renders, not with the chat,
   and every picker on the page shares it. */
const groups = shallowRef<EmojiGroups | null>(null);
let loadingGroups: Promise<void> | null = null;

function loadGroups() {
  loadingGroups ??= import("./emoji/data").then((module) => {
    groups.value = module.default;
  });
  return loadingGroups;
}

/* Recently used emoji, kept per browser. Storage can be missing or throw (private windows,
   blocked site data); the picker then simply has no "recent" row. */
const RECENT_KEY = "vue-parley:recent-emoji";
const RECENT_MAX = 24;

function readRecent(): EmojiEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((e): e is EmojiEntry => Array.isArray(e) && e.length === 3)
      : [];
  } catch {
    return [];
  }
}

const recent = shallowRef<EmojiEntry[]>(readRecent());

function remember(entry: EmojiEntry) {
  recent.value = [entry, ...recent.value.filter(([emoji]) => emoji !== entry[0])].slice(
    0,
    RECENT_MAX,
  );
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.value));
  } catch {
    // Nothing to do: the list still holds for this page.
  }
}

type CategoryKey = EmojiGroupKey | "recent";
/** A section of the grid: a category, or the search results. */
type SectionKey = CategoryKey | "results";

const CATEGORY_ICONS: Record<CategoryKey, string> = {
  recent: "PhClock",
  "smileys-emotion": "PhSmiley",
  "people-body": "PhHandWaving",
  "animals-nature": "PhPawPrint",
  "food-drink": "PhHamburger",
  "travel-places": "PhAirplaneTilt",
  activities: "PhSoccerBall",
  objects: "PhLightbulb",
  symbols: "PhHeart",
  flags: "PhFlag",
};

/** Every query word has to start a word of the emoji's name or keywords: "cat" finds 🐱, not 🎓. */
function matches([emoji, label, keywords]: EmojiEntry, terms: string[], raw: string) {
  if (emoji === raw) return true;
  const words = `${label} ${keywords}`.toLowerCase().split(/[\s:_-]+/);
  return terms.every((term) => words.some((word) => word.startsWith(term)));
}
</script>

<script setup lang="ts">
/**
 * The chat's emoji picker: a search field, a bar of categories and a virtualised grid of
 * native emoji, in PrimeVue and Tailwind. It fills the box it is given; size it with a class.
 * The grid is one tab stop, moved through with the arrow keys, Home and End.
 */
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from "vue";
import { useResizeObserver } from "@vueuse/core";
import { useVirtualizer } from "@tanstack/vue-virtual";
import Button from "primevue/button";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import Skeleton from "primevue/skeleton";
import IconButton from "~/components/general/IconButton.vue";
import BIcon from "~/components/global/BIcon.vue";
import useLocalI18n, { useDirection } from "~/composables/useLocalI18n";
import { bEmojiPicker } from "@i18n/locales";
import type { EmojiSelection } from "./emoji/types";

const emit = defineEmits<{ select: [emoji: EmojiSelection] }>();

const { t } = useLocalI18n(bEmojiPicker);
const { dir } = useDirection();

/** An emoji cell, and the height of a section's title row, in px. */
const CELL = 40;
const HEADER = 32;

const query = ref("");
const searchRef = ref<{ $el: HTMLInputElement } | null>(null);
const scrollRef = useTemplateRef<HTMLElement>("scroll");

onMounted(() => void loadGroups());

/* --- Layout: as many 40px columns as the width allows. --- */
const columns = ref(8);
useResizeObserver(scrollRef, ([entry]) => {
  const width = entry?.contentRect.width ?? 0;
  if (width > 0) columns.value = Math.max(5, Math.floor(width / CELL));
});

const searching = computed(() => query.value.trim().length > 0);

const categories = computed<CategoryKey[]>(() => {
  if (!groups.value) return [];
  const keys = Object.keys(groups.value) as EmojiGroupKey[];
  return recent.value.length ? ["recent", ...keys] : keys;
});

const sections = computed<{ key: SectionKey; entries: EmojiEntry[] }[]>(() => {
  const all = groups.value;
  if (!all) return [];
  const raw = query.value.trim();
  if (raw) {
    const terms = raw.toLowerCase().split(/\s+/);
    const found = Object.values(all)
      .flat()
      .filter((entry) => matches(entry, terms, raw));
    return found.length ? [{ key: "results", entries: found }] : [];
  }
  return categories.value.map((key) => ({
    key,
    entries: key === "recent" ? recent.value : all[key],
  }));
});

type Cell = { entry: EmojiEntry; index: number; row: number; col: number };
type Row = { kind: "header"; section: SectionKey } | { kind: "emoji"; section: SectionKey; cells: Cell[] };

/** Section titles and rows of emoji; every emoji also gets a flat index, for the arrow keys. */
const layout = computed(() => {
  const rows: Row[] = [];
  const cells: Cell[] = [];
  for (const section of sections.value) {
    rows.push({ kind: "header", section: section.key });
    for (let i = 0; i < section.entries.length; i += columns.value) {
      const row = rows.length;
      const rowCells = section.entries
        .slice(i, i + columns.value)
        .map((entry, col) => ({ entry, index: cells.length + col, row, col }));
      cells.push(...rowCells);
      rows.push({ kind: "emoji", section: section.key, cells: rowCells });
    }
  }
  return { rows, cells };
});

const virtualizer = useVirtualizer(
  computed(() => ({
    count: layout.value.rows.length,
    getScrollElement: () => scrollRef.value,
    estimateSize: (index: number) => (layout.value.rows[index]?.kind === "header" ? HEADER : CELL),
    overscan: 4,
  })),
);

const visibleRows = computed(() =>
  virtualizer.value.getVirtualItems().map((item) => ({ item, row: layout.value.rows[item.index]! })),
);

/* --- Categories: the one at the top of the list is the current one. --- */
const activeCategory = computed(() => {
  const offset = virtualizer.value.scrollOffset ?? 0;
  return visibleRows.value.find(({ item }) => item.end > offset + 1)?.row.section;
});

function jumpTo(category: CategoryKey) {
  const header = layout.value.rows.findIndex(
    (row) => row.kind === "header" && row.section === category,
  );
  if (header < 0) return;
  virtualizer.value.scrollToIndex(header, { align: "start" });
  const first = layout.value.rows[header + 1];
  if (first?.kind === "emoji") focusIndex.value = first.cells[0]!.index;
}

/* --- Keyboard: a roving tab stop over the grid. --- */
const focusIndex = ref(0);

async function focusCell(index: number) {
  const cell = layout.value.cells[index];
  if (!cell) return;
  focusIndex.value = index;
  virtualizer.value.scrollToIndex(cell.row, { align: "auto" });
  await nextTick();
  scrollRef.value?.querySelector<HTMLElement>(`[data-emoji-index="${index}"]`)?.focus();
}

/** The emoji in the next (step 1) or previous (step -1) row, in the same column if it has one. */
function verticalNeighbour(cell: Cell, step: 1 | -1) {
  const { rows } = layout.value;
  for (let r = cell.row + step; r >= 0 && r < rows.length; r += step) {
    const row = rows[r]!;
    if (row.kind === "emoji") return row.cells[Math.min(cell.col, row.cells.length - 1)]!.index;
  }
  return undefined;
}

function onGridKeydown(event: KeyboardEvent) {
  const { cells } = layout.value;
  const cell = cells[Math.min(focusIndex.value, cells.length - 1)];
  if (!cell) return;
  const last = cells.length - 1;
  const forward = dir.value === "rtl" ? "ArrowLeft" : "ArrowRight";
  const backward = dir.value === "rtl" ? "ArrowRight" : "ArrowLeft";
  const targets: Record<string, number | undefined> = {
    [forward]: Math.min(cell.index + 1, last),
    [backward]: Math.max(cell.index - 1, 0),
    ArrowDown: verticalNeighbour(cell, 1) ?? cell.index,
    // Up from the first row goes back to the search field.
    ArrowUp: verticalNeighbour(cell, -1) ?? -1,
    Home: 0,
    End: last,
  };
  if (!(event.key in targets)) return;
  event.preventDefault();
  const next = targets[event.key]!;
  if (next < 0) searchRef.value?.$el.focus();
  else void focusCell(next);
}

/* --- Picking --- */
function pick(entry: EmojiEntry) {
  emit("select", { emoji: entry[0], label: entry[1] });
  remember(entry);
}

function clearSearch() {
  query.value = "";
  searchRef.value?.$el.focus();
}

watch(query, () => {
  focusIndex.value = 0;
  virtualizer.value.scrollToOffset(0);
});
</script>

<template>
  <div
    :dir="dir"
    role="group"
    :aria-label="t('label')"
    data-testid="chat-emoji-picker"
    class="flex min-h-0 flex-col overflow-hidden bg-chat-background text-chat-on-background"
  >
    <div class="relative shrink-0 px-2 pt-2">
      <IconField class="w-full">
        <InputIcon class="flex! items-center text-chat-muted">
          <BIcon icon="PhMagnifyingGlass" class="size-4" />
        </InputIcon>
        <InputText
          ref="searchRef"
          v-model="query"
          type="search"
          size="small"
          autocomplete="off"
          enterkeyhint="done"
          :placeholder="t('search')"
          :aria-label="t('search')"
          class="w-full rounded-full! pe-9! [&::-webkit-search-cancel-button]:hidden"
          data-testid="chat-emoji-search"
          @keydown.down.prevent="focusCell(0)"
          @keydown.enter.prevent="searching && layout.cells[0] && pick(layout.cells[0].entry)"
        />
      </IconField>
      <IconButton
        v-if="query"
        icon="PhX"
        icon-class="size-3.5"
        :label="t('clear')"
        size="small"
        class="absolute! end-3 top-3 size-7!"
        @click="clearSearch"
      />
    </div>

    <nav
      v-show="!searching"
      :aria-label="t('categories')"
      class="mt-1 flex shrink-0 items-center gap-x-0.5 border-b border-chat-outline-variant px-1.5 pb-1"
    >
      <Button
        v-for="key in categories"
        :key="key"
        text
        severity="secondary"
        :aria-label="t(`groups.${key}`)"
        :title="t(`groups.${key}`)"
        :aria-current="activeCategory === key ? 'true' : undefined"
        class="h-9! min-w-0! flex-1 rounded-lg! p-0!"
        :class="activeCategory === key ? 'bg-chat-primary/10! text-chat-primary!' : 'text-chat-muted!'"
        @click="jumpTo(key)"
      >
        <BIcon
          :icon="CATEGORY_ICONS[key]"
          :weight="activeCategory === key ? 'fill' : 'regular'"
          class="size-5"
        />
      </Button>
    </nav>

    <span class="sr-only" aria-live="polite">
      {{ searching ? t("resultCount", { count: layout.cells.length }) : "" }}
    </span>

    <div
      ref="scroll"
      class="chat-scrollbar relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-1.5"
      @keydown="onGridKeydown"
    >
      <!-- Loading: the shape of the grid, so nothing jumps when it arrives. -->
      <div v-if="!groups" aria-hidden="true" class="flex flex-col gap-y-2 pt-2">
        <Skeleton width="7rem" height="0.75rem" class="ms-1.5" />
        <div class="grid grid-cols-8 gap-y-3">
          <Skeleton
            v-for="n in 32"
            :key="n"
            shape="circle"
            size="1.75rem"
            class="justify-self-center"
          />
        </div>
      </div>

      <!-- Nothing matched the search. -->
      <div
        v-else-if="!layout.cells.length"
        class="flex h-full flex-col items-center justify-center gap-y-1 p-6 text-center"
      >
        <BIcon icon="PhSmileyMeh" class="mb-1 size-10 text-chat-muted" />
        <p class="m-0 text-label-md text-chat-on-background">
          <bdi>{{ t("noResults", { query: query.trim() }) }}</bdi>
        </p>
        <p class="m-0 text-body-sm text-chat-muted">{{ t("noResultsHint") }}</p>
      </div>

      <div v-else class="relative w-full" :style="{ height: `${virtualizer.getTotalSize()}px` }">
        <div
          v-for="{ item, row } in visibleRows"
          :key="item.key as number"
          class="absolute inset-x-0 top-0"
          :style="{ height: `${item.size}px`, transform: `translateY(${item.start}px)` }"
        >
          <div
            v-if="row.kind === 'header'"
            role="heading"
            aria-level="3"
            class="flex h-full items-end px-1.5 pb-1 text-label-sm text-chat-muted select-none"
          >
            {{ t(`groups.${row.section}`) }}
          </div>
          <div
            v-else
            class="grid h-full"
            :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }"
          >
            <Button
              v-for="cell in row.cells"
              :key="cell.entry[0]"
              text
              severity="secondary"
              :aria-label="cell.entry[1]"
              :title="cell.entry[1]"
              :tabindex="cell.index === focusIndex ? 0 : -1"
              :data-emoji-index="cell.index"
              class="size-10! justify-self-center rounded-lg! p-0! text-[1.6rem]! leading-none!"
              @click="pick(cell.entry)"
              @focus="focusIndex = cell.index"
            >
              <span aria-hidden="true" class="emoji-glyph">{{ cell.entry[0] }}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
