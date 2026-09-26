import { ref, computed, type Ref } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";

interface ScrollOptions {
  scrollContainer: Ref<HTMLElement | null>;
  hasCall: Ref<boolean>;
  isLoading: Ref<boolean>;
  chosenRole: Ref<string | undefined>;
  isLocked: Ref<boolean>;
  onLoadMore: () => void;
}

export function useFlippedVirtualScroll(options: ScrollOptions) {
  const {
    scrollContainer,
    hasCall,
    isLoading,
    chosenRole,
    isLocked,
    onLoadMore,
  } = options;

  // --- Virtualizer Setup ---
  // Note: The actual `reversedMessages` and `count` will be injected via a setter
  // to avoid circular dependency issues in the main component.
  const itemCount = ref(0);
  const getItemKey = ref<(index: number) => string | number>(
    (index: number) => index,
  );

  const virtualizer = useVirtualizer(
    computed(() => ({
      count: itemCount.value,
      getScrollElement: () => scrollContainer.value,
      estimateSize: () => 80,
      overscan: 15,
      getItemKey: getItemKey.value,
    })),
  );

  // --- Scroll State ---
  const headerOpacity = ref(0);
  const scrollOffset = ref(0);
  const topVisibleMessageIndex = ref(0);
  const targetScroll = ref(0);
  const showOptionsBar = ref(false);
  let lastScrollTop = 0;
  let scrollTimer: ReturnType<typeof setTimeout> | null = null;
  let animationFrame: number | null = null;

  // The list is flipped: the newest message is at scrollTop 0 (drawn at the bottom of the screen),
  // so "away from newest" is scrollTop itself.
  const canScroll = computed(() => scrollOffset.value > 100);

  // --- Scroll Handlers ---
  const handleScroll = () => {
    if (isLocked.value) return;
    const el = scrollContainer.value;
    if (!el) return;

    scrollOffset.value = el.scrollTop;
    const currentScroll = el.scrollTop;

    // Floating Header Logic
    headerOpacity.value = 1;
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      headerOpacity.value = 0;
    }, 3000);

    // Infinite Scroll Trigger (In flipped list, high scrollTop = older messages = top of screen)
    const distanceToTop = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceToTop < 100 && !isLoading.value && itemCount.value > 0) {
      onLoadMore();
    }

    // Options Bar Visibility
    if (currentScroll < lastScrollTop) {
      showOptionsBar.value = false;
    } else {
      showOptionsBar.value = chosenRole.value !== "user";
    }
    lastScrollTop = currentScroll;

    // Track Top Visible Message for Floating Header
    const items = virtualizer.value.getVirtualItems();
    if (items.length > 0) {
      const targetOffset = hasCall.value ? 88 : 44;
      const physicalTopOfViewport =
        el.scrollHeight - el.clientHeight - el.scrollTop;
      const targetPhysicalTop = physicalTopOfViewport + targetOffset;

      let closestIndex = items[0].index;
      let minDiff = Infinity;

      for (const item of items) {
        const diff = Math.abs(item.start - targetPhysicalTop);
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = item.index;
        }
      }
      topVisibleMessageIndex.value = closestIndex;
    }
  };

  const handleWheel = (e: WheelEvent) => {
    if (isLocked.value || !scrollContainer.value || itemCount.value === 0)
      return;

    // Start from where the list actually is, not a target left over from an earlier wheel or a
    // touch/keyboard scroll the loop never saw.
    if (!animationFrame) targetScroll.value = scrollContainer.value.scrollTop;

    // In a flipped list, positive deltaY raises scrollTop, towards older messages.
    targetScroll.value += e.deltaY;

    const maxScroll =
      scrollContainer.value.scrollHeight - scrollContainer.value.clientHeight;
    targetScroll.value = Math.max(0, Math.min(targetScroll.value, maxScroll));

    if (!animationFrame) smoothScrollLoop();
  };

  const smoothScrollLoop = () => {
    if (!scrollContainer.value) return;
    const current = scrollContainer.value.scrollTop;
    const target = targetScroll.value;
    const distance = (target - current) * 0.22;

    if (Math.abs(distance) > 0.5) {
      scrollContainer.value.scrollTop += distance;
      animationFrame = requestAnimationFrame(smoothScrollLoop);
    } else {
      scrollContainer.value.scrollTop = target;
      animationFrame = null;
    }
  };

  const resetScroll = () => {
    const el = scrollContainer.value;
    if (!el) return;
    // Let the virtualizer drive the jump. A plain el.scrollTo is cancelled the moment a newly
    // measured row makes the virtualizer shift scrollTop to hold the viewport, stalling short of
    // the newest message; during its own smooth scroll it skips those shifts and keeps going.
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    targetScroll.value = 0;
    virtualizer.value.scrollToOffset(0, { behavior: "smooth" });
  };

  const cleanup = () => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (scrollTimer) clearTimeout(scrollTimer);
  };

  return {
    virtualizer,
    headerOpacity,
    showOptionsBar,
    canScroll,
    topVisibleMessageIndex,
    handleScroll,
    handleWheel,
    resetScroll,
    cleanup,
    // Exposed to allow component to pass dynamic data without circular refs
    setItemCount: (count: number) => {
      itemCount.value = count;
    },
    setGetItemKey: (fn: (index: number) => string | number) => {
      getItemKey.value = fn;
    },
  };
}
