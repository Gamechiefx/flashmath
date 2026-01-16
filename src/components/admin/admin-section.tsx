"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface AdminSectionProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

export function AdminSection({ title, children, defaultOpen = false }: AdminSectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="space-y-4">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 w-full text-left p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/10 group"
            >
                {isOpen ? <ChevronDown className="text-primary" /> : <ChevronRight className="text-muted-foreground group-hover:text-white" />}
                <span className="text-xl font-bold uppercase tracking-widest">{title}</span>
            </button>

            {isOpen && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                    {children}
                </div>
            )}
        </div>
    );
}
