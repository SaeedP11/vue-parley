import type { Directive, DirectiveBinding } from "vue";

// 1. The visual skeleton properties (No transitions here)
const coreClasses = [
  "!text-transparent",
  "!bg-surface-variant-2",
  "dark:!bg-surface-variant-2",
  "!animate-pulse",
  "!rounded",
  "!pointer-events-none",
  "!select-none",
  "[&>*]:!opacity-0",
  "will-change-[opacity,background-color]",
];

// 2. The transition properties (Applied AFTER initial load)
const transitionClasses = ["!transition-all", "!duration-300", "!ease-in-out"];

const loadingDirective: Directive & {
  getSSRProps?: (binding: DirectiveBinding) => Record<string, string>;
} = {
  getSSRProps(binding: DirectiveBinding): Record<string, string> {
    if (binding.value) {
      return {
        class: coreClasses.join(" "),
        "aria-busy": "true",
        "aria-hidden": "true",
      };
    }
    return {};
  },
  // Runs BEFORE the element is added to the DOM
  beforeMount(el: HTMLElement, binding: DirectiveBinding) {
    if (binding.value) {
      // Instantly apply the skeleton visual without any delay/fade
      el.classList.add(...coreClasses);
      el.setAttribute("aria-busy", "true");
      el.setAttribute("aria-hidden", "true");
    }
  },

  // Runs AFTER the element is fully drawn on the screen
  mounted(el: HTMLElement) {
    void el.offsetHeight;
    // Wait for the browser to finish the initial paint,
    // then silently add the transition classes so future changes fade smoothly.
    requestAnimationFrame(() => {
      el.classList.add(...transitionClasses);
    });
  },

  // Runs when your `isLoading` boolean changes
  updated(el: HTMLElement, binding: DirectiveBinding) {
    if (binding.value !== binding.oldValue) {
      if (binding.value) {
        requestAnimationFrame(() => {
          el.classList.add(...coreClasses);
          el.setAttribute("aria-busy", "true");
          el.setAttribute("aria-hidden", "true");
        });
      } else {
        requestAnimationFrame(() => {
          el.classList.remove(...coreClasses);
          el.removeAttribute("aria-busy");
          el.removeAttribute("aria-hidden");
        });
      }
    }
  },
};

export default loadingDirective;
