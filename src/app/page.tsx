"use client";

import { motion } from "framer-motion";
import { Zap, Brain, Trophy, ArrowRight, Play } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <main className="relative min-h-screen flex flex-col overflow-hidden">
      {/* Theme Toggle Utility */}
      <div className="absolute top-6 right-6 z-50">
        <ThemeToggle />
      </div>

      {/* Background Animated Geometry */}

      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -left-20 w-[600px] h-[600px] bg-primary/40 dark:bg-primary/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute -bottom-20 -right-20 w-[600px] h-[600px] bg-accent/40 dark:bg-accent/10 rounded-full blur-[150px] animate-pulse delay-1000" />
      </div>

      {/* Hero Section */}
      <div className="relative z-10 container mx-auto px-6 flex-1 flex flex-col justify-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            <span>Next-Gen Speed Math</span>
          </div>

          <h1 className="text-6xl md:text-8xl font-black mb-6 tracking-tighter text-foreground">
            <motion.span
              animate={{
                backgroundPosition: ["200% center", "-200% center"],
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: "linear"
              }}
              style={{
                backgroundImage: "linear-gradient(90deg, var(--color-primary) 0%, var(--color-accent) 25%, #ffffff 50%, var(--color-accent) 75%, var(--color-primary) 100%)",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
              className="inline-block"
            >
              FLASH
            </motion.span>
            MATH
          </h1>

          <p className="max-w-2xl mx-auto text-lg md:text-xl text-muted-foreground mb-10 text-balance font-medium">
            Master arithmetic at lightning speed. Adaptive practice designed for future mathematicians.
            Enjoyable, addicting, and scientifically effective.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/practice">
              <NeonButton className="flex items-center gap-2">
                <Play className="fill-current" size={18} />
                Quick Practice
              </NeonButton>
            </Link>
            <Link href="/auth">
              <button className="px-6 py-3 rounded-xl font-bold border border-foreground/10 hover:bg-foreground/5 transition-all text-foreground flex items-center gap-2">
                Full Mastery
                <ArrowRight size={18} />
              </button>
            </Link>
          </div>

          <div className="mt-12">
            <Link href="/why-flash-math" className="text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-2 font-semibold">
              <Trophy className="w-5 h-5" />
              Why Flash Math?
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>
      </div>

      {/* Modern Footer */}
      <footer className="relative z-10 w-full py-10 border-t border-foreground/5 shrink-0">
        <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
          © 2025 FlashMath Ecosystem. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
