"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { requestPasswordReset } from "@/lib/actions/auth";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;

        setIsLoading(true);
        setError(null);

        const result = await requestPasswordReset(email);

        if (result.success) {
            setSuccess(true);
        } else {
            setError(result.error || "Failed to send reset email");
        }

        setIsLoading(false);
    };

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
                        <h1 className="text-2xl font-bold text-white mb-2">Check Your Email</h1>
                        <p className="text-muted-foreground mb-6">
                            If an account exists with <span className="text-white">{email}</span>,
                            you&apos;ll receive a password reset link shortly.
                        </p>
                        <Link href="/auth/login">
                            <NeonButton variant="secondary">Back to Login</NeonButton>
                        </Link>
                    </div>
                ) : (
                    <>
                        <Link
                            href="/auth/login"
                            className="flex items-center gap-2 text-muted-foreground hover:text-white transition-colors mb-6"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Login
                        </Link>

                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Mail className="w-8 h-8 text-primary" />
                            </div>
                            <h1 className="text-2xl font-bold text-white mb-2">Forgot Password?</h1>
                            <p className="text-muted-foreground">
                                Enter your email and we&apos;ll send you a link to reset your password.
                            </p>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="mb-4">
                                <label className="block text-sm text-muted-foreground mb-2">Email</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    required
                                />
                            </div>

                            {error && (
                                <p className="text-red-400 text-sm mb-4">{error}</p>
                            )}

                            <NeonButton
                                type="submit"
                                disabled={isLoading || !email}
                                className="w-full"
                            >
                                {isLoading ? "Sending..." : "Send Reset Link"}
                            </NeonButton>
                        </form>
                    </>
                )}
            </GlassCard>
        </div>
    );
}
