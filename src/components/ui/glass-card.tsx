"use client";

import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";

interface GlassCardProps extends HTMLMotionProps<"div"> {
    children: React.ReactNode;
    className?: string;
    hover?: boolean;
}

export function GlassCard({ children, className, hover = true, ...props }: GlassCardProps) {
    return (
        <motion.div
            whileHover={hover ? { scale: 1.02, y: -5 } : undefined}
            transition={{ type: "spring", stiffness: 300 }}
            className={cn(
                "glass p-6 rounded-2xl relative overflow-hidden group transition-all duration-300",
                className
            )}
            {...props}
        >
            {/* Glossy overlay effect */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            {children}
        </motion.div>
    );
}
