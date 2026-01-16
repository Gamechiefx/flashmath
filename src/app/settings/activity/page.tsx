"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { getSecurityActivity, SecurityActivity } from "@/lib/actions/security";
import {
    ArrowLeft,
    LogIn,
    LogOut,
    Key,
    Shield,
    Link2,
    AlertTriangle,
    Clock,
    type LucideIcon
} from "lucide-react";

const ACTION_ICONS: Record<string, LucideIcon> = {
    login: LogIn,
    logout: LogOut,
    password_change: Key,
    password_reset: Key,
    "2fa_enabled": Shield,
    "2fa_disabled": Shield,
    oauth_linked: Link2,
    oauth_unlinked: Link2,
    failed_login: AlertTriangle,
};

const ACTION_LABELS: Record<string, string> = {
    login: "Signed in",
    logout: "Signed out",
    password_change: "Password changed",
    password_reset: "Password reset",
    "2fa_enabled": "2FA enabled",
    "2fa_disabled": "2FA disabled",
    oauth_linked: "Account linked",
    oauth_unlinked: "Account unlinked",
    failed_login: "Failed login attempt",
};

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // Less than 1 minute
    if (diff < 60000) return "Just now";
    // Less than 1 hour
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    // Less than 24 hours
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    // Less than 7 days
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;

    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

export default function SecurityActivityPage() {
    const [activities, setActivities] = useState<SecurityActivity[]>([]);
    const [loading, setLoading] = useState(true);

    // Define loadActivity before useEffect to avoid "accessed before declaration" error
    const loadActivity = async () => {
        setLoading(true);
        const result = await getSecurityActivity(50);
        setActivities(result);
        setLoading(false);
    };

    useEffect(() => {
        // Defer to avoid setState in effect warning
        setTimeout(() => {
            loadActivity();
        }, 0);
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="animate-pulse text-muted-foreground">Loading activity...</div>
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
                    <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center">
                        <Clock className="w-6 h-6 text-yellow-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Security Activity</h1>
                        <p className="text-muted-foreground">Recent security events on your account</p>
                    </div>
                </div>

                {activities.length === 0 ? (
                    <GlassCard className="p-6 text-center text-muted-foreground">
                        No security activity recorded yet.
                    </GlassCard>
                ) : (
                    <div className="space-y-2">
                        {activities.map((activity) => {
                            const Icon = ACTION_ICONS[activity.action] || AlertTriangle;
                            const label = ACTION_LABELS[activity.action] || activity.action;
                            const isWarning = activity.action === "failed_login";

                            return (
                                <GlassCard key={activity.id} className="p-4">
                                    <div className="flex items-start gap-4">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isWarning
                                                ? "bg-red-500/20 text-red-400"
                                                : "bg-white/5 text-muted-foreground"
                                            }`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className={`font-medium ${isWarning ? "text-red-400" : "text-white"}`}>
                                                    {label}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {formatDate(activity.created_at)}
                                                </span>
                                            </div>
                                            <div className="text-sm text-muted-foreground mt-1">
                                                {activity.details?.provider && (
                                                    <span className="capitalize">{activity.details.provider}</span>
                                                )}
                                                {activity.ip_address && (
                                                    <span> • IP: {activity.ip_address}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </GlassCard>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
