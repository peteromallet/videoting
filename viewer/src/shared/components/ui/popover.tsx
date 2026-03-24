import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/shared/lib/utils";

type PopoverContextValue = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
};

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

export interface PopoverProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Popover({ children, open, onOpenChange }: PopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const resolvedOpen = open ?? uncontrolledOpen;
  const setOpen = React.useCallback<React.Dispatch<React.SetStateAction<boolean>>>((value) => {
    const nextValue = typeof value === "function" ? value(resolvedOpen) : value;
    if (open === undefined) {
      setUncontrolledOpen(nextValue);
    }
    onOpenChange?.(nextValue);
  }, [onOpenChange, open, resolvedOpen]);

  return <PopoverContext.Provider value={{ open: resolvedOpen, setOpen, triggerRef }}>{children}</PopoverContext.Provider>;
}

export const PopoverTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(
  ({ asChild = false, children, onClick, ...props }, ref) => {
    const context = React.useContext(PopoverContext);
    if (!context) {
      throw new Error("PopoverTrigger must be used within Popover");
    }

    const setRefs = (node: HTMLElement | null) => {
      context.triggerRef.current = node;
      if (typeof ref === "function") {
        ref(node as HTMLButtonElement | null);
      } else if (ref) {
        ref.current = node as HTMLButtonElement | null;
      }
    };

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ onClick?: (event: React.MouseEvent<HTMLElement>) => void }>;
      return (
        <span
          ref={setRefs as React.Ref<HTMLSpanElement>}
          className="contents"
          onClick={(event) => {
            child.props.onClick?.(event);
            onClick?.(event as unknown as React.MouseEvent<HTMLButtonElement>);
            if (!event.defaultPrevented) {
              context.setOpen((current) => !current);
            }
          }}
        >
          {child}
        </span>
      );
    }

    return (
      <button
        ref={setRefs}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            context.setOpen((current) => !current);
          }
        }}
        {...props}
      >
        {children}
      </button>
    );
  },
);

PopoverTrigger.displayName = "PopoverTrigger";

export interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

export const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, align = "center", sideOffset = 8, style, children, ...props }, ref) => {
    const context = React.useContext(PopoverContext);
    const contentRef = React.useRef<HTMLDivElement | null>(null);
    const [position, setPosition] = React.useState<{ left: number; top: number } | null>(null);

    React.useImperativeHandle(ref, () => contentRef.current as HTMLDivElement);

    React.useEffect(() => {
      if (!context?.open) {
        return;
      }

      const updatePosition = () => {
        const trigger = context.triggerRef.current;
        const content = contentRef.current;
        if (!trigger || !content) {
          return;
        }

        const triggerRect = trigger.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        let left = triggerRect.left;
        if (align === "center") {
          left = triggerRect.left + triggerRect.width / 2 - contentRect.width / 2;
        } else if (align === "end") {
          left = triggerRect.right - contentRect.width;
        }

        const maxLeft = window.innerWidth - contentRect.width - 8;
        setPosition({
          left: Math.max(8, Math.min(maxLeft, left)),
          top: Math.min(window.innerHeight - contentRect.height - 8, triggerRect.bottom + sideOffset),
        });
      };

      updatePosition();
      const handlePointerDown = (event: MouseEvent) => {
        const target = event.target as Node | null;
        if (target && (contentRef.current?.contains(target) || context.triggerRef.current?.contains(target))) {
          return;
        }
        context.setOpen(false);
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          context.setOpen(false);
        }
      };

      window.addEventListener("resize", updatePosition);
      window.addEventListener("scroll", updatePosition, true);
      document.addEventListener("mousedown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("resize", updatePosition);
        window.removeEventListener("scroll", updatePosition, true);
        document.removeEventListener("mousedown", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [align, context, sideOffset]);

    if (!context?.open) {
      return null;
    }

    return createPortal(
      <div
        ref={contentRef}
        className={cn("z-[100010] w-72 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-panel", className)}
        style={{ position: "fixed", left: position?.left ?? 8, top: position?.top ?? 8, ...style }}
        {...props}
      >
        {children}
      </div>,
      document.body,
    );
  },
);

PopoverContent.displayName = "PopoverContent";
