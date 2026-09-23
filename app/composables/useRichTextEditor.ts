import { ref, nextTick, type Ref } from "vue";
import { parseEmojiArray } from "~/utils/emojiParser";

export function useRichTextEditor(inputRef: Ref<HTMLDivElement | null>) {
  const messageText = ref("");
  const savedRange = ref<Range | null>(null);
  const isSelectingEmoji = ref(false);

  const adjustHeight = () => {
    const el = inputRef.value;
    if (!el) return;

    // 1. Temporarily shrink to get the accurate scroll height of the content
    el.style.height = "0px";

    // 2. Cap at 144 to match the CSS max-height. This prevents JS from assigning
    // a height larger than 144px, which would break the parent flex layout.
    const maxHeight = 144;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  };
  const saveCursorPosition = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && inputRef.value) {
      if (inputRef.value.contains(selection.anchorNode)) {
        savedRange.value = selection.getRangeAt(0).cloneRange();
      }
    }
  };

  const handleContentInput = () => {
    if (!inputRef.value) return;
    messageText.value = inputRef.value.innerText;
    adjustHeight();
  };

  const handleEmojiSelect = (emoji: string, shouldBlurAfter = false) => {
    isSelectingEmoji.value = true;
    if (!inputRef.value) return;

    inputRef.value.focus();
    const selection = window.getSelection();
    let range: Range;

    if (savedRange.value) {
      range = savedRange.value;
      selection?.removeAllRanges();
      selection?.addRange(range);
    } else {
      range = document.createRange();
      range.selectNodeContents(inputRef.value);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    range.deleteContents();

    const parsed = parseEmojiArray(emoji);
    if (parsed.length > 0 && parsed[0].type === "emoji") {
      const chunk = parsed[0];
      const span = document.createElement("span");
      span.textContent = chunk.content;
      span.className =
        "emoji-glyph inline-block h-5 w-5 mx-0.5 leading-5 text-xl align-middle select-text pointer-events-none";
      span.setAttribute("contenteditable", "false");

      range.insertNode(span);
      range.setStartAfter(span);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      savedRange.value = range.cloneRange();
    }

    handleContentInput();

    nextTick(() => {
      if (shouldBlurAfter) inputRef.value?.blur();
      adjustHeight();
    });

    isSelectingEmoji.value = false;
  };

  /** Replaces the content with plain text, e.g. a restored draft or a message being edited. */
  const setText = (text: string) => {
    messageText.value = text;
    savedRange.value = null;
    if (inputRef.value) inputRef.value.innerText = text;
    nextTick(() => adjustHeight());
  };

  const clearInput = () => {
    messageText.value = "";
    if (inputRef.value) inputRef.value.innerHTML = "";
    nextTick(() => adjustHeight());
  };

  return {
    messageText,
    isSelectingEmoji,
    saveCursorPosition,
    handleContentInput,
    handleEmojiSelect,
    clearInput,
    setText,
    adjustHeight,
  };
}
