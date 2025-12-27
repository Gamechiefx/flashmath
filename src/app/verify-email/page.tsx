"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { verifyEmailCode, resendVerificationCode } from "@/lib/actions/auth";
import { Mail, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";

export default function VerifyEmailPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const email = searchParams.get("email") || "";

    const [code, setCode] = useState(["", "", "", "", "", ""]);
    const [isLoading, setIsLoading] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    // Handle input changes
    const handleChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return; // Only allow digits

        const newCode = [...code];
        newCode[index] = value.slice(-1); // Only keep last digit
        setCode(newCode);

        // Auto-focus next input
        if (value && index < 5) {
            const nextInput = document.getElementById(`code-${index + 1}`);
            nextInput?.focus();
        }
    };

    // Handle paste
    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
        const newCode = [...code];
        for (let i = 0; i < pastedData.length; i++) {
            newCode[i] = pastedData[i];
        }
        setCode(newCode);
    };

    // Handle backspace
    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === "Backspace" && !code[index] && index > 0) {
            const prevInput = document.getElementById(`code-${index - 1}`);
            prevInput?.focus();
        }
    };

    // Auto-submit when code is complete
    useEffect(() => {
        if (code.every(d => d) && !isLoading) {
            handleVerify();
        }
    }, [code]);

    // Resend cooldown timer
    useEffect(() => {
        if (resendCooldown > 0) {
            const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [resendCooldown]);

    const handleVerify = async () => {
        const fullCode = code.join("");
        if (fullCode.length !== 6) return;

        setIsLoading(true);
        setError(null);

        const result = await verifyEmailCode(email, fullCode);

        if (result.success) {
            setSuccess(true);
            setTimeout(() => router.push("/dashboard"), 2000);
        } else {
            setError(result.error || "Invalid code");
            setCode(["", "", "", "", "", ""]);
            document.getElementById("code-0")?.focus();
        }

        setIsLoading(false);
    };

    const handleResend = async () => {
        if (resendCooldown > 0) return;

        setIsResending(true);
        setError(null);

        const result = await resendVerificationCode(email);

        if (result.success) {
            setResendCooldown(60); // 60 second cooldown
        } else {
            setError(result.error || "Failed to resend code");
        }

        setIsResending(false);
    };

    if (!email) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <GlassCard className="p-8 max-w-md text-center">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-white mb-2">Invalid Link</h1>
                    <p className="text-muted-foreground mb-4">No email address provided.</p>
                    <NeonButton onClick={() => router.push("/login")}>Back to Login</NeonButton>
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
                {success ? (
                    <div className="text-center">
                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-white mb-2">Email Verified!</h1>
                        <p className="text-muted-foreground">Redirecting to dashboard...</p>
                    </div>
                ) : (
                    <>
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Mail className="w-8 h-8 text-primary" />
                            </div>
                            <h1 className="text-2xl font-bold text-white mb-2">Verify Your Email</h1>
                            <p className="text-muted-foreground">
                                We sent a 6-digit code to<br />
                                <span className="text-white font-medium">{email}</span>
                            </p>
                        </div>

                        <div className="flex justify-center gap-2 mb-6" onPaste={handlePaste}>
                            {code.map((digit, index) => (
                                <input
                                    key={index}
                                    id={`code-${index}`}
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={1}
                                    value={digit}
                                    onChange={(e) => handleChange(index, e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(index, e)}
                                    className="w-12 h-14 text-center text-2xl font-bold bg-white/5 border border-white/10 rounded-lg text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    disabled={isLoading}
                                />
                            ))}
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 text-red-400 text-sm mb-4 justify-center">
                                <AlertCircle className="w-4 h-4" />
                                {error}
                            </div>
                        )}

                        <NeonButton
                            onClick={handleVerify}
                            disabled={isLoading || code.some(d => !d)}
                            className="w-full mb-4"
                        >
                            {isLoading ? "Verifying..." : "Verify Email"}
                        </NeonButton>

                        <div className="text-center">
                            <button
                                onClick={handleResend}
                                disabled={isResending || resendCooldown > 0}
                                className="text-sm text-muted-foreground hover:text-white transition-colors flex items-center gap-2 mx-auto disabled:opacity-50"
                            >
                                <RefreshCw className={`w-4 h-4 ${isResending ? "animate-spin" : ""}`} />
                                {resendCooldown > 0
                                    ? `Resend in ${resendCooldown}s`
                                    : "Resend Code"
                                }
                            </button>
                        </div>
                    </>
                )}
            </GlassCard>
        </div>
    );
}
