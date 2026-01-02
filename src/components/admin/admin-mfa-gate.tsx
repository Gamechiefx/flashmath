"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { sendAdminMfaCode, verifyAdminMfaCode } from "@/lib/actions/admin-mfa";
import { Shield, AlertCircle, Mail, Loader2 } from "lucide-react";

interface AdminMfaGateProps {
    userEmail: string;
    children: React.ReactNode;
}

export function AdminMfaGate({ userEmail, children }: AdminMfaGateProps) {
    const router = useRouter();
    const [isVerified, setIsVerified] = useState(false);
    const [code, setCode] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [codeSent, setCodeSent] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    // Mask email for display
    const maskedEmail = userEmail
        ? userEmail.replace(/(.{2})(.*)(@.*)/, "$1***$3")
        : "your email";

    // Handle resend cooldown
    useEffect(() => {
        if (resendCooldown > 0) {
            const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [resendCooldown]);

    const handleSendCode = async () => {
        setIsSending(true);
        setError(null);

        const result = await sendAdminMfaCode();

        if (result.success) {
            setCodeSent(true);
            setResendCooldown(60);
        } else {
            setError(result.error || "Failed to send code");
        }

        setIsSending(false);
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (code.length !== 6) return;

        setIsLoading(true);
        setError(null);

        const result = await verifyAdminMfaCode(code);

        if (result.success) {
            setIsVerified(true);
            router.refresh();
        } else {
            setError(result.error || "Invalid code");
            setCode("");
        }

        setIsLoading(false);
    };

    // If verified, render children
    if (isVerified) {
        return <>{children}</>;
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[20%] left-[10%] w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[20%] right-[10%] w-[400px] h-[400px] bg-violet-500/10 rounded-full blur-[100px]" />
            </div>

            <GlassCard className="p-8 max-w-md w-full relative z-10 border-purple-500/20">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-purple-500/30">
                        <Shield className="w-8 h-8 text-purple-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Admin Verification</h1>
                    <p className="text-muted-foreground text-sm">
                        {codeSent
                            ? `Enter the 6-digit code sent to ${maskedEmail}`
                            : "Verify your identity to access the admin console"
                        }
                    </p>
                </div>

                {!codeSent ? (
                    <div className="space-y-4">
                        <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                            <div className="flex items-start gap-3">
                                <Mail className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-sm text-white font-medium">Email Verification Required</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        A 6-digit code will be sent to your registered email address.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 text-red-400 text-sm justify-center">
                                <AlertCircle className="w-4 h-4" />
                                {error}
                            </div>
                        )}

                        <NeonButton
                            onClick={handleSendCode}
                            disabled={isSending}
                            className="w-full"
                            variant="accent"
                        >
                            {isSending ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Sending...
                                </>
                            ) : (
                                "Send Verification Code"
                            )}
                        </NeonButton>

                        <button
                            onClick={() => router.push("/dashboard")}
                            className="w-full text-sm text-muted-foreground hover:text-white transition-colors text-center py-2"
                        >
                            Cancel
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleVerify}>
                        <div className="mb-6">
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => {
                                    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                                    setCode(value);
                                }}
                                placeholder="000000"
                                className="w-full px-4 py-4 bg-white/5 border border-purple-500/20 rounded-lg text-white text-center text-2xl font-mono tracking-widest focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
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
                            disabled={isLoading || code.length !== 6}
                            className="w-full mb-4"
                            variant="accent"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Verifying...
                                </>
                            ) : (
                                "Verify & Continue"
                            )}
                        </NeonButton>

                        <button
                            type="button"
                            onClick={handleSendCode}
                            disabled={resendCooldown > 0 || isSending}
                            className="w-full text-sm text-muted-foreground hover:text-white transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {resendCooldown > 0
                                ? `Resend code in ${resendCooldown}s`
                                : "Resend code"
                            }
                        </button>
                    </form>
                )}
            </GlassCard>
        </div>
    );
}
