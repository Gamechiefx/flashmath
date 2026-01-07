'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Shield, ArrowLeft, RefreshCw, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface VerifyEmailClientProps {
    email: string;
    userName: string;
}

export function VerifyEmailClient({ email, userName }: VerifyEmailClientProps) {
    const [isResending, setIsResending] = useState(false);
    const [resent, setResent] = useState(false);

    const handleResendEmail = async () => {
        setIsResending(true);
        try {
            const { resendVerificationEmail } = await import('@/lib/actions/auth');
            const result = await resendVerificationEmail();
            
            if (result.success) {
                setResent(true);
                toast.success('Verification email sent!', {
                    description: 'Check your inbox and spam folder.',
                });
            } else {
                toast.error(result.error || 'Failed to send email');
            }
        } catch (error) {
            toast.error('Failed to send verification email');
        } finally {
            setIsResending(false);
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center p-6 bg-background">
            {/* Background Effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div 
                    className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
                    style={{ backgroundColor: 'var(--primary)' }}
                />
                <div 
                    className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
                    style={{ backgroundColor: 'var(--accent)' }}
                />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative z-10 max-w-lg w-full"
            >
                {/* Back Button */}
                <Link 
                    href="/dashboard"
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
                >
                    <ArrowLeft size={16} />
                    Back to Dashboard
                </Link>

                {/* Main Card */}
                <div className="glass rounded-2xl p-8 text-center">
                    {/* Icon */}
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: 'spring' }}
                        className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
                        style={{ 
                            backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)',
                        }}
                    >
                        <Shield size={40} style={{ color: 'var(--accent)' }} />
                    </motion.div>

                    {/* Title */}
                    <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--foreground)' }}>
                        Email Verification Required
                    </h1>
                    
                    <p className="text-muted-foreground mb-6">
                        Hey {userName}! To compete in the Arena, you need to verify your email address first.
                    </p>

                    {/* Email Display */}
                    <div 
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8"
                        style={{ 
                            backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)'
                        }}
                    >
                        <Mail size={16} style={{ color: 'var(--primary)' }} />
                        <span className="text-sm font-medium">{email}</span>
                    </div>

                    {/* Instructions */}
                    <div className="space-y-4 text-left mb-8">
                        <div className="flex gap-3">
                            <div 
                                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                                style={{ 
                                    backgroundColor: 'var(--primary)',
                                    color: 'var(--primary-foreground)'
                                }}
                            >
                                1
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Check your inbox for a verification email from FlashMath
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <div 
                                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                                style={{ 
                                    backgroundColor: 'var(--primary)',
                                    color: 'var(--primary-foreground)'
                                }}
                            >
                                2
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Click the verification link in the email
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <div 
                                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                                style={{ 
                                    backgroundColor: 'var(--primary)',
                                    color: 'var(--primary-foreground)'
                                }}
                            >
                                3
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Return here and refresh to access the Arena
                            </p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="space-y-3">
                        {resent ? (
                            <div 
                                className="flex items-center justify-center gap-2 py-3 rounded-xl"
                                style={{ 
                                    backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                                    color: 'var(--primary)'
                                }}
                            >
                                <CheckCircle size={20} />
                                <span className="font-medium">Email sent! Check your inbox</span>
                            </div>
                        ) : (
                            <button
                                onClick={handleResendEmail}
                                disabled={isResending}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all disabled:opacity-50"
                                style={{ 
                                    backgroundColor: 'var(--accent)',
                                    color: 'var(--primary-foreground)'
                                }}
                            >
                                {isResending ? (
                                    <>
                                        <RefreshCw size={18} className="animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <Mail size={18} />
                                        Resend Verification Email
                                    </>
                                )}
                            </button>
                        )}

                        <button
                            onClick={() => window.location.reload()}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold border transition-all hover:bg-white/5"
                            style={{ borderColor: 'var(--glass-border)' }}
                        >
                            <RefreshCw size={18} />
                            I've Verified - Refresh
                        </button>
                    </div>

                    {/* Help Text */}
                    <p className="text-xs text-muted-foreground mt-6">
                        Can't find the email? Check your spam folder or{' '}
                        <Link href="/settings" className="underline hover:text-foreground">
                            update your email address
                        </Link>
                    </p>
                </div>

                {/* Why Verification */}
                <div className="mt-6 text-center">
                    <p className="text-xs text-muted-foreground">
                        <strong>Why verify?</strong> Email verification helps us maintain fair competition 
                        and prevents abuse in ranked matches.
                    </p>
                </div>
            </motion.div>
        </main>
    );
}

