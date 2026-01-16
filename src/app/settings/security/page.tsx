"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { setup2FA, enable2FA, disable2FA, get2FAStatus, regenerateRecoveryCodes } from "@/lib/actions/2fa";
import { Shield, ArrowLeft, CheckCircle, AlertCircle, Copy, Download } from "lucide-react";

export default function SecuritySettingsPage() {
    const [status, setStatus] = useState<{ enabled: boolean; hasRecoveryCodes: boolean }>({ enabled: false, hasRecoveryCodes: false });
    const [loading, setLoading] = useState(true);
    const [setupData, setSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
    const [code, setCode] = useState("");
    const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<"idle" | "setup" | "verify" | "recovery" | "disable">("idle");

    // Define loadStatus before useEffect to avoid "accessed before declaration" error
    const loadStatus = async () => {
        setLoading(true);
        const result = await get2FAStatus();
        setStatus(result);
        setLoading(false);
    };

    useEffect(() => {
        // Defer to avoid setState in effect warning
        setTimeout(() => {
            loadStatus();
        }, 0);
    }, []);

    const handleStartSetup = async () => {
        setError(null);
        const result = await setup2FA();
        if (result.success && result.secret && result.qrCode) {
            setSetupData({ secret: result.secret, qrCode: result.qrCode });
            setStep("setup");
        } else {
            setError(result.error || "Failed to start setup");
        }
    };

    const handleVerifyAndEnable = async () => {
        if (code.length !== 6) return;
        setError(null);

        const result = await enable2FA(code);
        if (result.success && result.recoveryCodes) {
            setRecoveryCodes(result.recoveryCodes);
            setStep("recovery");
            setCode("");
        } else {
            setError(result.error || "Verification failed");
        }
    };

    const handleDisable = async () => {
        if (code.length !== 6) return;
        setError(null);

        const result = await disable2FA(code);
        if (result.success) {
            setStatus({ enabled: false, hasRecoveryCodes: false });
            setStep("idle");
            setCode("");
        } else {
            setError(result.error || "Failed to disable 2FA");
        }
    };

    const handleRegenerateRecoveryCodes = async () => {
        if (code.length !== 6) return;
        setError(null);

        const result = await regenerateRecoveryCodes(code);
        if (result.success && result.recoveryCodes) {
            setRecoveryCodes(result.recoveryCodes);
            setStep("recovery");
            setCode("");
        } else {
            setError(result.error || "Failed to regenerate codes");
        }
    };

    const copyRecoveryCodes = () => {
        if (recoveryCodes) {
            navigator.clipboard.writeText(recoveryCodes.join("\n"));
        }
    };

    const downloadRecoveryCodes = () => {
        if (recoveryCodes) {
            const content = `FlashMath Recovery Codes\n${"=".repeat(30)}\n\nKeep these codes safe. Each can only be used once.\n\n${recoveryCodes.join("\n")}\n\nGenerated: ${new Date().toLocaleString()}`;
            const blob = new Blob([content], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "flashmath-recovery-codes.txt";
            a.click();
        }
    };

    const finishSetup = () => {
        setRecoveryCodes(null);
        setSetupData(null);
        setStep("idle");
        loadStatus();
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="animate-pulse text-muted-foreground">Loading...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background p-4 md:p-8">
            <div className="max-w-2xl mx-auto">
                <Link
                    href="/settings"
                    className="flex items-center gap-2 text-muted-foreground hover:text-white transition-colors mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Settings
                </Link>

                <div className="flex items-center gap-3 mb-8">
                    <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
                        <Shield className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Two-Factor Authentication</h1>
                        <p className="text-muted-foreground">Add an extra layer of security to your account</p>
                    </div>
                </div>

                {/* Recovery Codes Display */}
                {step === "recovery" && recoveryCodes && (
                    <GlassCard className="p-6 mb-6">
                        <div className="flex items-center gap-2 text-green-400 mb-4">
                            <CheckCircle className="w-5 h-5" />
                            <span className="font-bold">Save Your Recovery Codes</span>
                        </div>
                        <p className="text-muted-foreground text-sm mb-4">
                            Store these codes in a safe place. Each code can only be used once to access your account if you lose your authenticator.
                        </p>
                        <div className="bg-black/30 rounded-lg p-4 font-mono text-sm grid grid-cols-2 gap-2 mb-4">
                            {recoveryCodes.map((code, i) => (
                                <div key={i} className="text-primary">{code}</div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <NeonButton variant="secondary" onClick={copyRecoveryCodes} className="flex-1">
                                <Copy className="w-4 h-4 mr-2" /> Copy
                            </NeonButton>
                            <NeonButton variant="secondary" onClick={downloadRecoveryCodes} className="flex-1">
                                <Download className="w-4 h-4 mr-2" /> Download
                            </NeonButton>
                        </div>
                        <NeonButton onClick={finishSetup} className="w-full mt-4">
                            I&apos;ve Saved My Codes
                        </NeonButton>
                    </GlassCard>
                )}

                {/* Setup Flow */}
                {step === "setup" && setupData && (
                    <GlassCard className="p-6 mb-6">
                        <h2 className="text-lg font-bold text-white mb-4">Scan QR Code</h2>
                        <p className="text-muted-foreground text-sm mb-4">
                            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                        </p>
                        <div className="flex justify-center mb-4">
                            {/* eslint-disable-next-line @next/next/no-img-element -- QR code image */}
                            <img src={setupData.qrCode} alt="2FA QR Code" className="rounded-lg" />
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">Or enter this code manually:</p>
                        <div className="bg-black/30 rounded-lg p-3 font-mono text-xs text-primary break-all mb-4">
                            {setupData.secret}
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm text-muted-foreground mb-2">Enter verification code</label>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                placeholder="000000"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white text-center text-2xl font-mono tracking-widest focus:border-primary focus:outline-none"
                                maxLength={6}
                            />
                        </div>

                        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

                        <div className="flex gap-2">
                            <NeonButton variant="secondary" onClick={() => setStep("idle")} className="flex-1">
                                Cancel
                            </NeonButton>
                            <NeonButton onClick={handleVerifyAndEnable} disabled={code.length !== 6} className="flex-1">
                                Enable 2FA
                            </NeonButton>
                        </div>
                    </GlassCard>
                )}

                {/* Disable 2FA */}
                {step === "disable" && (
                    <GlassCard className="p-6 mb-6">
                        <div className="flex items-center gap-2 text-yellow-400 mb-4">
                            <AlertCircle className="w-5 h-5" />
                            <span className="font-bold">Disable Two-Factor Authentication</span>
                        </div>
                        <p className="text-muted-foreground text-sm mb-4">
                            Enter your current 2FA code to disable two-factor authentication.
                        </p>

                        <div className="mb-4">
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                placeholder="000000"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white text-center text-2xl font-mono tracking-widest focus:border-primary focus:outline-none"
                                maxLength={6}
                            />
                        </div>

                        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

                        <div className="flex gap-2">
                            <NeonButton variant="secondary" onClick={() => { setStep("idle"); setCode(""); }} className="flex-1">
                                Cancel
                            </NeonButton>
                            <NeonButton variant="accent" onClick={handleDisable} disabled={code.length !== 6} className="flex-1">
                                Disable 2FA
                            </NeonButton>
                        </div>
                    </GlassCard>
                )}

                {/* Status Card */}
                {step === "idle" && (
                    <GlassCard className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-lg font-bold text-white">Authenticator App</h2>
                                <p className="text-sm text-muted-foreground">
                                    Use an authentication app to get verification codes
                                </p>
                            </div>
                            <div className={`px-3 py-1 rounded-full text-xs font-bold ${status.enabled
                                    ? "bg-green-500/20 text-green-400"
                                    : "bg-yellow-500/20 text-yellow-400"
                                }`}>
                                {status.enabled ? "Enabled" : "Not Enabled"}
                            </div>
                        </div>

                        {status.enabled ? (
                            <div className="space-y-3">
                                <NeonButton
                                    variant="secondary"
                                    onClick={() => setStep("disable")}
                                    className="w-full"
                                >
                                    Disable 2FA
                                </NeonButton>
                                <button
                                    onClick={() => {
                                        setStep("verify");
                                    }}
                                    className="w-full text-sm text-muted-foreground hover:text-white transition-colors"
                                >
                                    Regenerate Recovery Codes
                                </button>
                            </div>
                        ) : (
                            <NeonButton onClick={handleStartSetup} className="w-full">
                                Set Up 2FA
                            </NeonButton>
                        )}
                    </GlassCard>
                )}

                {/* Regenerate codes verification */}
                {step === "verify" && (
                    <GlassCard className="p-6 mb-6">
                        <h2 className="text-lg font-bold text-white mb-4">Regenerate Recovery Codes</h2>
                        <p className="text-muted-foreground text-sm mb-4">
                            Enter your current 2FA code to generate new recovery codes. This will invalidate all existing codes.
                        </p>

                        <div className="mb-4">
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                placeholder="000000"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white text-center text-2xl font-mono tracking-widest focus:border-primary focus:outline-none"
                                maxLength={6}
                            />
                        </div>

                        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

                        <div className="flex gap-2">
                            <NeonButton variant="secondary" onClick={() => { setStep("idle"); setCode(""); }} className="flex-1">
                                Cancel
                            </NeonButton>
                            <NeonButton onClick={handleRegenerateRecoveryCodes} disabled={code.length !== 6} className="flex-1">
                                Regenerate
                            </NeonButton>
                        </div>
                    </GlassCard>
                )}
            </div>
        </div>
    );
}
