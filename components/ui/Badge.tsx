import { cn } from "@/lib/cn";
import { type HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "success" | "warning" | "danger" | "info" | "neutral" | "primary";
}

const variantClasses: Record<NonNullable<BadgeProps["variant"]>, string> = {
  success: "bg-green-100 text-green-800 border border-green-200",
  warning: "bg-amber-100 text-amber-800 border border-amber-200",
  danger: "bg-red-100  text-red-800  border border-red-200",
  info: "bg-blue-100 text-blue-800 border border-blue-200",
  neutral: "bg-gray-100 text-gray-700 border border-gray-200",
  primary: "bg-primary-50 text-primary-800 border border-primary-100",
};

export function Badge({
  variant = "neutral",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
