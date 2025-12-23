
"use client";

import { motion } from "framer-motion";
import { ArrowRight, BookOpen, RefreshCw } from "lucide-react";

interface HelpModalProps {
    explanation: string;
    onNext: () => void;
}

export function HelpModal({ explanation, onNext }: HelpModalProps) {
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-zinc-900 border border-red-900/50 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative"
            >
                <div className="flex items-center gap-4 mb-4 text-red-400">
                    <div className="p-3 bg-red-900/20 rounded-full">
                        <BookOpen className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold">Concept Review</h3>
                </div>

                <div className="bg-zinc-800/50 rounded-xl p-6 mb-6 border border-zinc-700/50">
                    <p className="text-lg text-zinc-200 leading-relaxed font-medium">
                        {explanation}
                    </p>
                </div>

                <div className="flex justify-end">
                    <button
                        onClick={onNext}
                        className="bg-white text-black hover:bg-zinc-200 px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95"
                    >
                        <span>Got it, Next Problem</span>
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
