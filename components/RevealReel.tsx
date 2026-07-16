"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  target: string;
  fillers: string[];
  revealKey: string | number;
  itemSize: number;
  windowSize?: number;
  fillerCount?: number;
  delayMs?: number;
  durationMs?: number;
  easing?: string;
  animate?: boolean;
  animateOnMount?: boolean;
  blurFillers?: boolean;
  alwaysBlur?: boolean;
  persistNeighbors?: boolean;
  watermark?: string;
  className?: string;
  onSpinningChange?: (spinning: boolean) => void;
  onLanded?: () => void;
}

const DEFAULT_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

export default function RevealReel({
  target,
  fillers,
  revealKey,
  itemSize,
  windowSize = itemSize,
  fillerCount = 14,
  delayMs = 0,
  durationMs = 950,
  easing = DEFAULT_EASING,
  animate = true,
  animateOnMount = false,
  blurFillers = true,
  alwaysBlur = false,
  persistNeighbors = false,
  watermark,
  className = "",
  onSpinningChange,
  onLanded,
}: Props) {
  const [items, setItems] = useState([target]);
  const [landedIndex, setLandedIndex] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const reelRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const onSpinningChangeRef = useRef(onSpinningChange);
  const onLandedRef = useRef(onLanded);
  onSpinningChangeRef.current = onSpinningChange;
  onLandedRef.current = onLanded;

  const offsetFor = (index: number) => (windowSize - itemSize) / 2 - index * itemSize;
  const mask = windowSize > itemSize
    ? "linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)"
    : undefined;

  useEffect(() => {
    const firstRender = !mountedRef.current;
    mountedRef.current = true;
    const shouldAnimate = animate && (!firstRender || animateOnMount);
    const pool = fillers.filter(Boolean);

    if (!shouldAnimate || pool.length === 0) {
      if (persistNeighbors && pool.length > 0) {
        const previous = pool[0];
        const next = pool[1 % pool.length] ?? pool[0];
        setItems([previous, target, next]);
        setLandedIndex(1);
      } else {
        setItems([target]);
        setLandedIndex(0);
      }
      setSpinning(false);
      onSpinningChangeRef.current?.(false);
      return;
    }

    const start = setTimeout(() => {
      const randoms = Array.from(
        { length: fillerCount },
        () => pool[Math.floor(Math.random() * pool.length)],
      );
      if (persistNeighbors) {
        const leading = pool[Math.floor(Math.random() * pool.length)] ?? target;
        const trailing = pool[Math.floor(Math.random() * pool.length)] ?? target;
        setItems([leading, ...randoms, target, trailing]);
        setLandedIndex(fillerCount + 1);
      } else {
        setItems([...randoms, target]);
        setLandedIndex(fillerCount);
      }
      setSpinning(true);
      onSpinningChangeRef.current?.(true);
    }, delayMs);

    return () => clearTimeout(start);
    // revealKey is the explicit animation trigger. Other inputs are read at
    // that moment and intentionally do not restart a reel mid-spin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey]);

  useEffect(() => {
    if (!spinning || items.length < 2) return;
    const reel = reelRef.current;
    if (!reel) return;

    reel.style.transition = "none";
    reel.style.transform = `translateY(${offsetFor(persistNeighbors ? 1 : 0)}px)`;
    void reel.offsetHeight;
    reel.style.transition = `transform ${durationMs}ms ${easing}`;
    reel.style.transform = `translateY(${offsetFor(landedIndex)}px)`;

    const landTimer = setTimeout(() => {
      setSpinning(false);
      if (persistNeighbors) {
        const pool = fillers.filter(Boolean);
        const previous = pool[Math.floor(Math.random() * pool.length)] ?? target;
        const next = pool[Math.floor(Math.random() * pool.length)] ?? target;
        setItems([previous, target, next]);
        setLandedIndex(1);
      } else {
        setItems([target]);
        setLandedIndex(0);
      }
      onSpinningChangeRef.current?.(false);
      onLandedRef.current?.();
    }, durationMs + 50);

    return () => clearTimeout(landTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, items]);

  // The spin mutates transform directly for a smooth one-shot transition.
  // React does not restore that DOM value when the declared transform string
  // is unchanged across renders, so explicitly return the one-item reel to its
  // centered resting position after landing. Otherwise the final image stays
  // translated above the masked window while its text appears normally.
  useEffect(() => {
    if (spinning || !reelRef.current) return;
    reelRef.current.style.transition = "none";
    reelRef.current.style.transform = `translateY(${(windowSize - itemSize) / 2 - landedIndex * itemSize}px)`;
  }, [spinning, items, itemSize, windowSize, landedIndex]);

  return (
    <div
      className={`relative shrink-0 overflow-hidden ${className}`}
      style={{ width: itemSize, height: windowSize }}
    >
      <div className="h-full" style={{ maskImage: mask, WebkitMaskImage: mask }}>
        <div
          ref={reelRef}
          style={{ transform: `translateY(${offsetFor(0)}px)`, willChange: "transform" }}
        >
          {items.map((icon, index) => {
            const isTarget = index === landedIndex;
            return (
              <div key={`${icon}-${index}`} className="relative" style={{ width: itemSize, height: itemSize }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={icon}
                  alt=""
                  loading="eager"
                  decoding="async"
                  className="block h-full w-full object-cover"
                  style={{ filter: alwaysBlur || (blurFillers && (spinning || !isTarget)) ? "blur(3px)" : "none" }}
                />
                {isTarget && !spinning && watermark && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={watermark} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
