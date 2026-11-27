import {
  computeKeyboardScrollTarget,
  computeKeyboardSheetStyle,
} from '../src/lib/useKeyboardInset';

describe('useKeyboardInset helpers', () => {
  describe('computeKeyboardScrollTarget', () => {
    it('returns null when viewportHeight is invalid', () => {
      expect(
        computeKeyboardScrollTarget({
          inputTopY: 500,
          inputHeight: 44,
          viewportTopY: 100,
          viewportHeight: 0,
          currentScrollY: 0,
        })
      ).toBeNull();
    });

    it('returns null when focused input is already cleanly inside visible viewport', () => {
      expect(
        computeKeyboardScrollTarget({
          inputTopY: 180,
          inputHeight: 44,
          viewportTopY: 100,
          viewportHeight: 360,
          currentScrollY: 0,
          maxVisibleBottomY: 480,
        })
      ).toBeNull();
    });

    it('scrolls down so input hidden behind soft keyboard sits cleanly above it', () => {
      // Viewport starts at 120, screen height 800, keyboard 320 -> maxVisibleBottomY = 480.
      // Input sits at y=500..544 (below 480 - 24 buffer = 456) -> delta = 544 - 456 = 88.
      const nextY = computeKeyboardScrollTarget({
        inputTopY: 500,
        inputHeight: 44,
        viewportTopY: 120,
        viewportHeight: 600,
        currentScrollY: 40,
        maxVisibleBottomY: 480,
      });

      expect(nextY).toBe(128);
    });

    it('scrolls down against ScrollView bottom when viewport itself shrank above keyboard', () => {
      // Viewport shrunk to 120..440 (height 320), visibleBottom = 440 - 24 = 416.
      // Input sits at 420..464 -> needs +48 scroll.
      const nextY = computeKeyboardScrollTarget({
        inputTopY: 420,
        inputHeight: 44,
        viewportTopY: 120,
        viewportHeight: 320,
        currentScrollY: 10,
      });

      expect(nextY).toBe(58);
    });

    it('scrolls up when user focuses an input scrolled above top of viewport', () => {
      const nextY = computeKeyboardScrollTarget({
        inputTopY: 80,
        inputHeight: 44,
        viewportTopY: 120,
        viewportHeight: 340,
        currentScrollY: 200,
      });

      // visibleTop = 120 + 12 = 132; delta = 132 - 80 = 52 -> 200 - 52 = 148
      expect(nextY).toBe(148);
    });
  });

  describe('computeKeyboardSheetStyle', () => {
    it('returns default percentage ratio height and safe bottom padding when keyboard is closed', () => {
      const style = computeKeyboardSheetStyle(0, 800, 44, 24, 0.9);
      expect(style.maxHeight).toBe(720);
      expect(style.paddingBottom).toBe(36);
    });

    it('clamps maxHeight between status bar and keyboard and collapses padding when keyboard is open', () => {
      // 800 window - 320 keyboard - 44 top inset - 12 gap = 424
      const style = computeKeyboardSheetStyle(320, 800, 44, 34, 0.92);
      expect(style.maxHeight).toBe(424);
      expect(style.paddingBottom).toBe(12);
    });

    it('enforces a minimum usable sheet height on very compact screens', () => {
      const style = computeKeyboardSheetStyle(380, 500, 40, 0, 0.92);
      expect(style.maxHeight).toBe(240);
    });
  });
});
