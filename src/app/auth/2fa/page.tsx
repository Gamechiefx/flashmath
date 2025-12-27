"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { verify2FACode } from "@/lib/actions/2fa";
import { Shield, AlertCircle } from "lucide-react";

export default function TwoFactorAuthPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const userId = searchParams.get("userId") || "";
    const returnTo = searchParams.get("returnTo") || "/dashboard";

    const [code, setCode] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [useRecovery, setUseRecovery] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code || !userId) return;

        setIsLoading(true);
        setError(null);

        const result = await verify2FACode(userId, code);

        if (result.success) {
            // 2FA verified - complete login
            router.push(returnTo);
        } else {
            setError(result.error || "Invalid code");
            setCode("");
        }

        setIsLoading(false);
    };

    if (!userId) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <GlassCard className="p-8 max-w-md text-center">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-white mb-2">Invalid Request</h1>
                    <p className="text-muted-foreground mb-4">Missing authentication data.</p>
                    <NeonButton onClick={() => router.push("/auth/login")}>Back to Login</NeonButton>
                </GlassCard>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[20%] left-[10%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[20%] right-[10%] w-[400px] h-[400px] bg-accent/10 rounded-full blur-[100px]" />
            </div>

            <GlassCard className="p-8 max-w-md w-full relative z-10">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Shield className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Two-Factor Authentication</h1>
                    <p className="text-muted-foreground">
                        {useRecovery
                            ? "Enter one of your recovery codes"
                            : "Enter the 6-digit code from your authenticator app"
                        }
                    </p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="mb-6">
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => {
                                const value = useRecovery
                                    ? e.target.value.toUpperCase().slice(0, 11)
                                    : e.target.value.replace(/\D/g, "").slice(0, 6);
                                setCode(value);
                            }}
                            placeholder={useRecovery ? "XXXXX-XXXXX" : "000000"}
                            className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-lg text-white text-center text-2xl font-mono tracking-widest focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            autoFocus
                        />
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-red-400 text-sm mb-4 justify-center">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    <NeonButton
                        type="submit"
                        disabled={isLoading || (useRecovery ? code.length !== 11 : code.length !== 6)}
                        className="w-full mb-4"
                    >
                        {isLoading ? "Verifying..." : "Verify"}
                    </NeonButton>

                    <button
                        type="button"
                        onClick={() => {
                            setUseRecovery(!useRecovery);
                            setCode("");
                            setError(null);
                        }}
                        className="w-full text-sm text-muted-foreground hover:text-white transition-colors text-center"
                    >
                        {useRecovery ? "Use authenticator app instead" : "Use a recovery code"}
                    </button>
                </form>
            </GlassCard>
        </div>
    );
}
