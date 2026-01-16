"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { Settings, User, Lock, Trash2, ArrowLeft, AlertTriangle, RefreshCw, Volume2, Shield, Monitor, ChevronRight, Link2, Clock, Mail, CheckCircle, Eye, EyeOff, Calendar } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { resetUserData, deleteUserAccount, updateUsername } from "@/lib/actions/settings";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

interface SettingsViewProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- User data from database
    user: any;
}

import { useAudioSettings } from "@/components/audio-settings-provider";

function VolumeControl() {
    const { bgmVolume, setBGMVolume, sfxVolume, setSFXVolume } = useAudioSettings();

    return (
        <div className="space-y-6">
            {/* Music Volume */}
            <div>
                <div className="flex justify-between mb-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Music</label>
                    <span className="text-xs font-mono text-primary">{Math.round(bgmVolume * 100)}%</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={bgmVolume}
                    onChange={(e) => setBGMVolume(parseFloat(e.target.value))}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary hover:accent-primary/80"
                />
            </div>

            {/* SFX Volume */}
            <div>
                <div className="flex justify-between mb-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Sound Effects</label>
                    <span className="text-xs font-mono text-green-400">{Math.round(sfxVolume * 100)}%</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={sfxVolume}
                    onChange={(e) => setSFXVolume(parseFloat(e.target.value))}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-green-400 hover:accent-green-300"
                />
            </div>
        </div>
    );
}

function KeybindSettings() {
    const [continueKey, setContinueKey] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('continueKey') || 'Space';
        }
        return 'Space';
    });
    const [isListening, setIsListening] = useState(false);

    const handleKeyCapture = (e: React.KeyboardEvent) => {
        e.preventDefault();
        const key = e.code;
        setContinueKey(key);
        localStorage.setItem('continueKey', key);
        setIsListening(false);
    };

    const formatKeyName = (key: string) => {
        if (key === 'Space') return 'Space';
        if (key.startsWith('Key')) return key.replace('Key', '');
        if (key.startsWith('Digit')) return key.replace('Digit', '');
        return key.replace('Arrow', '↑↓←→'.includes(key.slice(-1)) ? '' : '');
    };

    return (
        <div className="space-y-4">
            <div>
                <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Continue Key</label>
                    <span className="text-xs text-muted-foreground">Press after wrong answer</span>
                </div>
                <button
                    onClick={() => setIsListening(true)}
                    onKeyDown={isListening ? handleKeyCapture : undefined}
                    className={`w-full p-4 rounded-xl border text-left transition-all ${isListening
                        ? 'bg-purple-500/20 border-purple-500/50 animate-pulse'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                        }`}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            {isListening ? (
                                <span className="text-purple-400 text-sm">Press any key...</span>
                            ) : (
                                <kbd className="px-3 py-1.5 bg-white/10 rounded text-lg font-mono text-white">
                                    {formatKeyName(continueKey)}
                                </kbd>
                            )}
                        </div>
                        {!isListening && (
                            <span className="text-xs text-muted-foreground">Click to change</span>
                        )}
                    </div>
                </button>
            </div>
        </div>
    );
}

export function SettingsView({ user }: SettingsViewProps) {
    const router = useRouter();
    const [newUsername, setNewUsername] = useState(user?.name || "");
    const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
    const [usernameError, setUsernameError] = useState("");

    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);

    const handleUpdateUsername = async () => {
        if (newUsername === user?.name) return;

        setIsUpdatingUsername(true);
        setUsernameError("");

        const result = await updateUsername(newUsername);

        if (result.error) {
            setUsernameError(result.error);
        } else {
            router.refresh();
        }

        setIsUpdatingUsername(false);
    };

    const [showDOB, setShowDOB] = useState(false);

    // Format DOB for masked display - parse as local time to avoid timezone shift
    const formatDOB = (dobString: string) => {
        if (!dobString) return "";
        // Parse as local time by appending T00:00:00 to avoid UTC interpretation
        const [year, month, day] = dobString.split('-').map(Number);
        const date = new Date(year, month - 1, day); // Month is 0-indexed
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };

    const maskedDOB = "••/••/••••";

    const handleResetData = async () => {
        setIsResetting(true);
        const result = await resetUserData();

        if (result.success) {
            // Force a hard refresh to clear all caches
            window.location.href = "/dashboard";
        }

        setIsResetting(false);
        setShowResetConfirm(false);
    };

    const handleDeleteAccount = async () => {
        if (deleteConfirmText !== "DELETE") return;

        setIsDeleting(true);

        // 1. Delete data on server
        await deleteUserAccount();

        // 2. Sign out on client (clears cookies/session) and redirect
        await signOut({ callbackUrl: '/' });
    };

    return (
        <div className="min-h-screen bg-background text-foreground p-6 md:p-12 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-accent/5 rounded-full blur-[100px]" />
            </div>

            <div className="max-w-4xl mx-auto relative z-10 space-y-8">
                {/* Header */}
                <div className="flex items-center gap-6">
                    <Link href="/dashboard">
                        <NeonButton variant="ghost" className="p-3 rounded-xl border border-white/10 hover:bg-white/5">
                            <ArrowLeft size={24} />
                        </NeonButton>
                    </Link>
                    <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Settings size={14} />
                            Account Settings
                        </div>
                        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-primary">
                            Settings
                        </h1>
                    </div>
                </div>

                {/* Settings Sections */}
                <div className="space-y-6">
                    {/* Profile Section */}
                    <GlassCard className="p-6 space-y-4">
                        <div className="flex items-center gap-3 mb-4">
                            <User size={20} className="text-primary" />
                            <h2 className="text-xl font-black uppercase tracking-tight">Profile</h2>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Username <span className="text-yellow-400/70 normal-case font-normal">(Sign out for changes to apply, Can change every 3 months)</span></label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newUsername}
                                        onChange={(e) => setNewUsername(e.target.value)}
                                        className="flex-1 p-4 rounded-xl bg-white/5 border border-white/10 text-lg font-bold focus:outline-none focus:border-primary transition-colors"
                                        placeholder="Enter new username"
                                    />
                                    <button
                                        onClick={handleUpdateUsername}
                                        disabled={isUpdatingUsername || newUsername === user?.name}
                                        className="px-6 py-4 rounded-xl bg-primary/20 border border-primary/30 text-primary font-bold uppercase text-sm hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isUpdatingUsername ? "Updating..." : "Update"}
                                    </button>
                                </div>
                                {usernameError && (
                                    <div className="text-xs text-red-400 mt-2">{usernameError}</div>
                                )}
                            </div>

                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Date of Birth</label>
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                    {user?.dob ? (
                                        // DOB is set - show masked display with eye toggle
                                        <>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <Calendar size={16} className="text-muted-foreground" />
                                                    <span className="text-lg font-bold font-mono">
                                                        {showDOB ? formatDOB(user.dob) : maskedDOB}
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={() => setShowDOB(!showDOB)}
                                                    className="p-2 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-white"
                                                    title={showDOB ? "Hide date of birth" : "Show date of birth"}
                                                >
                                                    {showDOB ? <EyeOff size={18} /> : <Eye size={18} />}
                                                </button>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-2">Date of birth cannot be changed</p>
                                        </>
                                    ) : (
                                        // DOB not set - show message
                                        <div className="flex items-center gap-3 text-muted-foreground">
                                            <Calendar size={16} />
                                            <span className="text-sm">Not set - DOB is set during registration</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Email</label>
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                    <div className="flex items-center justify-between">
                                        <div className="text-lg font-bold">{user?.email}</div>
                                        {user?.emailVerified ? (
                                            <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
                                                <CheckCircle size={12} />
                                                Verified
                                            </span>
                                        ) : (
                                            <Link
                                                href="/arena/verify-email"
                                                className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-500/10 px-3 py-1.5 rounded-full hover:bg-yellow-500/20 transition-colors"
                                            >
                                                <Mail size={12} />
                                                Verify Email
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Member Since</label>
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                    <div className="flex items-center gap-2">
                                        <Clock size={16} className="text-muted-foreground" />
                                        <span className="text-lg font-bold">
                                            {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric'
                                            }) : 'Unknown'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </GlassCard>

                    {/* Audio Section */}
                    <GlassCard className="p-6 space-y-4">
                        <div className="flex items-center gap-3 mb-4">
                            <Volume2 size={20} className="text-green-400" />
                            <h2 className="text-xl font-black uppercase tracking-tight">Audio</h2>
                        </div>

                        <div className="space-y-6">
                            <VolumeControl />
                        </div>
                    </GlassCard>

                    {/* Keybinds Section */}
                    <GlassCard className="p-6 space-y-4">
                        <div className="flex items-center gap-3 mb-4">
                            <Settings size={20} className="text-purple-400" />
                            <h2 className="text-xl font-black uppercase tracking-tight">Keybinds</h2>
                        </div>

                        <KeybindSettings />
                    </GlassCard>

                    {/* Security Section */}
                    <GlassCard className="p-6 space-y-4">
                        <div className="flex items-center gap-3 mb-4">
                            <Lock size={20} className="text-accent" />
                            <h2 className="text-xl font-black uppercase tracking-tight">Security</h2>
                        </div>

                        <div className="space-y-3">
                            <Link
                                href="/settings/security"
                                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-left hover:bg-white/10 transition-colors flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <Shield size={18} className="text-primary" />
                                    <div>
                                        <div className="text-sm font-bold uppercase tracking-widest">Two-Factor Authentication</div>
                                        <div className="text-xs text-muted-foreground mt-1">Add an extra layer of security</div>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-muted-foreground" />
                            </Link>

                            <Link
                                href="/settings/sessions"
                                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-left hover:bg-white/10 transition-colors flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <Monitor size={18} className="text-accent" />
                                    <div>
                                        <div className="text-sm font-bold uppercase tracking-widest">Active Sessions</div>
                                        <div className="text-xs text-muted-foreground mt-1">Manage where you&apos;re logged in</div>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-muted-foreground" />
                            </Link>

                            <Link
                                href="/forgot-password"
                                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-left hover:bg-white/10 transition-colors flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <Lock size={18} className="text-yellow-400" />
                                    <div>
                                        <div className="text-sm font-bold uppercase tracking-widest">Change Password</div>
                                        <div className="text-xs text-muted-foreground mt-1">Update your password</div>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-muted-foreground" />
                            </Link>

                            <Link
                                href="/settings/linked-accounts"
                                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-left hover:bg-white/10 transition-colors flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <Link2 size={18} className="text-purple-400" />
                                    <div>
                                        <div className="text-sm font-bold uppercase tracking-widest">Linked Accounts</div>
                                        <div className="text-xs text-muted-foreground mt-1">Manage connected logins (Google)</div>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-muted-foreground" />
                            </Link>

                            <Link
                                href="/settings/activity"
                                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-left hover:bg-white/10 transition-colors flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <Clock size={18} className="text-orange-400" />
                                    <div>
                                        <div className="text-sm font-bold uppercase tracking-widest">Security Activity</div>
                                        <div className="text-xs text-muted-foreground mt-1">View recent security events</div>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-muted-foreground" />
                            </Link>
                        </div>
                    </GlassCard>

                    {/* Danger Zone */}
                    <GlassCard className="p-6 space-y-4 border-red-500/20">
                        <div className="flex items-center gap-3 mb-4">
                            <Trash2 size={20} className="text-red-400" />
                            <h2 className="text-xl font-black uppercase tracking-tight text-red-400">Danger Zone</h2>
                        </div>

                        <div className="space-y-4">
                            {/* Reset All Data */}
                            <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="text-sm font-bold uppercase tracking-widest text-yellow-400 flex items-center gap-2">
                                            <RefreshCw size={16} />
                                            Reset All Data
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                            Clear all sessions, stats, and progress. Your account will remain active but all data will be reset to zero.
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowResetConfirm(true)}
                                        className="px-4 py-2 rounded-lg bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 font-bold uppercase text-xs hover:bg-yellow-500/30 transition-colors whitespace-nowrap"
                                    >
                                        Reset Data
                                    </button>
                                </div>
                            </div>

                            {/* Delete Account */}
                            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="text-sm font-bold uppercase tracking-widest text-red-400">Delete Account</div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                            Permanently delete your account and all data. This action cannot be undone.
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowDeleteConfirm(true)}
                                        className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 font-bold uppercase text-xs hover:bg-red-500/30 transition-colors whitespace-nowrap"
                                    >
                                        Delete Account
                                    </button>
                                </div>
                            </div>
                        </div>
                    </GlassCard>
                </div>

                <div className="flex justify-center pt-8">
                    <Link href="/dashboard">
                        <NeonButton>
                            Back to Dashboard
                        </NeonButton>
                    </Link>
                </div>
            </div>

            {/* Reset Confirmation Modal */}
            {showResetConfirm && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <GlassCard className="max-w-md w-full p-6 space-y-4 border-yellow-500/20">
                        <div className="flex items-center gap-3 text-yellow-400">
                            <AlertTriangle size={24} />
                            <h3 className="text-xl font-black uppercase">Confirm Reset</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            This will permanently delete all your sessions, stats, and progress. Your XP, level, and coins will be reset to zero. This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowResetConfirm(false)}
                                disabled={isResetting}
                                className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 font-bold uppercase text-sm hover:bg-white/10 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleResetData}
                                disabled={isResetting}
                                className="flex-1 px-4 py-3 rounded-xl bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 font-bold uppercase text-sm hover:bg-yellow-500/30 transition-colors disabled:opacity-50"
                            >
                                {isResetting ? "Resetting..." : "Reset All Data"}
                            </button>
                        </div>
                    </GlassCard>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <GlassCard className="max-w-md w-full p-6 space-y-4 border-red-500/20">
                        <div className="flex items-center gap-3 text-red-400">
                            <AlertTriangle size={24} />
                            <h3 className="text-xl font-black uppercase">Delete Account</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            This will permanently delete your account and all associated data. This action cannot be undone.
                        </p>
                        <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
                                Type &quot;DELETE&quot; to confirm
                            </label>
                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-lg font-bold focus:outline-none focus:border-red-500 transition-colors"
                                placeholder="DELETE"
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowDeleteConfirm(false);
                                    setDeleteConfirmText("");
                                }}
                                disabled={isDeleting}
                                className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 font-bold uppercase text-sm hover:bg-white/10 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteAccount}
                                disabled={isDeleting || deleteConfirmText !== "DELETE"}
                                className="flex-1 px-4 py-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 font-bold uppercase text-sm hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isDeleting ? "Deleting..." : "Delete Forever"}
                            </button>
                        </div>
                    </GlassCard>
                </div>
            )}
        </div>
    );
}
