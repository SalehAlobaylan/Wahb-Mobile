export type SceneMotionInput = {
  selected: boolean;
  current: boolean;
  focused: boolean;
  foreground: boolean;
  playing: boolean;
  buffering: boolean;
  reducedMotion: boolean;
  lowPowerMode: boolean;
  memoryPressure: boolean;
  interacting: boolean;
  covered: boolean;
};

/** Presentation policy only; it never starts, pauses, or seeks a player. */
export function sceneCanAnimate(input: SceneMotionInput): boolean {
  return (
    input.selected &&
    input.current &&
    input.focused &&
    input.foreground &&
    input.playing &&
    !input.buffering &&
    !input.reducedMotion &&
    !input.lowPowerMode &&
    !input.memoryPressure &&
    !input.interacting &&
    !input.covered
  );
}
