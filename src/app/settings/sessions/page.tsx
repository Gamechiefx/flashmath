"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { getUserSessions, revokeSession, revokeAllOtherSessions, UserSession } from "@/lib/actions/sessions";
import { Monitor, Smartphone, ArrowLeft, LogOut, AlertTriangle, Globe } from "lucide-react";

function parseUserAgent(ua: string | null): { device: string; browser: string } {
    if (!ua) return { device: "Unknown", browser: "Unknown" };

    // Simple parsing - could be more sophisticated
    const isMobile = /mobile|android|iphone|ipad/i.test(ua);
    const device = isMobile ? "Mobile" : "Desktop";

    let browser = "Unknown";
    if (ua.includes("Chrome")) browser = "Chrome";
    else if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Safari")) browser = "Safari";
    else if (ua.includes("Edge")) browser = "Edge";

    return { device, browser };
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function SessionsPage() {
    const [sessions, setSessions] = useState<UserSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [revoking, setRevoking] = useState<string | null>(null);
    const [revokingAll, setRevokingAll] = useState(false);

    useEffect(() => {
        loadSessions();
    }, []);

    const loadSessions = async () => {
        setLoading(true);
        const result = await getUserSessions();
        setSessions(result);
        setLoading(false);
    };

    const handleRevoke = async (sessionId: string) => {
        setRevoking(sessionId);
        const result = await revokeSession(sessionId);
        if (result.success) {
            setSessions(sessions.filter(s => s.id !== sessionId));
        }
        setRevoking(null);
    };

    const handleRevokeAll = async () => {
        setRevokingAll(true);
        const result = await revokeAllOtherSessions();
        if (result.success) {
            loadSessions();
        }
        setRevokingAll(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="animate-pulse text-muted-foreground">Loading sessions...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background p-4 md:p-8">
            <div className="max-w-2xl mx-auto">
                <Link
                    href="/settings"
                    className="flex items-center gap-2 text-muted-foreground hover:text-white transition-colors mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Settings
                </Link>

                <div className="flex items-center gap-3 mb-8">
                    <div className="w-12 h-12 bg-accent/20 rounded-xl flex items-center justify-center">
                        <Monitor className="w-6 h-6 text-accent" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Active Sessions</h1>
                        <p className="text-muted-foreground">Manage devices where you're logged in</p>
                    </div>
                </div>

                {sessions.length > 1 && (
                    <GlassCard className="p-4 mb-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-yellow-400">
                                <AlertTriangle className="w-4 h-4" />
                                <span className="text-sm">Logged in on {sessions.length} devices</span>
                            </div>
                            <NeonButton
                                variant="accent"
                                onClick={handleRevokeAll}
                                disabled={revokingAll}
                            >
                                {revokingAll ? "Logging out..." : "Logout All Devices"}
                            </NeonButton>
                        </div>
                    </GlassCard>
                )}

                <div className="space-y-4">
                    {sessions.length === 0 ? (
                        <GlassCard className="p-6 text-center text-muted-foreground">
                            No active sessions found
                        </GlassCard>
                    ) : (
                        sessions.map((session) => {
                            const { device, browser } = parseUserAgent(session.user_agent);
                            const DeviceIcon = device === "Mobile" ? Smartphone : Monitor;

                            return (
                                <GlassCard key={session.id} className="p-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-4">
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${session.is_current
                                                    ? "bg-green-500/20 text-green-400"
                                                    : "bg-white/5 text-muted-foreground"
                                                }`}>
                                                <DeviceIcon className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-white">{browser} on {device}</span>
                                                    {session.is_current && (
                                                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                                                            Current
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                                    {session.ip_address && (
                                                        <>
                                                            <Globe className="w-3 h-3" />
                                                            <span>{session.ip_address}</span>
                                                            <span>•</span>
                                                        </>
                                                    )}
                                                    <span>Active since {formatDate(session.created_at)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {!session.is_current && (
                                            <button
                                                onClick={() => handleRevoke(session.id)}
                                                disabled={revoking === session.id}
                                                className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                                title="Revoke session"
                                            >
                                                <LogOut className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </GlassCard>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
