"use client";

import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";

interface NeonButtonProps extends HTMLMotionProps<"button"> {
    children: React.ReactNode;
    variant?: "primary" | "accent";
    className?: string;
}

export function NeonButton({
    children,
    variant = "primary",
    className,
    ...props
}: NeonButtonProps) {
    const isPrimary = variant === "primary";

    return (
        <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
            className={cn(
                "px-6 py-3 rounded-xl font-bold transition-all relative overflow-hidden group",
                isPrimary
                    ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(2,132,199,0.3)] dark:shadow-[0_0_15px_rgba(34,211,238,0.4)]"
                    : "bg-accent text-primary-foreground shadow-[0_0_15px_var(--accent-glow)]",
                className
            )}
            {...props}
        >
            {/* Inner glow/sheen */}
            <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
            <span className="relative z-10">{children}</span>
        </motion.button>
    );
}
