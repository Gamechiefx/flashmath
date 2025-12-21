"use client";

import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { Zap, Mail, Lock, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { loginUser } from "@/lib/actions/auth";
import { useState } from "react";

export default function LoginPage() {
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(formData: FormData) {
        setLoading(true);
        setError(null);
        const result = await loginUser(formData);
        if (result?.error) {
            setError(result.error);
            setLoading(false);
        }
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
                    <form action={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold text-center">
                                {error.toUpperCase()}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Email Protocol</label>
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
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Secure Key</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                                <input
                                    type="password"
                                    name="password"
                                    placeholder="••••••••"
                                    required
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                                />
                            </div>
                        </div>

                        <NeonButton className="w-full mt-4" type="submit" disabled={loading}>
                            {loading ? "AUTHENTICATING..." : "INITIALIZE AUTH"}
                        </NeonButton>
                    </form>

                    <div className="text-center text-sm text-muted-foreground">
                        Don't have an uplink?{" "}
                        <Link href="/auth/register" className="text-accent hover:underline">
                            Create Account
                        </Link>
                    </div>
                </GlassCard>
            </motion.div>
        </main>
    );
}
