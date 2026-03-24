import { useCallback, useEffect, useRef, useState } from "react";

interface ImageCropperProps {
  imageFile: File;
  onCrop: (blob: Blob) => void;
  onCancel: () => void;
}

const OUTPUT_SIZE = 512;

export function ImageCropper({ imageFile, onCrop, onCancel }: ImageCropperProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [cropDiameter, setCropDiameter] = useState(280);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const drag = useRef({
    active: false,
    lastX: 0,
    lastY: 0,
    pinchDist: 0,
    isPinch: false,
  });

  const L = useRef({
    zoom: 1,
    pan: { x: 0, y: 0 },
    imgSize: null as { w: number; h: number } | null,
    baseScale: 1,
    cropDiameter: 280,
  });

  const baseScale = imgSize
    ? cropDiameter / Math.min(imgSize.w, imgSize.h)
    : 1;

  L.current = { zoom, pan, imgSize, baseScale, cropDiameter };

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    const img = new Image();
    img.onload = () => setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    function update() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setCropDiameter(Math.min(Math.max(200, w - 64), 320, h - 240));
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const clampPan = useCallback(
    (p: { x: number; y: number }, z: number) => {
      const s = L.current.imgSize;
      if (!s) return p;
      const currentScale = L.current.baseScale * z;
      const cd = L.current.cropDiameter;
      const scaledW = s.w * currentScale;
      const scaledH = s.h * currentScale;
      const mx = Math.max(0, (scaledW - cd) / 2);
      const my = Math.max(0, (scaledH - cd) / 2);
      return {
        x: Math.max(-mx, Math.min(mx, p.x)),
        y: Math.max(-my, Math.min(my, p.y)),
      };
    },
    [],
  );

  const readyToAttach = !!imgSize;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function isButton(e: Event) {
      return (e.target as HTMLElement).closest("button") !== null;
    }

    function onTouchStart(e: TouchEvent) {
      if (isButton(e)) return;
      e.preventDefault();
      const d = drag.current;
      if (e.touches.length === 1) {
        d.active = true;
        d.isPinch = false;
        d.lastX = e.touches[0].clientX;
        d.lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        d.active = true;
        d.isPinch = true;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        d.pinchDist = Math.hypot(dx, dy);
        d.lastX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        d.lastY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (isButton(e)) return;
      e.preventDefault();
      const d = drag.current;
      const cur = L.current;
      if (!d.active) return;

      if (e.touches.length === 1 && !d.isPinch) {
        const dx = e.touches[0].clientX - d.lastX;
        const dy = e.touches[0].clientY - d.lastY;
        d.lastX = e.touches[0].clientX;
        d.lastY = e.touches[0].clientY;
        const np = clampPan({ x: cur.pan.x + dx, y: cur.pan.y + dy }, cur.zoom);
        L.current.pan = np;
        setPan(np);
      } else if (e.touches.length === 2 && d.pinchDist > 0) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const scale = dist / d.pinchDist;
        const nz = Math.max(1, Math.min(5, cur.zoom * scale));
        const vw2 = window.innerWidth / 2;
        const vh2 = window.innerHeight / 2;
        const r = nz / cur.zoom;
        const npx = (cx - vw2) * (1 - r) + cur.pan.x * r;
        const npy = (cy - vh2) * (1 - r) + cur.pan.y * r;
        const np = clampPan({ x: npx, y: npy }, nz);
        L.current.zoom = nz;
        L.current.pan = np;
        d.pinchDist = dist;
        d.lastX = cx;
        d.lastY = cy;
        setZoom(nz);
        setPan(np);
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length === 0) {
        drag.current.active = false;
        drag.current.isPinch = false;
      } else if (e.touches.length === 1) {
        drag.current.isPinch = false;
        drag.current.lastX = e.touches[0].clientX;
        drag.current.lastY = e.touches[0].clientY;
      }
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0 || isButton(e)) return;
      e.preventDefault();
      const d = drag.current;
      d.active = true;
      d.lastX = e.clientX;
      d.lastY = e.clientY;

      function onMove(ev: MouseEvent) {
        const cur = L.current;
        const dx = ev.clientX - d.lastX;
        const dy = ev.clientY - d.lastY;
        d.lastX = ev.clientX;
        d.lastY = ev.clientY;
        const np = clampPan({ x: cur.pan.x + dx, y: cur.pan.y + dy }, cur.zoom);
        L.current.pan = np;
        setPan(np);
      }

      function onUp() {
        d.active = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      }

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const cur = L.current;
      const delta = -e.deltaY * 0.003;
      const nz = Math.max(1, Math.min(5, cur.zoom * (1 + delta)));
      const vw2 = window.innerWidth / 2;
      const vh2 = window.innerHeight / 2;
      const r = nz / cur.zoom;
      const npx = (e.clientX - vw2) * (1 - r) + cur.pan.x * r;
      const npy = (e.clientY - vh2) * (1 - r) + cur.pan.y * r;
      const np = clampPan({ x: npx, y: npy }, nz);
      L.current.zoom = nz;
      L.current.pan = np;
      setZoom(nz);
      setPan(np);
    }

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("wheel", onWheel);
    };
  }, [readyToAttach, clampPan]);

  function handleConfirm() {
    const img = imgRef.current;
    const sz = L.current.imgSize;
    if (!img || !sz) return;

    const cur = L.current;
    const currentScale = cur.baseScale * cur.zoom;
    const cd = cur.cropDiameter;

    const srcSize = cd / currentScale;
    const srcX = sz.w / 2 - (cd / 2 + cur.pan.x) / currentScale;
    const srcY = sz.h / 2 - (cd / 2 + cur.pan.y) / currentScale;

    const clampedSrcX = Math.max(0, Math.min(sz.w - srcSize, srcX));
    const clampedSrcY = Math.max(0, Math.min(sz.h - srcSize, srcY));

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(
      img,
      clampedSrcX,
      clampedSrcY,
      srcSize,
      srcSize,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    );

    canvas.toBlob(
      (blob) => {
        if (blob) onCrop(blob);
      },
      "image/jpeg",
      0.85,
    );
  }

  if (!imageUrl || !imgSize) {
    return (
      <div className="fixed inset-0 z-50 bg-brand-navy flex items-center justify-center">
        <div className="font-display text-white/60 text-lg tracking-wider uppercase">
          Laden...
        </div>
      </div>
    );
  }

  const displayW = imgSize.w * baseScale;
  const cp = clampPan(pan, zoom);

  const scaledW = displayW * zoom;
  const scaledH = (imgSize.h * baseScale) * zoom;
  const tx = -(scaledW / 2) + cp.x;
  const ty = -(scaledH / 2) + cp.y;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 select-none overflow-hidden animate-fade-in"
      style={{ touchAction: "none", backgroundColor: "#1D3557" }}
    >
      <img
        ref={imgRef}
        src={imageUrl}
        alt=""
        draggable={false}
        className="absolute will-change-transform"
        style={{
          width: displayW,
          maxWidth: "none",
          left: "50%",
          top: "50%",
          transformOrigin: "0 0",
          transform: `translate3d(${tx}px, ${ty}px, 0) scale(${zoom})`,
        }}
      />

      {/* Crop circle overlay */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "50%",
          top: "50%",
          width: cropDiameter,
          height: cropDiameter,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          boxShadow: "0 0 0 9999px rgba(29, 53, 87, 0.75)",
          border: "2px solid rgba(255, 255, 255, 0.7)",
        }}
      />

      {/* Subtle glow ring */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "50%",
          top: "50%",
          width: cropDiameter + 12,
          height: cropDiameter + 12,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          boxShadow:
            "0 0 30px rgba(42, 157, 143, 0.12), 0 0 60px rgba(42, 157, 143, 0.05)",
        }}
      />

      {/* Instruction */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none">
        <p
          className="font-display text-white/50 text-xs tracking-[0.25em] text-center uppercase"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 20px)" }}
        >
          Verschieben & Zoomen
        </p>
      </div>

      {/* Bottom controls */}
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
          paddingTop: "20px",
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleConfirm();
          }}
          className="font-display text-white text-base tracking-wider min-h-[52px] w-56 rounded-full bg-brand-teal hover:bg-brand-teal/90 active:scale-95 transition-transform uppercase"
          style={{
            boxShadow: "0 0 24px rgba(42, 157, 143, 0.3)",
          }}
        >
          Foto verwenden
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className="font-display text-white/50 text-xs tracking-[0.25em] min-h-[48px] flex items-center justify-center hover:text-white/80 transition-colors uppercase"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
