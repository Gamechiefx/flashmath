'use client';

/**
 * LiveTypingIndicator
 * 
 * Shows what the active player is currently typing.
 * Displayed to teammates watching the active player.
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface LiveTypingIndicatorProps {
    playerName: string;
    currentInput: string;
    className?: string;
}

export function LiveTypingIndicator({
    playerName,
    currentInput,
    className,
}: LiveTypingIndicatorProps) {
    const hasInput = currentInput.length > 0;
    
    return (
        <div className={cn("text-center", className)}>
            <p className="text-sm text-white/50 mb-2">
                {playerName} is typing:
            </p>
            
            <div className="inline-flex items-center gap-1 px-6 py-3 
                            bg-white/5 rounded-xl border border-white/10">
                {/* Typed digits */}
                <motion.span
                    key={currentInput}
                    initial={{ opacity: 0.5, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-2xl font-mono font-bold text-white min-w-[60px]"
                >
                    {hasInput ? currentInput : (
                        <span className="text-white/30">···</span>
                    )}
                </motion.span>
                
                {/* Blinking cursor */}
                <motion.span
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="w-0.5 h-6 bg-primary rounded-full"
                />
            </div>
            
            {/* Typing indicator dots (when actively typing) */}
            {hasInput && (
                <div className="flex items-center justify-center gap-1 mt-2">
                    {[0, 1, 2].map((i) => (
                        <motion.div
                            key={i}
                            animate={{
                                y: [-2, 2, -2],
                                opacity: [0.5, 1, 0.5],
                            }}
                            transition={{
                                duration: 0.6,
                                repeat: Infinity,
                                delay: i * 0.15,
                            }}
                            className="w-1.5 h-1.5 rounded-full bg-primary/60"
                        />
                    ))}
                </div>
            )}
        </div>
    );
}


