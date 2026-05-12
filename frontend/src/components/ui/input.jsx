import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Default the browser's autofill and "recent searches" off. Pages that
 * legitimately want autofill (the login form, password managers, etc.) can
 * still opt in by passing the matching `autoComplete` token explicitly,
 * which overrides the default below.
 *
 * `data-form-type="other"`, `data-1p-ignore` and `data-lpignore` tell
 * 1Password, LastPass and Bitwarden to skip the field as well — these
 * extensions ignore `autoComplete="off"` on their own.
 */
const Input = React.forwardRef((
  {
    className,
    type,
    autoComplete = "off",
    spellCheck = false,
    autoCorrect = "off",
    autoCapitalize = "off",
    ...props
  },
  ref,
) => {
  return (
    <input
      type={type}
      autoComplete={autoComplete}
      spellCheck={spellCheck}
      autoCorrect={autoCorrect}
      autoCapitalize={autoCapitalize}
      data-form-type={props["data-form-type"] || "other"}
      data-1p-ignore={props["data-1p-ignore"] ?? "true"}
      data-lpignore={props["data-lpignore"] ?? "true"}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />
  );
})
Input.displayName = "Input"

export { Input }
