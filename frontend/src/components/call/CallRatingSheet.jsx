import React, { useCallback, useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import "./callOverlay.css";

const REASONS = ["Echo", "Dropped", "Low volume", "Delay"];

export default function CallRatingSheet({ callId, open, onDismiss }) {
  const [rating, setRating] = useState(0);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const autoDismissRef = useRef(null);

  const dismiss = useCallback(() => {
    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current);
      autoDismissRef.current = null;
    }
    setRating(0);
    setReason("");
    onDismiss?.();
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return undefined;
    autoDismissRef.current = setTimeout(() => dismiss(), 3000);
    return () => {
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    };
  }, [open, dismiss]);

  const cancelAutoDismiss = () => {
    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current);
      autoDismissRef.current = null;
    }
  };

  const submit = async (stars, selectedReason) => {
    if (!callId || !stars) return;
    cancelAutoDismiss();
    setSubmitting(true);
    try {
      await api.post("/call-history/rate", {
        call_id: callId,
        rating: stars,
        reason: selectedReason || undefined,
      });
      dismiss();
    } catch (err) {
      toast.error(formatApiError(err));
      dismiss();
    } finally {
      setSubmitting(false);
    }
  };

  const handleStar = (stars) => {
    cancelAutoDismiss();
    setRating(stars);
    if (stars > 3) {
      void submit(stars, "");
      return;
    }
  };

  const handleReason = (chip) => {
    cancelAutoDismiss();
    setReason(chip);
    void submit(rating, chip);
  };

  if (!open) return null;

  return (
    <>
      <div className="call-rating-backdrop" onClick={dismiss} aria-hidden />
      <div className="call-rating-sheet" data-testid="call-rating-sheet">
        <p className="call-rating-title">How was the call quality?</p>
        <div className="call-rating-stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`call-rating-star ${rating >= n ? "active" : ""}`}
              disabled={submitting}
              onClick={() => handleStar(n)}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
            >
              <Star fill={rating >= n ? "currentColor" : "none"} />
            </button>
          ))}
        </div>
        {rating > 0 && rating <= 3 ? (
          <div className="call-rating-chips">
            {REASONS.map((chip) => (
              <button
                key={chip}
                type="button"
                className={`call-rating-chip ${reason === chip ? "active" : ""}`}
                disabled={submitting}
                onClick={() => handleReason(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
