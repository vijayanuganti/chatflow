import { useState, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";

export const OUTPUT_MODE = {
  EARPIECE: "earpiece",
  SPEAKER: "speaker",
  BLUETOOTH: "bluetooth",
};

export function useAudioOutputRouting(remoteAudioRef) {
  const [outputMode, setOutputMode] = useState(OUTPUT_MODE.EARPIECE);
  const deviceListRef = useRef([]);

  const enumerateOutputs = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    deviceListRef.current = devices.filter((d) => d.kind === "audiooutput");
    return deviceListRef.current;
  }, []);

  const routeTo = useCallback(
    async (mode) => {
      setOutputMode(mode);

      if (Capacitor.isNativePlatform()) {
        try {
          if (window.ChatFlowNative?.setAudioMode) {
            await window.ChatFlowNative.setAudioMode({ mode });
            return { ok: true, mode };
          }
        } catch (e) {
          console.warn("ChatFlowNative.setAudioMode not available:", e);
        }
      }

      const el = remoteAudioRef?.current;
      if (!el || typeof el.setSinkId !== "function") {
        return { ok: true, mode };
      }

      const devices = await enumerateOutputs();

      if (mode === OUTPUT_MODE.SPEAKER) {
        try {
          await el.setSinkId("default");
          return { ok: true, mode: OUTPUT_MODE.SPEAKER };
        } catch (e) {
          console.warn(e);
          return { ok: false, mode: OUTPUT_MODE.EARPIECE };
        }
      }

      if (mode === OUTPUT_MODE.BLUETOOTH) {
        const bt = devices.find((d) =>
          /bluetooth|airpods|headset|wireless|bt/i.test(d.label || ""),
        );
        if (bt) {
          try {
            await el.setSinkId(bt.deviceId);
            return { ok: true, mode: OUTPUT_MODE.BLUETOOTH };
          } catch (e) {
            console.warn(e);
            setOutputMode(OUTPUT_MODE.EARPIECE);
            return { ok: false, mode: OUTPUT_MODE.EARPIECE };
          }
        }
        console.warn("No Bluetooth output device found, staying on current output");
        setOutputMode(OUTPUT_MODE.EARPIECE);
        return { ok: false, mode: OUTPUT_MODE.EARPIECE };
      }

      const ear =
        devices.find(
          (d) =>
            /communications|earpiece|internal/i.test(d.label || "") ||
            d.deviceId === "communications",
        ) || devices[0];
      if (ear) {
        try {
          await el.setSinkId(ear.deviceId);
          return { ok: true, mode: OUTPUT_MODE.EARPIECE };
        } catch (e) {
          console.warn(e);
        }
      }
      return { ok: true, mode: OUTPUT_MODE.EARPIECE };
    },
    [remoteAudioRef, enumerateOutputs],
  );

  return { outputMode, routeTo, OUTPUT_MODE };
}
