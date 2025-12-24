"use client";

import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";

interface NeonButtonProps extends HTMLMotionProps<"button"> {
    children: React.ReactNode;
    variant?: "primary" | "accent" | "secondary" | "ghost";
    size?: "default" | "sm" | "lg";
    className?: string;
}

export function NeonButton({
    children,
    variant = "primary",
    size = "default",
    className,
    ...props
}: NeonButtonProps) {
    return (
        <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
            className={cn(
                "rounded-xl font-bold transition-all relative overflow-hidden group border border-transparent flex items-center justify-center gap-2",
                // Sizes
                size === "default" && "px-6 py-3 text-base",
                size === "sm" && "px-4 py-2 text-xs",
                size === "lg" && "px-8 py-4 text-lg",
                // Variants
                variant === "primary" && "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(2,132,199,0.3)] dark:shadow-[0_0_15px_rgba(34,211,238,0.4)]",
                variant === "accent" && "bg-accent text-primary-foreground shadow-[0_0_15px_var(--accent-glow)]",
                variant === "secondary" && "bg-muted text-muted-foreground hover:bg-muted/80",
                variant === "ghost" && "bg-transparent hover:bg-white/5 border-white/10",
                className
            )}
            {...props}
        >
            {/* Inner glow/sheen */}
            < div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
            <span className="relative z-10">{children}</span>
        </motion.button >
    );
}
