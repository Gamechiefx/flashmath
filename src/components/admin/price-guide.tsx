"use client";

import { GlassCard } from "@/components/ui/glass-card";

export function PriceGuide() {
    return (
        <GlassCard className="p-4 mb-4 bg-white/5 border-white/10">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">Reference Pricing Guide</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
                <div>
                    <span className="block font-bold text-slate-400">COMMON</span>
                    <span className="text-muted-foreground">50 - 100 Flux</span>
                </div>
                <div>
                    <span className="block font-bold text-green-400">UNCOMMON</span>
                    <span className="text-muted-foreground">300 - 500 Flux</span>
                </div>
                <div>
                    <span className="block font-bold text-blue-400">RARE</span>
                    <span className="text-muted-foreground">1,500 - 2,500 Flux</span>
                </div>
                <div>
                    <span className="block font-bold text-purple-400">EPIC</span>
                    <span className="text-muted-foreground">8,000 - 12,000 Flux</span>
                </div>
                <div>
                    <span className="block font-bold text-amber-400">LEGENDARY</span>
                    <span className="text-muted-foreground">30,000 - 50,000+ Flux</span>
                </div>
            </div>
        </GlassCard>
    );
}
