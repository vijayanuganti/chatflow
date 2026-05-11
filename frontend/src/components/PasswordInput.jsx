import React, { forwardRef, useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Password input with built-in show/hide toggle.
 *
 * Props:
 * - leftIcon: optional Lucide icon to show on the left (defaults to Lock; pass `null` to omit)
 * - className: forwarded to the underlying Input
 * - any other props (value, onChange, placeholder, ...) are forwarded
 */
const PasswordInput = forwardRef(function PasswordInput(
  { leftIcon: LeftIcon = Lock, className, ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      {LeftIcon && (
        <LeftIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
      )}
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        className={cn(LeftIcon ? "pl-10 pr-11" : "pr-11", className)}
        {...rest}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        data-testid="password-toggle-btn"
        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});

export default PasswordInput;
