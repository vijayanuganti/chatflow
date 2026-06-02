import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Crop,
  Download,
  Forward,
  RotateCw,
  Type,
  Wand2,
} from "lucide-react";
import { registerOverlayBack } from "@/lib/overlayBackHandler";
import MediaViewerHeader from "@/components/chat/viewers/MediaViewerHeader";
import { usePinchZoomPan } from "@/components/chat/viewers/usePinchZoomPan";
import { MV } from "@/components/chat/viewers/mediaViewerTheme";

const HISTORY_FLAG = "__chatflowImageLightbox";

const IMAGE_FILTERS = [
  { id: "none", label: "Original", css: "none", swatch: "linear-gradient(135deg,#888,#ccc)" },
  { id: "vivid", label: "Vivid", css: "saturate(1.4) contrast(1.08)", swatch: "linear-gradient(135deg,#f59e0b,#ef4444)" },
  { id: "cool", label: "Cool", css: "saturate(0.9) hue-rotate(15deg) brightness(1.05)", swatch: "linear-gradient(135deg,#38bdf8,#6366f1)" },
  { id: "mono", label: "Mono", css: "grayscale(1) contrast(1.1)", swatch: "linear-gradient(135deg,#444,#aaa)" },
  { id: "warm", label: "Warm", css: "sepia(0.35) saturate(1.2)", swatch: "linear-gradient(135deg,#f97316,#fbbf24)" },
];

/**
 * Full-screen image viewer: pinch-zoom, swipe-down dismiss, optional edit sidebar.
 */
export default function ChatImageViewer({
  open,
  src,
  alt = "Image",
  onClose,
  onDownload,
  onForward,
  onSaveAndSend,
  showForward = true,
  editorToolbar = false,
}) {
  const [activeTool, setActiveTool] = useState(null);
  const [filterId, setFilterId] = useState("none");
  const [rotation, setRotation] = useState(0);
  const [cropMode, setCropMode] = useState(false);
  const [textOverlay, setTextOverlay] = useState("");
  const historyPushedRef = useRef(false);
  const closingRef = useRef(false);

  const requestClose = useCallback(({ skipHistory = false } = {}) => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose?.();
    if (!skipHistory && historyPushedRef.current) {
      historyPushedRef.current = false;
      try {
        window.history.back();
      } catch {
        /* ignore */
      }
    } else {
      historyPushedRef.current = false;
    }
    window.setTimeout(() => {
      closingRef.current = false;
    }, 0);
  }, [onClose]);

  const {
    scale,
    dragY,
    dragOpacity,
    transform,
    reset,
    onWheel,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  } = usePinchZoomPan({ onDismiss: () => requestClose({ skipHistory: true }) });

  useEffect(() => {
    if (!open) return undefined;
    setActiveTool(null);
    setFilterId("none");
    setRotation(0);
    setCropMode(false);
    setTextOverlay("");
    reset();
    closingRef.current = false;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, src, reset]);

  useEffect(() => {
    if (!open) return undefined;
    const unregisterOverlay = registerOverlayBack(() => requestClose({ skipHistory: true }));
    try {
      window.history.pushState({ [HISTORY_FLAG]: true }, "");
      historyPushedRef.current = true;
    } catch {
      historyPushedRef.current = false;
    }
    const onPopState = () => requestClose({ skipHistory: true });
    const onKey = (e) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKey);
    return () => {
      unregisterOverlay();
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, requestClose]);

  const activeFilter = IMAGE_FILTERS.find((f) => f.id === filterId) || IMAGE_FILTERS[0];
  const imgFilter = activeFilter.css;
  const imgTransform = `${transform} rotate(${rotation}deg)`;

  const toggleTool = (tool) => {
    setActiveTool((t) => (t === tool ? null : tool));
    if (tool === "crop") setCropMode((c) => !c);
    else setCropMode(false);
  };

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
    setActiveTool("rotate");
  };

  if (!open || !src || typeof document === "undefined") return null;

  const hasTopActions = Boolean(onDownload) || (showForward && onForward);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      className="fixed inset-0 z-[10000] flex"
      style={{ backgroundColor: `rgba(11,11,11,${0.97 * dragOpacity})` }}
      data-testid="chat-image-viewer"
    >
      <div className="relative flex min-w-0 flex-1 flex-col">
        <MediaViewerHeader
          title={alt}
          onClose={() => requestClose()}
          backIcon="close"
          testId="chat-image-viewer"
          rightSlot={
            hasTopActions ? (
              <>
                {onDownload ? (
                  <button
                    type="button"
                    className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 touch-manipulation active:bg-white/10"
                    onClick={onDownload}
                    aria-label="Download"
                    data-testid="chat-image-viewer-download"
                  >
                    <Download className="h-5 w-5" />
                  </button>
                ) : null}
                {showForward && onForward ? (
                  <button
                    type="button"
                    className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 touch-manipulation active:bg-white/10"
                    onClick={onForward}
                    aria-label="Forward"
                    data-testid="chat-image-viewer-forward"
                  >
                    <Forward className="h-5 w-5" />
                  </button>
                ) : null}
              </>
            ) : null
          }
        />

        <div
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden touch-none px-2"
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <img
            src={src}
            alt={alt}
            className="max-h-full max-w-full select-none object-contain"
            style={{
              transform: imgTransform,
              filter: imgFilter,
              opacity: dragOpacity,
              transition: scale === 1 ? "transform 75ms ease-out, filter 200ms ease" : undefined,
            }}
            draggable={false}
          />

          {cropMode ? (
            <div className="pointer-events-none absolute inset-4 border-2 border-dashed border-white/70 rounded-lg shadow-[inset_0_0_0_9999px_rgba(0,0,0,0.45)]" />
          ) : null}

          {textOverlay ? (
            <p
              className="pointer-events-none absolute inset-x-4 top-1/3 z-10 text-center text-2xl font-bold text-white"
              style={{ textShadow: "0 2px 12px rgba(0,0,0,0.85)" }}
            >
              {textOverlay}
            </p>
          ) : null}

          {activeTool === "text" ? (
            <div className="absolute inset-x-6 bottom-24 z-20">
              <input
                type="text"
                value={textOverlay}
                onChange={(e) => setTextOverlay(e.target.value)}
                placeholder="Add text…"
                className="w-full rounded-xl border border-white/20 bg-black/60 px-4 py-3 text-center text-lg font-semibold text-white outline-none backdrop-blur-md placeholder:text-white/40"
                autoFocus
              />
            </div>
          ) : null}
        </div>

        {editorToolbar && onSaveAndSend ? (
          <div
            className="absolute z-30"
            style={{
              right: "max(1rem, env(safe-area-inset-right))",
              bottom: MV.safeBottom,
            }}
          >
            <button
              type="button"
              onClick={onSaveAndSend}
              className="rounded-full px-5 py-2.5 text-[14px] font-semibold text-white shadow-lg touch-manipulation active:scale-[0.98]"
              style={{
                background: `linear-gradient(135deg, ${MV.accent} 0%, #2d9cdb 100%)`,
                boxShadow: "0 4px 20px rgba(83, 189, 235, 0.45)",
              }}
              data-testid="chat-image-viewer-save-send"
            >
              Save &amp; Send
            </button>
          </div>
        ) : null}
      </div>

      {editorToolbar ? (
        <aside
          className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-l border-white/[0.08] py-3"
          style={{
            backgroundColor: MV.panel,
            paddingTop: MV.safeTop,
            paddingBottom: MV.safeBottom,
          }}
          aria-label="Image editing tools"
        >
          <ToolBtn
            icon={Crop}
            label="Crop"
            active={activeTool === "crop" || cropMode}
            onClick={() => toggleTool("crop")}
          />
          <ToolBtn
            icon={RotateCw}
            label="Rotate"
            active={activeTool === "rotate"}
            onClick={handleRotate}
          />
          <ToolBtn
            icon={Wand2}
            label="Filters"
            active={activeTool === "filter"}
            onClick={() => toggleTool("filter")}
          />
          <ToolBtn
            icon={Type}
            label="Text"
            active={activeTool === "text"}
            onClick={() => toggleTool("text")}
          />

          {activeTool === "filter" ? (
            <div className="mt-2 flex flex-col gap-2 px-1">
              {IMAGE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterId(f.id)}
                  className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg ring-2 touch-manipulation"
                  style={{
                    background: f.swatch,
                    boxShadow:
                      filterId === f.id
                        ? `0 0 0 2px ${MV.accent}`
                        : "0 0 0 1px rgba(255,255,255,0.15)",
                  }}
                  title={f.label}
                  aria-label={f.label}
                  aria-pressed={filterId === f.id}
                />
              ))}
            </div>
          ) : null}
        </aside>
      ) : null}
    </div>,
    document.body,
  );
}

function ToolBtn({ icon: Icon, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-11 flex-col items-center justify-center rounded-xl touch-manipulation transition-colors"
      style={{
        color: active ? MV.accent : MV.chromeDim,
        backgroundColor: active ? "rgba(83, 189, 235, 0.12)" : "transparent",
      }}
      aria-label={label}
      title={label}
    >
      <Icon className="h-5 w-5" strokeWidth={1.75} />
    </button>
  );
}
