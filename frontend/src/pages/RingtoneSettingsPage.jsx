import React, { useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Bell, Play, Volume2, VolumeX } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/context/AuthContext";
import { useCall } from "@/context/CallContext";
import { CHATFLOW_TONES, TONE_NONE } from "@/lib/ringtones";
import { panelBase } from "@/lib/appRoutes";
import { toast } from "sonner";
import "@/components/call/callOverlay.css";

const ALL_TONES = [...CHATFLOW_TONES, TONE_NONE];

function toneIconGradient(id) {
  const colors = {
    classic: ["#6366f1", "#8b5cf6"],
    breeze: ["#0ea5e9", "#6366f1"],
    echo: ["#64748b", "#94a3b8"],
    pulse: ["#f59e0b", "#ef4444"],
    chime: ["#22c55e", "#0d9488"],
    none: ["#374151", "#4b5563"],
  };
  const [a, b] = colors[id] || colors.classic;
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

export default function RingtoneSettingsPage({ panelLayout = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const contactId = searchParams.get("contactId") || location.state?.contactId || null;
  const contactName = location.state?.contactName || null;
  const { ringtoneSettings, updateRingtone, previewTone } = useCall();

  const backTo = location.state?.backTo || panelBase(user?.role);

  const effectiveToneId = useMemo(() => {
    if (contactId && ringtoneSettings.contactOverrides?.[contactId]) {
      return ringtoneSettings.contactOverrides[contactId];
    }
    return ringtoneSettings.toneId;
  }, [contactId, ringtoneSettings]);

  const setTone = (toneId) => {
    if (contactId) {
      const next = { ...(ringtoneSettings.contactOverrides || {}), [contactId]: toneId };
      updateRingtone({ contactOverrides: next });
      toast.success(`Ringtone saved for ${contactName || "contact"}`);
      return;
    }
    updateRingtone({ toneId });
  };

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(backTo);
  };

  const pickDeviceRingtone = async () => {
    if (window.ChatFlowNative?.pickRingtone) {
      try {
        const result = await window.ChatFlowNative.pickRingtone();
        if (result?.uri) updateRingtone({ deviceRingtoneUri: result.uri, toneId: "none" });
      } catch {
        toast.message("Open Settings → Sound → Phone ringtone to change");
      }
      return;
    }
    toast.message("Open Settings → Sound → Phone ringtone to change");
  };

  return (
    <div
      className={`ringtone-settings-page ${panelLayout ? "embedded" : ""}`}
      data-testid="ringtone-settings-page"
    >
      <header className="ringtone-settings-header">
        <button type="button" className="ringtone-settings-back" onClick={handleBack} aria-label="Go back">
          <ArrowLeft />
        </button>
        <h1>{contactId ? "Custom ringtone" : "Ringtone"}</h1>
        {contactName ? <p className="ringtone-settings-sub">{contactName}</p> : null}
      </header>

      <main className="ringtone-settings-body">
        {!contactId ? (
          <section className="ringtone-settings-section">
            <div className="ringtone-volume-row">
              <VolumeX className="h-4 w-4 opacity-50" aria-hidden />
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={ringtoneSettings.volume}
                onChange={(e) => updateRingtone({ volume: Number(e.target.value) })}
                className="ringtone-volume-slider"
                data-testid="ringtone-volume-slider"
              />
              <Volume2 className="h-4 w-4 opacity-50" aria-hidden />
            </div>
          </section>
        ) : null}

        <section className="ringtone-settings-section">
          <h2>ChatFlow tones</h2>
          <ul className="ringtone-tone-list">
            {ALL_TONES.map((tone) => (
              <li key={tone.id} className="ringtone-tone-row">
                <span
                  className="ringtone-tone-icon"
                  style={{ background: toneIconGradient(tone.id) }}
                >
                  <Bell className="h-4 w-4 text-white" />
                </span>
                <div className="ringtone-tone-meta">
                  <div className="ringtone-tone-name">{tone.label}</div>
                  <div className="ringtone-tone-desc">{tone.description}</div>
                </div>
                {tone.id !== "none" ? (
                  <button
                    type="button"
                    className="ringtone-preview-btn"
                    onClick={() => previewTone(tone.id)}
                    aria-label={`Preview ${tone.label}`}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <span className="w-[26px]" />
                )}
                <button
                  type="button"
                  className={`ringtone-radio ${effectiveToneId === tone.id ? "selected" : ""}`}
                  onClick={() => setTone(tone.id)}
                  aria-label={`Select ${tone.label}`}
                  data-testid={`ringtone-option-${tone.id}`}
                />
              </li>
            ))}
          </ul>
        </section>

        {!contactId && Capacitor.isNativePlatform() ? (
          <section className="ringtone-settings-section">
            <h2>Device ringtones</h2>
            <button
              type="button"
              className="ringtone-device-row"
              onClick={() => updateRingtone({ deviceRingtoneUri: null })}
            >
              <span>Default phone tone</span>
              <span className={`ringtone-radio ${!ringtoneSettings.deviceRingtoneUri ? "selected" : ""}`} />
            </button>
            <button type="button" className="ringtone-device-row" onClick={() => void pickDeviceRingtone()}>
              <span>Choose from device</span>
              <span className={`ringtone-radio ${ringtoneSettings.deviceRingtoneUri ? "selected" : ""}`} />
            </button>
          </section>
        ) : null}

        {!contactId ? (
          <section className="ringtone-settings-section">
            <h2>Vibration</h2>
            <div className="ringtone-vibrate-row">
              <span>Vibrate on call</span>
              <button
                type="button"
                className={`ringtone-toggle ${ringtoneSettings.vibrate ? "on" : ""}`}
                role="switch"
                aria-checked={ringtoneSettings.vibrate}
                onClick={() => updateRingtone({ vibrate: !ringtoneSettings.vibrate })}
                data-testid="ringtone-vibrate-toggle"
              />
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
