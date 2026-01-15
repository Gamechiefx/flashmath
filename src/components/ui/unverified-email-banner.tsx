"use client";

/**
 * Unverified Email Banner Component
 * Shows on dashboard/pages when email is not verified
 * Includes inline code input for verification
 */

import { useState, useEffect } from "react";
import { Mail, X, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { resendVerificationCode, verifyEmailCode } from "@/lib/actions/auth";
import { useRouter } from "next/navigation";

interface UnverifiedEmailBannerProps {
    email: string;
}

export function UnverifiedEmailBanner({ email }: UnverifiedEmailBannerProps) {
    const router = useRouter();
    const [dismissed, setDismissed] = useState(false);
    const [resending, setResending] = useState(false);
    const [resent, setResent] = useState(false);
    const [showCodeInput, setShowCodeInput] = useState(false);
    const [code, setCode] = useState(["", "", "", "", "", ""]);
    const [isVerifying, setIsVerifying] = useState(false);
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
            const nextInput = document.getElementById(`banner-code-${index + 1}`);
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
            const prevInput = document.getElementById(`banner-code-${index - 1}`);
            prevInput?.focus();
        }
    };

    // Auto-submit when code is complete
    useEffect(() => {
        if (code.every(d => d) && !isVerifying && showCodeInput) {
            handleVerify();
        }
    }, [code, showCodeInput]);

    // Resend cooldown timer
    useEffect(() => {
        if (resendCooldown > 0) {
            const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [resendCooldown]);

    const handleResend = async () => {
        if (resendCooldown > 0) return;
        
        setResending(true);
        setError(null);
        const result = await resendVerificationCode(email);
        if (result.success) {
            setResent(true);
            setShowCodeInput(true);
            setResendCooldown(60);
            // Focus first input after showing
            setTimeout(() => {
                document.getElementById("banner-code-0")?.focus();
            }, 100);
        } else {
            setError(result.error || "Failed to send code");
        }
        setResending(false);
    };

    const handleVerify = async () => {
        const fullCode = code.join("");
        if (fullCode.length !== 6) return;

        setIsVerifying(true);
        setError(null);

        try {
            const result = await verifyEmailCode(email, fullCode);

            if (result.success) {
                setSuccess(true);
                // Refresh the page to update verification status
                setTimeout(() => {
                    router.refresh();
                }, 1500);
            } else {
                setError(result.error || "Invalid code");
                setCode(["", "", "", "", "", ""]);
                document.getElementById("banner-code-0")?.focus();
            }
        } catch (err) {
            setError("Failed to verify code");
            setCode(["", "", "", "", "", ""]);
        }

        setIsVerifying(false);
    };

    if (dismissed) return null;

    // Success state
    if (success) {
        return (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-green-400" />
                    <div>
                        <h3 className="font-bold text-green-400">Email Verified!</h3>
                        <p className="text-sm text-muted-foreground">Refreshing page...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                    <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Mail className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-yellow-400 mb-1">Verify Your Email</h3>
                        <p className="text-sm text-muted-foreground">
                            We sent a verification code to <span className="text-white">{email}</span>.
                            {" "}Please check your inbox and spam folder.
                        </p>
                        
                        {/* Code Input Section */}
                        {showCodeInput && (
                            <div className="mt-4">
                                <p className="text-xs text-muted-foreground mb-2">Enter your 6-digit code:</p>
                                <div className="flex gap-2 mb-3" onPaste={handlePaste}>
                                    {code.map((digit, index) => (
                                        <input
                                            key={index}
                                            id={`banner-code-${index}`}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handleChange(index, e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(index, e)}
                                            className="w-10 h-12 text-center text-xl font-bold bg-black/20 border border-white/20 rounded-lg text-white focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 transition-all"
                                            disabled={isVerifying}
                                        />
                                    ))}
                                </div>
                                
                                {/* Error Message */}
                                {error && (
                                    <div className="flex items-center gap-2 text-red-400 text-sm mb-2">
                                        <AlertCircle className="w-4 h-4" />
                                        {error}
                                    </div>
                                )}
                                
                                {/* Verify Button */}
                                <button
                                    onClick={handleVerify}
                                    disabled={isVerifying || code.some(d => !d)}
                                    className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isVerifying ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            Verifying...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle className="w-4 h-4" />
                                            Verify
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                        
                        {/* Action Buttons */}
                        <div className="flex items-center gap-4 mt-3">
                            {!showCodeInput && (
                                <button
                                    onClick={() => {
                                        setShowCodeInput(true);
                                        setTimeout(() => {
                                            document.getElementById("banner-code-0")?.focus();
                                        }, 100);
                                    }}
                                    className="text-sm text-yellow-400 hover:text-yellow-300 font-medium"
                                >
                                    I have a code
                                </button>
                            )}
                            
                            <button
                                onClick={handleResend}
                                disabled={resending || resendCooldown > 0}
                                className="text-sm text-yellow-400 hover:text-yellow-300 flex items-center gap-1 disabled:opacity-50"
                            >
                                <RefreshCw className={`w-3 h-3 ${resending ? "animate-spin" : ""}`} />
                                {resendCooldown > 0 
                                    ? `Resend in ${resendCooldown}s` 
                                    : resending 
                                    ? "Sending..." 
                                    : resent 
                                    ? "Resend code" 
                                    : "Send verification code"
                                }
                            </button>
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => setDismissed(true)}
                    className="text-muted-foreground hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
