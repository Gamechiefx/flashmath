"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { LogOut, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

export default function SignOutPage() {
    const router = useRouter();
    const [isSigningOut, setIsSigningOut] = useState(false);

    const handleSignOut = () => {
        setIsSigningOut(true);
        // Use callbackUrl to let NextAuth handle the full sign-out flow
        // This properly clears cookies and session before redirecting
        signOut({ callbackUrl: "/" });
    };

    return (
        <main className="min-h-screen flex items-center justify-center bg-background text-foreground relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div 
                    className="absolute -top-64 -right-64 w-[700px] h-[700px] rounded-full blur-[150px]"
                    style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)' }}
                />
                <div 
                    className="absolute -bottom-64 -left-64 w-[700px] h-[700px] rounded-full blur-[150px]"
                    style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
                />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative z-10 w-full max-w-md mx-4"
            >
                {/* Back Link */}
                <Link 
                    href="/dashboard"
                    className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
                >
                    <ArrowLeft size={16} />
                    <span>Back to Dashboard</span>
                </Link>

                {/* Sign Out Card */}
                <div 
                    className="glass rounded-2xl p-8 border-2"
                    style={{
                        borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)',
                        boxShadow: '0 0 60px color-mix(in srgb, var(--destructive) 10%, transparent)',
                    }}
                >
                    {/* Icon */}
                    <div 
                        className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-6"
                        style={{
                            background: 'color-mix(in srgb, var(--destructive) 15%, transparent)',
                        }}
                    >
                        <LogOut 
                            size={32} 
                            style={{ color: 'var(--destructive)' }}
                        />
                    </div>

                    {/* Title */}
                    <h1 
                        className="text-2xl font-black text-center mb-2"
                        style={{ color: 'var(--foreground)' }}
                    >
                        Sign Out
                    </h1>

                    {/* Description */}
                    <p className="text-muted-foreground text-center mb-8">
                        Are you sure you want to sign out of FlashMath?
                    </p>

                    {/* Buttons */}
                    <div className="space-y-3">
                        <motion.button
                            onClick={handleSignOut}
                            disabled={isSigningOut}
                            whileHover={{ scale: isSigningOut ? 1 : 1.02 }}
                            whileTap={{ scale: isSigningOut ? 1 : 0.98 }}
                            className="w-full py-3 px-6 rounded-xl font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            style={{
                                background: 'var(--destructive)',
                                boxShadow: isSigningOut ? 'none' : '0 0 30px color-mix(in srgb, var(--destructive) 30%, transparent)',
                            }}
                        >
                            {isSigningOut ? (
                                <>
                                    <Loader2 size={20} className="animate-spin" />
                                    Signing out...
                                </>
                            ) : (
                                <>
                                    <LogOut size={20} />
                                    Sign Out
                                </>
                            )}
                        </motion.button>

                        <button
                            onClick={() => router.back()}
                            disabled={isSigningOut}
                            className="w-full py-3 px-6 rounded-xl font-bold transition-all border-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                                borderColor: 'color-mix(in srgb, var(--foreground) 20%, transparent)',
                                color: 'var(--foreground)',
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>

                {/* Footer Text */}
                <p className="text-center text-sm text-muted-foreground mt-6">
                    You can always sign back in to continue your math training journey.
                </p>
            </motion.div>
        </main>
    );
}

