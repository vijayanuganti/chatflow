import React from "react";
import { IconEmoji } from "@/components/chat/ChatIcons";

const EMOJI_GROUPS = [
  "😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊", "😇", "🙂", "😉", "😍", "🥰", "😘", "😗", "😋",
  "😛", "😜", "🤪", "😝", "🤗", "🤭", "🤫", "🤔", "😐", "😑", "😶", "🙄", "😏", "😣", "😥", "😮",
  "👍", "👎", "👏", "🙌", "🤝", "🙏", "💪", "✌️", "🤞", "👌", "🤙", "👋", "🤚", "✋", "🖐️", "👊",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘",
  "🔥", "✨", "⭐", "🌟", "💯", "✅", "❌", "⚠️", "🎉", "🎊", "🎁", "🏆", "📌", "📎", "📷", "📱",
];

/**
 * Full-width emoji keyboard mounted BELOW the composer (pushes chat up).
 */
export default function EmojiPickerPanel({ open, onPick, onClose }) {
  if (!open) return null;

  return (
    <div
      className="w-full shrink-0 border-t border-gray-200 bg-[#f0f2f5] dark:border-gray-800 dark:bg-gray-950"
      data-testid="chat-emoji-picker-panel"
      style={{
        minHeight: "min(42vh, 320px)",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div className="grid grid-cols-8 gap-1 p-3 overflow-y-auto max-h-[min(42vh,320px)]">
        {EMOJI_GROUPS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="h-10 w-full text-2xl rounded-lg hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-transform touch-manipulation"
            onClick={() => onPick?.(emoji)}
            data-testid={`emoji-${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EmojiTriggerButton({ active, disabled, onClick, className }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={className || "h-10 w-10 shrink-0 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center touch-manipulation"}
      data-testid="chat-emoji-btn"
      aria-label="Emoji"
      aria-pressed={active}
    >
      <IconEmoji className="h-[22px] w-[22px]" />
    </button>
  );
}
