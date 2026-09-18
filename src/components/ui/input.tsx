import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm text-foreground tabular placeholder:text-subtle",
      "transition-[box-shadow,border-color] duration-150",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
      "disabled:cursor-not-allowed disabled:opacity-40",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";
