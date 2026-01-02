'use client';

import { useEffect } from 'react';
import { soundEngine } from '@/lib/sound-engine';
import { SoundToggle } from '@/components/sound-toggle';
import { MatchmakingQueue } from "@/components/arena/matchmaking-queue";
import { Suspense } from "react";

interface ArenaQueueClientProps {
    data: {
        userId: string;
        name: string;
        level: number;
        mathTiers: Record<string, number>;
        equippedBanner?: string;
        equippedTitle?: string;
    };
    operation: string;
    arenaStats: {
        elo: number;
        rank: string;
        rankDivision: string;
        isRanked?: boolean;
    };
    mode?: string;
}

export function ArenaQueueClient({ data, operation, arenaStats, mode = '1v1' }: ArenaQueueClientProps) {
    // Client-side effect for music
    useEffect(() => {
        // soundEngine.playBGM('bgm_synth_motivation');
        return () => soundEngine.stopBGM();
    }, []);

    return (
        <main className="h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -mr-64 -mt-64" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] -ml-64 -mb-64" />

            {/* Main Content - Full Screen Immersive */}
            <div className="flex-1 w-full max-w-7xl mx-auto relative z-10 flex items-center justify-center">
                <Suspense fallback={<div className="text-center font-black text-white/20 uppercase tracking-widest">Entering Queue...</div>}>
                    <MatchmakingQueue
                        userId={data.userId}
                        userName={data.name || 'Player'}
                        level={data.level || 1}
                        practiceTier={data.mathTiers?.[operation] || data.mathTiers?.addition || 1}
                        rank={arenaStats.rank}
                        division={arenaStats.rankDivision}
                        elo={arenaStats.elo}
                        operation={operation}
                        mode={mode}
                        isRanked={arenaStats.isRanked ?? true}
                        equippedBanner={data.equippedBanner || 'default'}
                        equippedTitle={data.equippedTitle || 'Challenger'}
                    />
                </Suspense>
            </div>

            {/* Sound Toggle */}
            <div className="fixed bottom-8 right-8 z-50">
                <SoundToggle />
            </div>
        </main>
    );
}
