"use client";

import { useSession, signOut } from "next-auth/react";
import { Zap, LogOut, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import { SoundToggle } from "./sound-toggle";

interface AuthHeaderProps {
    session?: any;
}

export function AuthHeader({ session: initialSession }: AuthHeaderProps) {
    const { data: clientSession } = useSession();
    const session = initialSession || clientSession;

    if (!session) return (
        <nav className="flex items-center justify-between p-6 relative z-50">
            <Link href="/" className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
                    <Zap size={20} />
                </div>
                <span className="font-black tracking-tighter text-lg">FLASHMATH</span>
            </Link>
            <div className="flex items-center gap-4">
                <SoundToggle />
                <ThemeToggle />
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

                <SoundToggle />
                <ThemeToggle />

                <div className="h-8 w-[1px] bg-white/10 mx-2 hidden md:block" />

                <div className="flex items-center gap-3 pl-2">
                    <div className="text-right hidden sm:block">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-primary line-clamp-1">{session.user?.name}</div>
                    </div>
                    <button
                        onClick={async () => {
                            await signOut({ redirect: false });
                            window.location.href = "/";
                        }}
                        className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-red-500/10 hover:text-red-500 transition-all"
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </div>
        </nav>
    );
}
