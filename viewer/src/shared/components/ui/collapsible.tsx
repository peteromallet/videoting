import * as React from "react";

type CollapsibleContextValue = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(null);

export interface CollapsibleProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Collapsible({ children, defaultOpen = false, open, onOpenChange }: CollapsibleProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const resolvedOpen = open ?? uncontrolledOpen;
  const setOpen = React.useCallback<React.Dispatch<React.SetStateAction<boolean>>>((value) => {
    const nextValue = typeof value === "function" ? value(resolvedOpen) : value;
    if (open === undefined) {
      setUncontrolledOpen(nextValue);
    }
    onOpenChange?.(nextValue);
  }, [onOpenChange, open, resolvedOpen]);

  return <CollapsibleContext.Provider value={{ open: resolvedOpen, setOpen }}>{children}</CollapsibleContext.Provider>;
}

export const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ onClick, ...props }, ref) => {
    const context = React.useContext(CollapsibleContext);
    if (!context) {
      throw new Error("CollapsibleTrigger must be used within Collapsible");
    }

    return (
      <button
        ref={ref}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            context.setOpen((current) => !current);
          }
        }}
        {...props}
      />
    );
  },
);

CollapsibleTrigger.displayName = "CollapsibleTrigger";

export function CollapsibleContent({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(CollapsibleContext);
  if (!context) {
    throw new Error("CollapsibleContent must be used within Collapsible");
  }

  if (!context.open) {
    return null;
  }

  return <div {...props}>{children}</div>;
}
