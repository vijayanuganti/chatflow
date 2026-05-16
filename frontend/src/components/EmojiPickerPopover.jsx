import React from "react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const EMOJI_GROUPS = [
  "😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊", "😇", "🙂", "😉", "😍", "🥰", "😘", "😗", "😋",
  "😛", "😜", "🤪", "😝", "🤗", "🤭", "🤫", "🤔", "😐", "😑", "😶", "🙄", "😏", "😣", "😥", "😮",
  "👍", "👎", "👏", "🙌", "🤝", "🙏", "💪", "✌️", "🤞", "👌", "🤙", "👋", "🤚", "✋", "🖐️", "👊",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘",
  "🔥", "✨", "⭐", "🌟", "💯", "✅", "❌", "⚠️", "🎉", "🎊", "🎁", "🏆", "📌", "📎", "📷", "📱",
];

/**
 * WhatsApp-style emoji button — inserts emoji at textarea cursor.
 */
export default function EmojiPickerPopover({
  disabled,
  onPick,
  triggerClassName,
  triggerIcon,
}) {
  const [open, setOpen] = React.useState(false);

  const handlePick = (emoji) => {
    onPick?.(emoji);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={triggerClassName || "shrink-0 rounded-full text-gray-500 hover:text-emerald-900 dark:hover:text-emerald-300"}
          disabled={disabled}
          data-testid="chat-emoji-btn"
          title="Emoji"
          aria-label="Emoji"
        >
          {triggerIcon || <Smile className="h-5 w-5" strokeWidth={1.5} />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={10}
        className="w-[min(100vw-2rem,18rem)] p-2 rounded-2xl"
        data-testid="chat-emoji-picker"
      >
        <div className="grid grid-cols-8 gap-0.5 max-h-44 overflow-y-auto">
          {EMOJI_GROUPS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="h-9 w-9 text-xl rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center"
              onClick={() => handlePick(emoji)}
              data-testid={`emoji-${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
