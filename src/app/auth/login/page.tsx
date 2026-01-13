"use client";

import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { Zap, Mail, Lock, ArrowLeft, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { loginUser, signInWithGoogle } from "@/lib/actions/auth";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

/**
 * Render the client-side login page offering email/password, Google OAuth, and magic-link sign-in, and redirect authenticated users to /dashboard.
 *
 * This component checks session status and:
 * - shows a themed "Checking authentication..." screen while the session is loading,
 * - shows a themed "Redirecting to dashboard..." screen when authenticated and triggers a client-side redirect to /dashboard,
 * - otherwise renders the full login UI with form submission handlers and OAuth alternatives.
 *
 * @returns The React element for the login page.
 */
export default function LoginPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [shake, setShake] = useState(false);

    // Redirect authenticated users to dashboard
    useEffect(() => {
        if (status === 'authenticated' && session?.user) {
            router.replace('/dashboard');
        }
    }, [status, session, router]);

    // Show loading state while checking session (theme-aware)
    if (status === 'loading') {
        return (
            <main className="min-h-screen flex items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <div 
                        className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                        style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }}
                    />
                    <span className="text-muted-foreground text-sm font-medium animate-pulse">
                        Checking authentication...
                    </span>
                </div>
            </main>
        );
    }

    // If authenticated, show redirect message (theme-aware)
    if (status === 'authenticated') {
        return (
            <main className="min-h-screen flex items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <div 
                        className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
                    />
                    <span style={{ color: 'var(--primary)' }} className="text-sm font-medium animate-pulse">
                        Redirecting to dashboard...
                    </span>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-background text-foreground">
            {/* Background Glows */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px]" />
            </div>

            <Link href="/" className="absolute top-10 left-10 flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                <ArrowLeft size={16} />
                Back to Home
            </Link>

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md relative z-10"
            >
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/20 text-primary mb-4">
                        <Zap size={24} />
                    </div>
                    <h1 className="text-3xl font-black tracking-tight mb-2">ACCESS TERMINAL</h1>
                    <p className="text-muted-foreground text-sm">Enter your credentials to continue mastery.</p>
                </div>

                <GlassCard className="space-y-6">
                    <form
                        action={async (formData) => {
                            setLoading(true);
                            setError(null);
                            const result = await loginUser(formData);
                            if (result?.error) {
                                setError(result.error);
                                setLoading(false);
                            }
                        }}
                        className="space-y-4"
                    >
                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold text-center">
                                {error.toUpperCase()}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                                <input
                                    type="email"
                                    name="email"
                                    placeholder="name@nexus.com"
                                    required
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    placeholder="••••••••"
                                    required
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-12 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            <div className="text-right">
                                <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-primary transition-colors">
                                    Forgot Password?
                                </Link>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full mt-4 relative py-4 px-8 rounded-xl font-black uppercase tracking-widest overflow-hidden bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30 hover:border-primary/50 transition-all disabled:opacity-50"
                        >
                            <motion.span
                                animate={{
                                    backgroundPosition: ["200% center", "-200% center"],
                                }}
                                transition={{
                                    duration: 3,
                                    repeat: Infinity,
                                    ease: "linear"
                                }}
                                style={{
                                    backgroundImage: "linear-gradient(90deg, var(--color-primary) 0%, var(--color-accent) 25%, #ffffff 50%, var(--color-accent) 75%, var(--color-primary) 100%)",
                                    backgroundSize: "200% auto",
                                    WebkitBackgroundClip: "text",
                                    WebkitTextFillColor: "transparent",
                                }}
                                className="inline-block"
                            >
                                {loading ? "AUTHENTICATING..." : "SIGN IN"}
                            </motion.span>
                        </button>
                    </form>

                    {/* OAuth Separator */}
                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/10" />
                        </div>
                        <div className="relative flex justify-center text-xs">
                            <span className="bg-card px-4 text-muted-foreground uppercase tracking-widest">or continue with</span>
                        </div>
                    </div>

                    {/* Google Sign In */}
                    <form action={signInWithGoogle}>
                        <button
                            type="submit"
                            className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            <span className="text-white font-medium">Sign in with Google</span>
                        </button>
                    </form>

                    {/* Magic Link */}
                    <Link
                        href="/magic-link"
                        className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all mt-3"
                    >
                        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        <span className="text-white font-medium">Sign in with Magic Link</span>
                    </Link>

                    <div className="text-center text-sm text-muted-foreground mt-6">
                        Don't have an account?{" "}
                        <Link href="/auth/register" className="text-accent hover:underline">
                            Create Account
                        </Link>
                    </div>
                </GlassCard>
            </motion.div>
        </main>
    );
}