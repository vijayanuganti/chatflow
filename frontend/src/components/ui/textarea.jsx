import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef((
  {
    className,
    autoComplete = "off",
    spellCheck = false,
    autoCorrect = "off",
    autoCapitalize = "off",
    ...props
  },
  ref,
) => {
  return (
    <textarea
      autoComplete={autoComplete}
      spellCheck={spellCheck}
      autoCorrect={autoCorrect}
      autoCapitalize={autoCapitalize}
      data-form-type={props["data-form-type"] || "other"}
      data-1p-ignore={props["data-1p-ignore"] ?? "true"}
      data-lpignore={props["data-lpignore"] ?? "true"}
      className={cn(
        "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />
  );
})
Textarea.displayName = "Textarea"

export { Textarea }
