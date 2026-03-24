import * as React from "react";
import { cn } from "@/shared/lib/utils";

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange"> {
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
}

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, min = 0, max = 100, step = 1, value, defaultValue, onValueChange, ...props }, ref) => {
    const resolvedValue = value?.[0] ?? defaultValue?.[0] ?? Number(min);
    return (
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        step={step}
        value={resolvedValue}
        onChange={(event) => onValueChange?.([Number(event.currentTarget.value)])}
        className={cn("h-2 w-full cursor-pointer appearance-none rounded-full bg-editor-surface1 accent-[hsl(var(--primary))]", className)}
        {...props}
      />
    );
  },
);

Slider.displayName = "Slider";
