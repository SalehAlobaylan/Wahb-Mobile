import * as Haptics from 'expo-haptics';

let hapticsEnabled = true;

/** Settings can wire the persisted preference into this seam in M9. */
export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled;
}

function run(effect: () => Promise<void>): void {
  if (!hapticsEnabled) {
    return;
  }
  void effect().catch(() => undefined);
}

export function hapticSelection(): void {
  run(() => Haptics.selectionAsync());
}

export function hapticLightImpact(): void {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function hapticSuccess(): void {
  run(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  );
}

export function hapticWarning(): void {
  run(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  );
}
