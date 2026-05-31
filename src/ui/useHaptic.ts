import * as Haptics from 'expo-haptics'

export type HapticKind = 'tap' | 'success' | 'warning' | 'error'

/**
 * Returns a fire-and-forget haptic trigger. Safe to call without
 * awaiting; failures (e.g. simulator without a haptic motor) are
 * swallowed.
 */
export function useHaptic() {
  return (kind: HapticKind = 'tap') => {
    void (async () => {
      try {
        switch (kind) {
          case 'tap':
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            return
          case 'success':
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            )
            return
          case 'warning':
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Warning,
            )
            return
          case 'error':
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Error,
            )
            return
        }
      } catch {
        // emulator / device without haptic motor — no-op
      }
    })()
  }
}
