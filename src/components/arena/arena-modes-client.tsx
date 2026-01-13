'use client';

import { useEffect } from 'react';
import { soundEngine } from '@/lib/sound-engine';

import { AuthHeader } from "@/components/auth-header";
import { ModeSelection } from "@/components/arena/mode-selection";

interface ArenaModesClientProps {
    session: any;
    arenaStats: any;
}

/**
 * Render the arena modes UI with header, decorative backgrounds, and mode selection.
 *
 * This component mounts the arena modes page and ensures any playing background
 * music is stopped when the component unmounts.
 *
 * @param session - The current user's session object passed to the AuthHeader
 * @param arenaStats - Arena statistics passed to the ModeSelection component
 * @returns The React element for the arena modes page
 */
export function ArenaModesClient({ session, arenaStats }: ArenaModesClientProps) {
    // Client-side effect for music
    useEffect(() => {
        // soundEngine.playBGM('bgm_deep_space'); // Removed forced BGM
        return () => soundEngine.stopBGM();
    }, []);

    return (
        <main className="h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
            {/* Auth Header */}
            <AuthHeader session={session} />

            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -mr-64 -mt-64" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] -ml-64 -mb-64" />

            {/* Main Content Filler */}
            <div className="flex-1 w-full relative z-10 overflow-hidden">
                <ModeSelection arenaStats={arenaStats} />
            </div>

        </main>
    );
}