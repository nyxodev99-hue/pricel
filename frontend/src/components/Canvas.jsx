import { useCallback, useEffect, useRef, useState } from 'react';

const GRID_SIZE = 1000;
const MIN_SCALE = 1;
const MAX_SCALE = 40;
const EMPTY_COLOR = '#ffffff';

export default function CanvasBoard({ selectedColor, onPixelClick, onPixelHover, pixelsRef, bumpTick }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const view = useRef({ scale: 8, offsetX: 400, offsetY: 400 }); // offsetX/Y = world coords at screen (0,0)
  const dragging = useRef(false);
  const dragMoved = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  // Active pointers by pointerId, for pinch-to-zoom on touch. On desktop
  // there's ever only one (mouse), so this never engages there - zoom stays
  // on the wheel handler. On touch, a second finger switches us from "pan"
  // to "pinch" for the duration both fingers are down.
  const pointers = useRef(new Map());
  const pinch = useRef(null); // { startDist, startScale, startMidWorld }
  const [, forceRender] = useState(0);
  const fetchTimer = useRef(null);
  // Reused across frames so we're not allocating a new canvas/buffer on
  // every draw - only resized when the visible cell count changes.
  const cellCanvas = useRef(null);
  const rafId = useRef(null);

  const drawNow = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const { scale, offsetX, offsetY } = view.current;

    ctx.fillStyle = '#15161a';
    ctx.fillRect(0, 0, width, height);

    const x1 = Math.max(0, Math.floor(offsetX));
    const y1 = Math.max(0, Math.floor(offsetY));
    const x2 = Math.min(GRID_SIZE - 1, Math.ceil(offsetX + width / scale));
    const y2 = Math.min(GRID_SIZE - 1, Math.ceil(offsetY + height / scale));

    // Canvas bounds shading (outside the 1000x1000 grid).
    ctx.fillStyle = '#ffffff';
    ctx.fillRect((0 - offsetX) * scale, (0 - offsetY) * scale, GRID_SIZE * scale, GRID_SIZE * scale);

    const cols = x2 - x1 + 1;
    const rows = y2 - y1 + 1;

    if (cols > 0 && rows > 0) {
      // One CPU-side pixel buffer (1 canvas-pixel per grid cell), written
      // directly instead of one fillRect() per cell - this is what makes
      // zoomed-out views (up to 1M cells) fast. It's then blitted onto the
      // main canvas as a single scaled drawImage call.
      if (!cellCanvas.current) cellCanvas.current = document.createElement('canvas');
      const off = cellCanvas.current;
      if (off.width !== cols || off.height !== rows) {
        off.width = cols;
        off.height = rows;
      }
      const offCtx = off.getContext('2d');
      const imgData = offCtx.createImageData(cols, rows);
      const buf = imgData.data;
      const pixels = pixelsRef.current;

      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
          const p = pixels.get(`${x},${y}`);
          const idx = ((y - y1) * cols + (x - x1)) * 4;
          if (p) {
            const hex = p.color;
            buf[idx] = parseInt(hex.slice(1, 3), 16);
            buf[idx + 1] = parseInt(hex.slice(3, 5), 16);
            buf[idx + 2] = parseInt(hex.slice(5, 7), 16);
          } else {
            buf[idx] = 255; buf[idx + 1] = 255; buf[idx + 2] = 255;
          }
          buf[idx + 3] = 255;
        }
      }
      offCtx.putImageData(imgData, 0, 0);

      const dx = (x1 - offsetX) * scale;
      const dy = (y1 - offsetY) * scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, 0, 0, cols, rows, dx, dy, cols * scale, rows * scale);
    }

    if (scale >= 6) {
      const x1i = x1, y1i = y1;
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      for (let x = x1i; x <= x2 + 1; x++) {
        const sx = (x - offsetX) * scale;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, height); ctx.stroke();
      }
      for (let y = y1i; y <= y2 + 1; y++) {
        const sy = (y - offsetY) * scale;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(width, sy); ctx.stroke();
      }
    }
  }, [pixelsRef]);

  // Throttled entry point: coalesces bursts of calls (rapid wheel ticks,
  // pointermove during drag/pinch) into at most one draw per animation
  // frame, instead of one heavy full redraw per event.
  const draw = useCallback(() => {
    if (rafId.current != null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      drawNow();
    });
  }, [drawNow]);

  const scheduleFetch = useCallback(() => {
    clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { scale, offsetX, offsetY } = view.current;
      const x1 = Math.max(0, Math.floor(offsetX) - 5);
      const y1 = Math.max(0, Math.floor(offsetY) - 5);
      const x2 = Math.min(GRID_SIZE - 1, Math.ceil(offsetX + canvas.width / scale) + 5);
      const y2 = Math.min(GRID_SIZE - 1, Math.ceil(offsetY + canvas.height / scale) + 5);
      try {
        const { api } = await import('../api.js');
        const { pixels } = await api.getViewport(x1, y1, x2, y2);
        for (const p of pixels) pixelsRef.current.set(`${p.x},${p.y}`, p);
        draw();
      } catch (_) { /* transient network error, next pan/zoom will retry */ }
    }, 150);
  }, [draw, pixelsRef]);

  // Resize canvas to fill container.
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      draw();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [draw]);

  useEffect(() => {
    scheduleFetch();
    draw();
  }, [bumpTick, draw, scheduleFetch]);

  const onWheel = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { scale, offsetX, offsetY } = view.current;

    const worldX = offsetX + mx / scale;
    const worldY = offsetY + my / scale;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));

    view.current = {
      scale: newScale,
      offsetX: worldX - mx / newScale,
      offsetY: worldY - my / newScale,
    };
    draw();
    scheduleFetch();
  };

  function pointersArray() {
    return Array.from(pointers.current.values());
  }

  function pinchDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pinchMidpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  const onPointerDown = (e) => {
    canvasRef.current.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2) {
      // Second finger down: switch to pinch-zoom, abandon any in-progress pan.
      dragging.current = false;
      const [a, b] = pointersArray();
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const mid = pinchMidpoint(a, b);
      const { scale, offsetX, offsetY } = view.current;
      pinch.current = {
        startDist: pinchDistance(a, b),
        startScale: scale,
        startMidWorld: {
          x: offsetX + (mid.x - rect.left) / scale,
          y: offsetY + (mid.y - rect.top) / scale,
        },
      };
    } else {
      dragging.current = true;
      dragMoved.current = false;
      lastPos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerMove = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = pointersArray();
      const dist = pinchDistance(a, b);
      if (dist > 0) {
        const { startDist, startScale, startMidWorld } = pinch.current;
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, startScale * (dist / startDist)));
        const mid = pinchMidpoint(a, b);
        const mx = mid.x - rect.left;
        const my = mid.y - rect.top;
        view.current = {
          scale: newScale,
          offsetX: startMidWorld.x - mx / newScale,
          offsetY: startMidWorld.y - my / newScale,
        };
        draw();
      }
      return; // pinching takes priority over hover/pan while active
    }

    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { scale, offsetX, offsetY } = view.current;
    const worldX = Math.floor(offsetX + mx / scale);
    const worldY = Math.floor(offsetY + my / scale);
    onPixelHover && onPixelHover(worldX, worldY);

    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    view.current = {
      ...view.current,
      offsetX: view.current.offsetX - dx / scale,
      offsetY: view.current.offsetY - dy / scale,
    };
    draw();
  };

  const onPointerUp = (e) => {
    const wasPinching = !!pinch.current;
    pointers.current.delete(e.pointerId);

    if (pointers.current.size < 2) {
      pinch.current = null;
    }
    if (wasPinching || pointers.current.size >= 1) {
      // Either we were pinching (never a tap), or a finger is still down
      // (mid-pinch release) - don't treat this as a pixel click.
      dragging.current = false;
      scheduleFetch();
      return;
    }

    dragging.current = false;
    if (dragMoved.current) { scheduleFetch(); return; }

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { scale, offsetX, offsetY } = view.current;
    const x = Math.floor(offsetX + mx / scale);
    const y = Math.floor(offsetY + my / scale);
    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return;
    onPixelClick(x, y);
  };

  // Expose a redraw hook for parent-driven realtime updates.
  useEffect(() => {
    canvasRef.current.__redraw = draw;
  }, [draw]);

  // Safari (iOS) fires legacy 'gesture*' events for two-finger pinches
  // independently of the Pointer Events used above, and uses them to zoom
  // the whole page - this happens regardless of touch-action and was
  // fighting our own pinch-to-zoom handling. The viewport meta tag
  // (user-scalable=no) stops this on modern iOS, but older WebKit still
  // needs these prevented directly.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prevent = (e) => e.preventDefault();
    canvas.addEventListener('gesturestart', prevent);
    canvas.addEventListener('gesturechange', prevent);
    canvas.addEventListener('gestureend', prevent);
    return () => {
      canvas.removeEventListener('gesturestart', prevent);
      canvas.removeEventListener('gesturechange', prevent);
      canvas.removeEventListener('gestureend', prevent);
    };
  }, []);

  return (
    <div ref={containerRef} className="canvas-container">
      <canvas
        ref={canvasRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="canvas-board"
      />
    </div>
  );
}
