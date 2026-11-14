import { useCallback, useEffect, useState } from "react";
import type { Frame } from "../learn/frames";
import { frameDelay, targetIndex } from "../learn/playback";
import type { PlaybackTarget } from "../learn/playback";
import { moveAnimationTime } from "./animation/plan";
import { settingsStore } from "./settings";

/**
 * Plays the Learn frames. Autoplay moves on after each frame's reading time
 * and stops at the end. Using a control pauses autoplay, so the viewer is in
 * charge until they press Play again.
 */
export function useLessonPlayer(frames: readonly Frame[]) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const frame = frames[index]!;
  const atEnd = index === frames.length - 1;

  useEffect(() => {
    if (!playing || atEnd) return undefined;
    const animation = frame.move ? moveAnimationTime(frame.move, settingsStore().get().animation) : 0;
    const timer = setTimeout(() => setIndex((i) => Math.min(i + 1, frames.length - 1)), frameDelay(frame, animation));
    return () => clearTimeout(timer);
  }, [playing, atEnd, frame, frames.length]);

  const go = useCallback(
    (to: PlaybackTarget) => {
      setPlaying(false);
      setIndex((current) => targetIndex(frames, current, to));
    },
    [frames],
  );

  // At the end, Play starts again from the first lesson.
  const togglePlay = useCallback(() => {
    if (atEnd) {
      setIndex(0);
      setPlaying(true);
    } else {
      setPlaying((value) => !value);
    }
  }, [atEnd]);

  return { index, frame, playing: playing && !atEnd, atEnd, go, togglePlay };
}
