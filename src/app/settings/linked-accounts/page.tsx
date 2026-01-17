"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { getLinkedAccounts, unlinkAccount } from "@/lib/actions/security";
import { signInWithGoogle } from "@/lib/actions/auth";
import { ArrowLeft, Link2, Unlink } from "lucide-react";


function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

export default function LinkedAccountsPage() {
    const [accounts, setAccounts] = useState<Array<{ provider: string; provider_account_id: string; created_at: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [unlinking, setUnlinking] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Define loadAccounts before useEffect to avoid "accessed before declaration" error
    const loadAccounts = async () => {
        setLoading(true);
        const result = await getLinkedAccounts();
        setAccounts(result);
        setLoading(false);
    };

    useEffect(() => {
        // Defer to avoid setState in effect warning
        setTimeout(() => {
            loadAccounts();
        }, 0);
    }, []);

    const handleUnlink = async (provider: string) => {
        setUnlinking(provider);
        setError(null);

        const result = await unlinkAccount(provider);

        if (result.success) {
            setAccounts(accounts.filter(a => a.provider !== provider));
        } else {
            setError(result.error || "Failed to unlink account");
        }

        setUnlinking(null);
    };

    const isGoogleLinked = accounts.some(a => a.provider === "google");

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="animate-pulse text-muted-foreground">Loading...</div>
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
                    <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                        <Link2 className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Linked Accounts</h1>
                        <p className="text-muted-foreground">Manage connected login methods</p>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    {/* Google */}
                    <GlassCard className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center">
                                    <svg className="w-6 h-6" viewBox="0 0 24 24">
                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                    </svg>
                                </div>
                                <div>
                                    <div className="font-medium text-white">Google</div>
                                    {isGoogleLinked ? (
                                        <div className="text-sm text-muted-foreground">
                                            Linked on {formatDate(accounts.find(a => a.provider === "google")?.created_at || "")}
                                        </div>
                                    ) : (
                                        <div className="text-sm text-muted-foreground">Not connected</div>
                                    )}
                                </div>
                            </div>

                            {isGoogleLinked ? (
                                <button
                                    onClick={() => handleUnlink("google")}
                                    disabled={unlinking === "google"}
                                    className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    <Unlink className="w-4 h-4" />
                                    {unlinking === "google" ? "Unlinking..." : "Unlink"}
                                </button>
                            ) : (
                                <form action={signInWithGoogle}>
                                    <NeonButton type="submit" variant="secondary">
                                        Connect
                                    </NeonButton>
                                </form>
                            )}
                        </div>
                    </GlassCard>

                    {/* Info */}
                    <p className="text-xs text-muted-foreground text-center mt-6">
                        Linking accounts allows you to sign in with multiple methods.
                        You cannot unlink your only login method.
                    </p>
                </div>
            </div>
        </div>
    );
}
