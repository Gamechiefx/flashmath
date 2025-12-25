"use client";

import { useSession, signOut } from "next-auth/react";
import { Zap, LogOut, LayoutDashboard, Settings, Moon, Sun, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { soundEngine } from "@/lib/sound-engine";
import { UserAvatar } from "@/components/user-avatar";

interface AuthHeaderProps {
    session?: any;
}

export function AuthHeader({ session: initialSession }: AuthHeaderProps) {
    const { data: clientSession } = useSession();
    const session = clientSession || initialSession;
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const { theme, setTheme } = useTheme();

    useEffect(() => {
        // Initialize mute state from soundEngine
        setIsMuted(!soundEngine.isEnabled());
    }, []);

    const toggleMute = () => {
        const newMutedState = !isMuted;
        setIsMuted(newMutedState);
        soundEngine.setEnabled(!newMutedState);
    };

    if (!session) return (
        <nav className="flex items-center justify-between p-6 relative z-50">
            <Link href="/" className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
                    <Zap size={20} />
                </div>
                <span className="font-black tracking-tighter text-lg">FLASHMATH</span>
            </Link>
            <div className="flex items-center gap-4">
                <Link href="/auth/login" className="text-sm font-bold uppercase tracking-widest hover:text-primary transition-colors">Login</Link>
            </div>
        </nav>
    );

    return (
        <nav className="flex items-center justify-between p-6 relative z-50">
            <Link href="/" className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
                    <Zap size={20} />
                </div>
                <span className="font-black tracking-tighter text-lg uppercase tracking-widest text-primary">FlashMath</span>
            </Link>

            <div className="flex items-center gap-4">
                <div className="hidden md:flex items-center gap-6 mr-4">
                    <Link href="/dashboard" className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">
                        <LayoutDashboard size={14} />
                        Dashboard
                    </Link>
                    <Link href="/practice" className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">
                        <Zap size={14} />
                        Practice
                    </Link>
                </div>

                <div className="h-8 w-[1px] bg-white/10 mx-2 hidden md:block" />

                {/* User Dropdown */}
                <div
                    className="relative"
                    onMouseEnter={() => setIsDropdownOpen(true)}
                    onMouseLeave={() => setIsDropdownOpen(false)}
                >
                    <div className="flex items-center gap-3 pl-2 cursor-pointer">
                        <div className="text-right hidden sm:block">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-primary line-clamp-1">{session.user?.name}</div>
                            {(() => {
                                const { loadData } = require("@/lib/db");
                                const db = loadData();
                                const titleId = (session.user as any)?.equipped_items?.title;
                                const titleItem = db.shop_items.find((i: any) => i.id === titleId);
                                if (titleItem && titleId !== 'default') {
                                    // Use name from database (editable by admin), fallback to assetValue
                                    return <div className="text-[8px] font-black uppercase tracking-widest text-accent mb-0.5">{titleItem.name || titleItem.assetValue}</div>
                                }
                                return null;
                            })()}
                            <div className="text-[8px] font-mono text-white/40 uppercase tracking-tighter">LVL {(session.user as any)?.level || 1} • § {(session.user as any)?.coins || 0}</div>
                        </div>
                        <UserAvatar user={session.user} size="sm" key={session.user?.equipped_items?.frame || 'default'} />
                    </div>

                    {/* Dropdown Menu */}
                    {isDropdownOpen && (
                        <div className="absolute right-0 top-full pt-2">
                            <div className="w-56 bg-black/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                                {/* Theme Toggle */}
                                <button
                                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                                >
                                    {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
                                    <span className="text-sm font-bold uppercase tracking-widest">
                                        {theme === "dark" ? "Dark" : "Light"} Mode
                                    </span>
                                </button>

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

                                <div className="h-[1px] bg-white/10 my-1" />

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
    );
}
