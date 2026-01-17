'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, Shield, ArrowLeft, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { verifyEmailCode, resendVerificationEmail } from '@/lib/actions/auth';

interface VerifyEmailClientProps {
    email: string;
    userName: string;
}

export function VerifyEmailClient({ email, userName }: VerifyEmailClientProps) {
    const router = useRouter();
    const [code, setCode] = useState(['', '', '', '', '', '']);
    const [isVerifying, setIsVerifying] = useState(false);
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
            const nextInput = document.getElementById(`arena-code-${index + 1}`);
            nextInput?.focus();
        }
    };

    // Handle paste
    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        const newCode = [...code];
        for (let i = 0; i < pastedData.length; i++) {
            newCode[i] = pastedData[i];
        }
        setCode(newCode);
    };

    // Handle backspace
    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            const prevInput = document.getElementById(`arena-code-${index - 1}`);
            prevInput?.focus();
        }
    };

    // Auto-submit when code is complete
    useEffect(() => {
        if (code.every(d => d) && !isVerifying && !success) {
            handleVerify();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleVerify is stable
    }, [code, isVerifying, success]);

    // Resend cooldown timer
    useEffect(() => {
        if (resendCooldown > 0) {
            const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [resendCooldown]);

    const handleVerify = async () => {
        const fullCode = code.join('');
        if (fullCode.length !== 6) return;

        setIsVerifying(true);
        setError(null);

        try {
            const result = await verifyEmailCode(email, fullCode);

            if (result.success) {
                setSuccess(true);
                toast.success('Email verified!', {
                    description: 'Redirecting to Arena...',
                });
                setTimeout(() => router.push('/arena/modes'), 2000);
            } else {
                setError(result.error || 'Invalid code');
                setCode(['', '', '', '', '', '']);
                document.getElementById('arena-code-0')?.focus();
            }
        } catch {
            setError('Failed to verify code');
            setCode(['', '', '', '', '', '']);
        }

        setIsVerifying(false);
    };

    const handleResendEmail = async () => {
        if (resendCooldown > 0) return;
        
        setIsResending(true);
        setError(null);
        
        try {
            const result = await resendVerificationEmail();
            
            if (result.success) {
                setResendCooldown(60);
                toast.success('Verification email sent!', {
                    description: 'Check your inbox and spam folder.',
                });
            } else {
                toast.error(result.error || 'Failed to send email');
            }
        } catch {
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
                    {success ? (
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                        >
                            <CheckCircle size={64} className="mx-auto mb-4 text-green-500" />
                            <h1 className="text-2xl font-bold text-white mb-2">Email Verified!</h1>
                            <p className="text-muted-foreground">Redirecting to Arena...</p>
                        </motion.div>
                    ) : (
                        <>
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
                                Verify Your Email
                            </h1>
                            
                            <p className="text-muted-foreground mb-2">
                                Hey {userName}! Enter the 6-digit code sent to
                            </p>
                            
                            {/* Email Display */}
                            <div 
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
                                style={{ 
                                    backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                                    border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)'
                                }}
                            >
                                <Mail size={16} style={{ color: 'var(--primary)' }} />
                                <span className="text-sm font-medium">{email}</span>
                            </div>

                            {/* Code Input */}
                            <div className="flex justify-center gap-2 mb-6" onPaste={handlePaste}>
                                {code.map((digit, index) => (
                                    <input
                                        key={index}
                                        id={`arena-code-${index}`}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={1}
                                        value={digit}
                                        onChange={(e) => handleChange(index, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(index, e)}
                                        className="w-12 h-14 text-center text-2xl font-bold bg-white/5 border border-white/10 rounded-lg text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                        disabled={isVerifying}
                                        autoFocus={index === 0}
                                    />
                                ))}
                            </div>

                            {/* Error Message */}
                            {error && (
                                <div className="flex items-center gap-2 text-red-400 text-sm mb-4 justify-center">
                                    <AlertCircle className="w-4 h-4" />
                                    {error}
                                </div>
                            )}

                            {/* Verify Button */}
                            <button
                                onClick={handleVerify}
                                disabled={isVerifying || code.some(d => !d)}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all disabled:opacity-50 mb-4"
                                style={{ 
                                    backgroundColor: 'var(--primary)',
                                    color: 'var(--primary-foreground)'
                                }}
                            >
                                {isVerifying ? (
                                    <>
                                        <RefreshCw size={18} className="animate-spin" />
                                        Verifying...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle size={18} />
                                        Verify Email
                                    </>
                                )}
                            </button>

                            {/* Resend Button */}
                            <button
                                onClick={handleResendEmail}
                                disabled={isResending || resendCooldown > 0}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold border transition-all hover:bg-white/5 disabled:opacity-50"
                                style={{ borderColor: 'var(--glass-border)' }}
                            >
                                <RefreshCw size={18} className={isResending ? 'animate-spin' : ''} />
                                {resendCooldown > 0
                                    ? `Resend in ${resendCooldown}s`
                                    : isResending
                                    ? 'Sending...'
                                    : 'Resend Code'
                                }
                            </button>

                            {/* Help Text */}
                            <p className="text-xs text-muted-foreground mt-6">
                                Can&apos;t find the email? Check your spam folder or{' '}
                                <Link href="/settings" className="underline hover:text-foreground">
                                    update your email address
                                </Link>
                            </p>
                        </>
                    )}
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
