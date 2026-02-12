import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-blue-600 text-white hover:bg-blue-500",
        destructive: "bg-red-500/10 text-red-400 hover:bg-red-500/20",
        outline:
          "border border-zinc-800 bg-transparent hover:bg-zinc-800 text-zinc-300",
        secondary: "bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
        ghost: "hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300",
        link: "text-blue-400 underline-offset-4 hover:underline",
        success: "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20",
        warning: "bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-7 rounded-lg px-3 text-xs",
        lg: "h-10 rounded-lg px-8",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
