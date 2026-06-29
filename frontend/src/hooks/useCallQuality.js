import { useEffect, useState } from "react";

/** Poll RTCPeerConnection inbound audio stats for packet-loss quality. */
export function useCallQuality(peerConnectionRef) {
  const [quality, setQuality] = useState("good");

  useEffect(() => {
    const interval = setInterval(async () => {
      const pc = peerConnectionRef?.current;
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        stats.forEach((report) => {
          if (report.type === "inbound-rtp" && report.kind === "audio") {
            const lost = report.packetsLost || 0;
            const received = report.packetsReceived || 0;
            const loss = lost / Math.max(1, received + lost);
            setQuality(loss < 0.02 ? "good" : loss < 0.08 ? "fair" : "poor");
          }
        });
      } catch {
        /* ignore */
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [peerConnectionRef]);

  return quality;
}
