import * as Haptics from 'expo-haptics';
import { triggerHaptic } from '../src/lib/haptics';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

describe('triggerHaptic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('triggers selection haptics without throwing on any platform', async () => {
    expect(() => triggerHaptic('selection')).not.toThrow();
    await new Promise((r) => setTimeout(r, 15));
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('triggers success notification feedback', async () => {
    expect(() => triggerHaptic('success')).not.toThrow();
    await new Promise((r) => setTimeout(r, 15));
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });

  it('triggers error notification feedback', async () => {
    expect(() => triggerHaptic('error')).not.toThrow();
    await new Promise((r) => setTimeout(r, 15));
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  });

  it('triggers light impact feedback', async () => {
    expect(() => triggerHaptic('impact')).not.toThrow();
    await new Promise((r) => setTimeout(r, 15));
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('handles native haptic rejections silently without throwing', async () => {
    (Haptics.notificationAsync as jest.Mock).mockRejectedValueOnce(new Error('Native error'));
    expect(() => triggerHaptic('error')).not.toThrow();
    await new Promise((r) => setTimeout(r, 15));
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });
});
