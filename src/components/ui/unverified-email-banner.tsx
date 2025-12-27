"use client";

/**
 * Unverified Email Banner Component
 * Shows on dashboard/pages when email is not verified
 */

import { useState } from "react";
import { Mail, X, RefreshCw } from "lucide-react";
import { resendVerificationCode } from "@/lib/actions/auth";

interface UnverifiedEmailBannerProps {
    email: string;
}

export function UnverifiedEmailBanner({ email }: UnverifiedEmailBannerProps) {
    const [dismissed, setDismissed] = useState(false);
    const [resending, setResending] = useState(false);
    const [resent, setResent] = useState(false);

    const handleResend = async () => {
        setResending(true);
        const result = await resendVerificationCode(email);
        if (result.success) {
            setResent(true);
        }
        setResending(false);
    };

    if (dismissed) return null;

    return (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Mail className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div>
                        <h3 className="font-bold text-yellow-400 mb-1">Verify Your Email</h3>
                        <p className="text-sm text-muted-foreground">
                            We sent a verification code to <span className="text-white">{email}</span>.
                            {" "}Please check your inbox and spam folder.
                        </p>
                        {resent ? (
                            <p className="text-sm text-green-400 mt-2">✓ Verification code resent!</p>
                        ) : (
                            <button
                                onClick={handleResend}
                                disabled={resending}
                                className="text-sm text-yellow-400 hover:text-yellow-300 mt-2 flex items-center gap-1 disabled:opacity-50"
                            >
                                <RefreshCw className={`w-3 h-3 ${resending ? "animate-spin" : ""}`} />
                                {resending ? "Sending..." : "Resend verification code"}
                            </button>
                        )}
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
