import React, { useRef, useState } from "react";
import { IconPlay } from "./ChatIcons";
import UploadProgressRing from "./UploadProgressRing";

export default function VideoMessagePreview({
  src,
  poster,
  uploadProgress,
  uploading,
}) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const showOverlay = uploading || (uploadProgress != null && uploadProgress < 100);

  const handlePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="relative mb-1 max-w-full rounded-xl overflow-hidden">
      <video
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        playsInline
        className="rounded-xl max-h-80 w-full bg-black object-cover"
        controls={playing}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        data-testid="message-video"
      />
      {!playing && !showOverlay && (
        <button
          type="button"
          onClick={handlePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/15"
          aria-label="Play video"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm">
            <IconPlay className="h-7 w-7 ml-0.5" />
          </span>
        </button>
      )}
      <UploadProgressRing progress={uploadProgress} visible={showOverlay} />
    </div>
  );
}
