import * as React from "react";
import { cn } from "@/shared/lib/utils";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-transparent bg-primary/20 text-primary",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  outline: "border-border text-foreground",
  destructive: "border-transparent bg-destructive/20 text-destructive",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", variantClasses[variant], className)}
      {...props}
    />
  );
}
