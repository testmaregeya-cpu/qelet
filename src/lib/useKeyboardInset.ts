import { type ComponentRef, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context';

const DEFAULT_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export interface MeasurableNode {
  measureInWindow?: (
    callback: (x: number, y: number, width: number, height: number) => void
  ) => void;
}

export interface ComputeScrollTargetParams {
  inputTopY: number;
  inputHeight: number;
  viewportTopY: number;
  viewportHeight: number;
  currentScrollY: number;
  maxVisibleBottomY?: number;
  topBuffer?: number;
  bottomBuffer?: number;
}

/**
 * Computes the vertical scroll offset needed to keep a focused input
 * cleanly visible above the soft keyboard and inside the ScrollView viewport.
 * Returns null if the input is already comfortably visible.
 */
export function computeKeyboardScrollTarget({
  inputTopY,
  inputHeight,
  viewportTopY,
  viewportHeight,
  currentScrollY,
  maxVisibleBottomY,
  topBuffer = 12,
  bottomBuffer = 24,
}: ComputeScrollTargetParams): number | null {
  if (viewportHeight <= 0) {
    return null;
  }

  const rawBottom = viewportTopY + viewportHeight;
  const boundedBottom =
    maxVisibleBottomY !== undefined ? Math.min(rawBottom, maxVisibleBottomY) : rawBottom;
  const visibleBottom = boundedBottom - bottomBuffer;
  const visibleTop = viewportTopY + topBuffer;
  const inputBottom = inputTopY + inputHeight;

  if (inputBottom > visibleBottom) {
    return Math.max(0, Math.round(currentScrollY + (inputBottom - visibleBottom)));
  }

  if (inputTopY < visibleTop) {
    return Math.max(0, Math.round(currentScrollY - (visibleTop - inputTopY)));
  }

  return null;
}

/**
 * Safely reads safe area insets without throwing when rendered outside a SafeAreaProvider (e.g. Jest).
 */
export function useSafeAreaInsetsSafe(): EdgeInsets {
  return useContext(SafeAreaInsetsContext) ?? DEFAULT_INSETS;
}

export function computeKeyboardSheetStyle(
  keyboardHeight: number,
  windowHeight: number,
  topInset: number,
  bottomInset: number,
  defaultMaxRatio = 0.92
): { maxHeight: number; paddingBottom: number } {
  if (keyboardHeight > 0 && windowHeight > 0) {
    return {
      maxHeight: Math.max(240, Math.round(windowHeight - keyboardHeight - topInset - 12)),
      paddingBottom: 12,
    };
  }
  return {
    maxHeight: Math.round((windowHeight > 0 ? windowHeight : 800) * defaultMaxRatio),
    paddingBottom: Math.max(24, bottomInset + 12),
  };
}

/**
 * Tracks the active soft keyboard height across iOS and Android (including edge-to-edge modals).
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState<number>(() => {
    try {
      if (typeof Keyboard?.isVisible === 'function' && Keyboard.isVisible()) {
        return Keyboard.metrics?.()?.height ?? 0;
      }
    } catch {
      // Ignore in partial test mocks
    }
    return 0;
  });

  useEffect(() => {
    if (typeof Keyboard?.addListener !== 'function') {
      return undefined;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const nextHeight = e?.endCoordinates?.height ?? 0;
      setKeyboardHeight(nextHeight > 0 ? nextHeight : 0);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    // Fallback listener on iOS in case interactive/modal dismissal skips keyboardWillHide
    const didHideSub =
      Platform.OS === 'ios'
        ? Keyboard.addListener('keyboardDidHide', () => {
            setKeyboardHeight(0);
          })
        : null;

    return () => {
      showSub.remove();
      hideSub.remove();
      didHideSub?.remove();
    };
  }, []);

  return keyboardHeight;
}

/**
 * Coordinates a ScrollView so whichever TextInput is focused automatically scrolls
 * into the visible window above the keyboard without obscuring typing.
 */
export function useKeyboardAwareScroll() {
  const scrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const scrollYRef = useRef<number>(0);
  const focusedTargetRef = useRef<MeasurableNode | null>(null);
  const keyboardHeight = useKeyboardHeight();
  const { height: windowHeight } = useWindowDimensions();

  const scrollFocusedIntoView = useCallback(() => {
    const scrollNode = scrollRef.current as unknown as MeasurableNode | null;
    if (!scrollNode || typeof scrollNode.measureInWindow !== 'function') {
      return;
    }

    let target = focusedTargetRef.current;
    if (!target || typeof target.measureInWindow !== 'function') {
      try {
        const current = TextInput.State?.currentlyFocusedInput?.() as unknown as MeasurableNode | null;
        if (current && typeof current.measureInWindow === 'function') {
          target = current;
        }
      } catch {
        target = null;
      }
    }

    if (!target || typeof target.measureInWindow !== 'function') {
      return;
    }

    scrollNode.measureInWindow((_sx, viewportTopY, _sw, viewportHeight) => {
      if (viewportHeight <= 0) return;
      target?.measureInWindow?.((_ix, inputTopY, _iw, inputHeight) => {
        const maxVisibleBottomY =
          keyboardHeight > 0 ? windowHeight - keyboardHeight : undefined;
        const targetScrollY = computeKeyboardScrollTarget({
          inputTopY,
          inputHeight,
          viewportTopY,
          viewportHeight,
          currentScrollY: scrollYRef.current,
          maxVisibleBottomY,
        });
        if (targetScrollY !== null) {
          scrollRef.current?.scrollTo({ y: targetScrollY, animated: true });
        }
      });
    });
  }, [keyboardHeight, windowHeight]);

  useEffect(() => {
    if (keyboardHeight <= 0) return undefined;
    const timer = setTimeout(() => {
      scrollFocusedIntoView();
    }, 80);
    return () => clearTimeout(timer);
  }, [keyboardHeight, scrollFocusedIntoView]);

  const handleInputFocus = useCallback(
    (node?: unknown) => {
      if (
        node &&
        typeof node === 'object' &&
        typeof (node as MeasurableNode).measureInWindow === 'function'
      ) {
        focusedTargetRef.current = node as MeasurableNode;
      } else {
        try {
          const current = TextInput.State?.currentlyFocusedInput?.() as unknown as MeasurableNode | null;
          if (current && typeof current.measureInWindow === 'function') {
            focusedTargetRef.current = current;
          }
        } catch {
          focusedTargetRef.current = null;
        }
      }

      setTimeout(() => {
        scrollFocusedIntoView();
      }, 110);
    },
    [scrollFocusedIntoView]
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  return {
    scrollRef,
    keyboardHeight,
    handleInputFocus,
    scrollViewHandlers: {
      onScroll: handleScroll,
      scrollEventThrottle: 16 as const,
      keyboardShouldPersistTaps: 'handled' as const,
      onLayout: () => {
        if (keyboardHeight > 0) {
          setTimeout(scrollFocusedIntoView, 40);
        }
      },
    },
  };
}
