"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";

/** Angka beranimasi naik dari nilai sebelumnya ke nilai baru. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value]);

  return <span className={className}>{display}</span>;
}
