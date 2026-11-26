import * as Haptics from 'expo-haptics';

export type HapticKind = 'success' | 'error' | 'selection' | 'impact';

/**
 * Triggers platform-appropriate tactile feedback safely across iOS and all Android
 * versions (Android 8.0+), avoiding Android 14+ restricted HapticType constants
 * (e.g. Segment_Tick) that throw fatal native exceptions on older Android runtimes.
 */
export function triggerHaptic(kind: HapticKind): void {
  void (async () => {
    try {
      switch (kind) {
        case 'success':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return;
        case 'error':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return;
        case 'selection':
          await Haptics.selectionAsync();
          return;
        case 'impact':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          return;
      }
    } catch {
      // Non-fatal on hardware without vibrators or older Android runtimes
    }
  })();
}
