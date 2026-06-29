import React from "react";
import { X } from "lucide-react";
import "./callOverlay.css";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function sendDtmf(peerConnectionRef, digit) {
  const pc = peerConnectionRef?.current;
  if (!pc) return;
  const senders = pc.getSenders?.() || [];
  for (const sender of senders) {
    if (sender.track?.kind === "audio" && sender.dtmf) {
      try {
        sender.dtmf.insertDTMF(digit, 100, 70);
      } catch {
        /* ignore */
      }
      return;
    }
  }
}

export default function CallKeypad({ open, onClose, peerConnectionRef }) {
  return (
    <>
      <div
        className={`call-keypad-backdrop ${open ? "open" : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <div
        className={`call-keypad-sheet ${open ? "open" : ""}`}
        role="dialog"
        aria-label="Dial keypad"
        data-testid="call-keypad-sheet"
      >
        <div className="call-keypad-header">
          <span className="call-keypad-title">Keypad</span>
          <button type="button" className="call-keypad-close" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="call-keypad-grid">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className="call-keypad-key"
              onClick={() => sendDtmf(peerConnectionRef, key)}
            >
              {key}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
