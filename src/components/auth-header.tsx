"use client";

import { useSession, signOut } from "next-auth/react";
import { Zap, LogOut, LayoutDashboard, Settings, Volume2, VolumeX, Trophy, Swords, Maximize2, Minimize2 } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { soundEngine } from "@/lib/sound-engine";
import { UserAvatar } from "@/components/user-avatar";
import { AchievementsPanel } from "@/components/achievements-panel";

interface AuthHeaderProps {
    session?: any;
}

export function AuthHeader({ session: initialSession }: AuthHeaderProps) {
    const { data: clientSession } = useSession();
    const session = clientSession || initialSession;
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [showAchievements, setShowAchievements] = useState(false);

    useEffect(() => {
        setIsMuted(!soundEngine.isEnabled());
    }, []);

    const toggleMute = () => {
        const newMutedState = !isMuted;
        setIsMuted(newMutedState);
        soundEngine.setEnabled(!newMutedState);
    };

    // Fullscreen toggle
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleFullscreen = async () => {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch (err) {
            console.error('Fullscreen error:', err);
        }
    };

    if (!session) return (
        <nav className="w-full bg-black/40 backdrop-blur-xl border-b border-white/10 relative z-50">
            <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
                        <Zap size={20} />
                    </div>
                    <span className="font-black tracking-tighter text-lg">FLASHMATH</span>
                </Link>
                <div className="flex items-center gap-4">
                    <Link href="/auth/login" className="text-sm font-bold uppercase tracking-widest hover:text-primary transition-colors">Login</Link>
                </div>
            </div>
        </nav>
    );

    return (
        <>
            <nav className="w-full bg-black/40 backdrop-blur-xl border-b border-white/10 relative z-50">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    {/* Left side: Logo + Nav Links */}
                    <div className="flex items-center gap-6">
                        <Link href="/" className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
                                <Zap size={20} />
                            </div>
                            <span className="font-black tracking-tighter text-lg uppercase tracking-widest text-primary">FlashMath</span>
                        </Link>

                        <div className="h-8 w-[1px] bg-white/10 hidden md:block" />

                        <div className="hidden md:flex items-center gap-6">
                            <Link href="/dashboard" className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">
                                <LayoutDashboard size={14} />
                                Dashboard
                            </Link>
                            <Link href="/practice" className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">
                                <Zap size={14} />
                                Practice
                            </Link>
                            <Link href="/arena" className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-accent hover:text-accent/80 transition-colors">
                                <Swords size={14} />
                                FlashArena
                            </Link>
                        </div>
                    </div>

                    {/* Right side: User Dropdown */}
                    <div
                        className="relative"
                        onMouseEnter={() => setIsDropdownOpen(true)}
                        onMouseLeave={() => setIsDropdownOpen(false)}
                    >
                        <div className="flex items-center gap-4 pl-2 cursor-pointer">
                            <div className="text-right hidden sm:block">
                                <div className="text-sm font-black uppercase tracking-widest text-primary line-clamp-1">{session.user?.name}</div>
                                {(session.user as any)?.equippedTitleName && (
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-accent mb-0.5">
                                        {(session.user as any).equippedTitleName}
                                    </div>
                                )}
                                <div className="flex items-center justify-end gap-3 mt-1">
                                    <span className="text-xs font-bold text-white/70">XP LVL: <span className="text-white">{(session.user as any)?.level || 1}</span></span>
                                    <span className="text-xs font-bold text-yellow-400/70">§ <span className="text-yellow-400">{(session.user as any)?.coins || 0}</span></span>
                                </div>
                            </div>
                            <UserAvatar user={session.user} size="md" key={session.user?.equipped_items?.frame || 'default'} />
                        </div>

                        {/* Dropdown Menu */}
                        {isDropdownOpen && (
                            <div className="absolute right-0 top-full pt-2">
                                <div className="w-56 bg-black/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                                    {/* Sound Toggle */}
                                    <button
                                        onClick={toggleMute}
                                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                                    >
                                        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                                        <span className="text-sm font-bold uppercase tracking-widest">
                                            Sound {isMuted ? "Off" : "On"}
                                        </span>
                                    </button>

                                    {/* Fullscreen Toggle */}
                                    <button
                                        onClick={toggleFullscreen}
                                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/10 transition-colors text-left text-red-400"
                                    >
                                        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                                        <span className="text-sm font-bold uppercase tracking-widest">
                                            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                                        </span>
                                    </button>

                                    <div className="h-[1px] bg-white/10 my-1" />

                                    {/* Achievements */}
                                    <button
                                        onClick={() => {
                                            setShowAchievements(true);
                                            setIsDropdownOpen(false);
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/10 transition-colors text-left"
                                    >
                                        <Trophy size={16} className="text-accent" />
                                        <span className="text-sm font-bold uppercase tracking-widest">Achievements</span>
                                    </button>

                                    {/* Settings Link */}
                                    <Link
                                        href="/settings"
                                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
                                    >
                                        <Settings size={16} />
                                        <span className="text-sm font-bold uppercase tracking-widest">Settings</span>
                                    </Link>

                                    <div className="h-[1px] bg-white/10 my-1" />

                                    {/* Logout */}
                                    <button
                                        onClick={async () => {
                                            await signOut({ redirect: false });
                                            window.location.href = "/";
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors text-left"
                                    >
                                        <LogOut size={16} />
                                        <span className="text-sm font-bold uppercase tracking-widest">Logout</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </nav>

            <AchievementsPanel
                isOpen={showAchievements}
                onClose={() => setShowAchievements(false)}
            />
        </>
    );
}
