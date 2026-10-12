"use client";

import { useEffect, useRef, useState } from "react";

type Mounted = { destroy(): void };

/** Lazily loads the three.js animator (kept out of the main bundle) and mounts it. */
function useAnimator(mount: (host: HTMLElement, mod: typeof import("@/animation/ui")) => Mounted | null) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let mounted: Mounted | null = null;
    let cancelled = false;
    import("@/animation/ui")
      .then((mod) => {
        if (!cancelled && ref.current) mounted = mount(ref.current, mod);
      })
      .catch(() => setError(true));
    return () => {
      cancelled = true;
      mounted?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per key; parents remount via `key`
  }, []);
  return { ref, error };
}

function Placeholder({ label }: { label: string }) {
  return <div className="grid aspect-video place-items-center rounded-[var(--radius-card)] border border-dashed border-line-strong text-sm text-muted">{label}</div>;
}

export function SkillAnimation({ slug }: { slug: string }) {
  const { ref, error } = useAnimator((host, mod) => mod.mountEntryAnimation(host, slug));
  if (error) return <p className="text-sm text-muted">The 3D animation couldn&apos;t load. Reload the page to try again.</p>;
  return (
    <div ref={ref}>
      <Placeholder label="Loading animation…" />
    </div>
  );
}

export function AnimationStudio() {
  const { ref, error } = useAnimator((host, mod) => mod.mountStudio(host, { linkFor: (slug) => `/tricks/${slug}` }));
  if (error) return <p className="text-sm text-muted">The 3D animator couldn&apos;t load. Reload the page to try again.</p>;
  return (
    <div ref={ref}>
      <Placeholder label="Loading animator…" />
    </div>
  );
}
