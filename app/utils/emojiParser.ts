export function parseEmojiArray(text: string | undefined) {
  if (!text) return [];

  // Safely split text by visual characters
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const graphemes = Array.from(segmenter.segment(text)).map(s => s.segment);

  const emojiRegex = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
  const result: Array<{ type: 'text' | 'emoji'; content: string }> = [];
  let currentText = '';

  for (const grapheme of graphemes) {
    if (emojiRegex.test(grapheme)) {
      if (currentText) {
        result.push({ type: 'text', content: currentText });
        currentText = '';
      }
      result.push({ type: 'emoji', content: grapheme });
    } else {
      currentText += grapheme;
    }
  }

  if (currentText) {
    result.push({ type: 'text', content: currentText });
  }

  return result;
}