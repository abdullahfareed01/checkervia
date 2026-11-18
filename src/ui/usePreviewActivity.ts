import { useEffect, useRef, useState } from "react";

/** CSS does the animation. Observe only visibility changes so cards outside
 * the scroll area and hidden tabs do not keep running previews. */
export function usePreviewActivity(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    let inView = typeof IntersectionObserver === "undefined";
    const update = () => setVisible(inView && document.visibilityState !== "hidden");
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
      update();
    }, { threshold: 0.05 });
    observer?.observe(element);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [enabled]);
  return { ref, active: enabled && visible };
}
