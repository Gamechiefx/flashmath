"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { updateSystemSetting } from "@/lib/actions/system";
import { Loader2, Settings, Shield, UserPlus, MessageSquare, Save } from "lucide-react";

interface SystemControlsProps {
    maintenanceMode: boolean;
    maintenanceMessage: string;
    signupEnabled: boolean;
}

/**
 * Render a UI for managing system settings: maintenance mode, a maintenance message, and signup availability.
 *
 * The component maintains internal state initialized from props and invokes `updateSystemSetting` to persist changes.
 * On update failures it shows an alert; successfully saving the maintenance message briefly shows a saved indicator.
 *
 * @param maintenanceMode - Initial value indicating whether maintenance mode is enabled
 * @param maintenanceMessage - Initial maintenance message text
 * @param signupEnabled - Initial value indicating whether new user signups are allowed
 * @returns The rendered React element containing controls for toggling settings and editing the maintenance message
 */
export function SystemControls({
    maintenanceMode: initialMaintenance,
    maintenanceMessage: initialMessage,
    signupEnabled: initialSignup
}: SystemControlsProps) {
    const [maintenanceMode, setMaintenanceMode] = useState(initialMaintenance);
    const [maintenanceMessage, setMaintenanceMessage] = useState(initialMessage);
    const [signupEnabled, setSignupEnabled] = useState(initialSignup);
    const [loading, setLoading] = useState<string | null>(null);
    const [messageSaved, setMessageSaved] = useState(false);

    const handleToggle = async (key: string, currentValue: boolean, setter: (v: boolean) => void) => {
        setLoading(key);
        const newValue = !currentValue;
        const result = await updateSystemSetting(key, String(newValue));

        if (result.success) {
            setter(newValue);
        } else {
            alert(`Error: ${result.error}`);
        }
        setLoading(null);
    };

    const handleSaveMessage = async () => {
        setLoading('maintenance_message');
        const result = await updateSystemSetting('maintenance_message', maintenanceMessage);

        if (result.success) {
            setMessageSaved(true);
            setTimeout(() => setMessageSaved(false), 2000);
        } else {
            alert(`Error: ${result.error}`);
        }
        setLoading(null);
    };

    return (
        <GlassCard className="space-y-6">
            <div className="flex items-center gap-3 text-primary">
                <Settings size={20} />
                <h3 className="text-lg font-bold uppercase tracking-widest">System Controls</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Maintenance Mode */}
                <div className={`p-6 rounded-xl border transition-all ${maintenanceMode ? 'bg-red-500/10 border-red-500/30' : 'bg-white/5 border-white/10'}`}>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <Shield className={maintenanceMode ? "text-red-400" : "text-muted-foreground"} />
                            <div>
                                <div className="font-bold">Maintenance Mode</div>
                                <div className="text-xs text-muted-foreground">
                                    {maintenanceMode ? "Site is in maintenance mode" : "Site is accessible"}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => handleToggle('maintenance_mode', maintenanceMode, setMaintenanceMode)}
                            disabled={loading === 'maintenance_mode'}
                            className={`relative w-14 h-7 rounded-full transition-colors ${maintenanceMode ? 'bg-red-500' : 'bg-zinc-700'}`}
                        >
                            {loading === 'maintenance_mode' ? (
                                <Loader2 size={16} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                            ) : (
                                <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${maintenanceMode ? 'left-8' : 'left-1'}`} />
                            )}
                        </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        When enabled, non-admin users will see a maintenance banner. Auth is disabled.
                    </p>
                </div>

                {/* Signup Toggle */}
                <div className={`p-6 rounded-xl border transition-all ${!signupEnabled ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-white/5 border-white/10'}`}>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <UserPlus className={!signupEnabled ? "text-yellow-400" : "text-muted-foreground"} />
                            <div>
                                <div className="font-bold">Signups Enabled</div>
                                <div className="text-xs text-muted-foreground">
                                    {signupEnabled ? "New users can register" : "Registration disabled"}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => handleToggle('signup_enabled', signupEnabled, setSignupEnabled)}
                            disabled={loading === 'signup_enabled'}
                            className={`relative w-14 h-7 rounded-full transition-colors ${signupEnabled ? 'bg-green-500' : 'bg-zinc-700'}`}
                        >
                            {loading === 'signup_enabled' ? (
                                <Loader2 size={16} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                            ) : (
                                <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${signupEnabled ? 'left-8' : 'left-1'}`} />
                            )}
                        </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        When disabled, new users cannot create accounts. Existing users can still log in.
                    </p>
                </div>
            </div>

            {/* Maintenance Message Editor */}
            <div className={`p-6 rounded-xl border transition-all ${maintenanceMode ? 'bg-red-500/5 border-red-500/20' : 'bg-white/5 border-white/10'}`}>
                <div className="flex items-center gap-3 mb-4">
                    <MessageSquare className={maintenanceMode ? "text-red-400" : "text-muted-foreground"} />
                    <div>
                        <div className="font-bold">Maintenance Message</div>
                        <div className="text-xs text-muted-foreground">
                            Displayed to users when maintenance mode is active
                        </div>
                    </div>
                </div>
                <div className="space-y-3">
                    <textarea
                        value={maintenanceMessage}
                        onChange={(e) => setMaintenanceMessage(e.target.value)}
                        placeholder="Enter maintenance message..."
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-sm min-h-[80px] resize-none focus:outline-none focus:border-primary/50"
                    />
                    <div className="flex justify-end">
                        <button
                            onClick={handleSaveMessage}
                            disabled={loading === 'maintenance_message'}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${messageSaved
                                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                    : 'bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30'
                                }`}
                        >
                            {loading === 'maintenance_message' ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : messageSaved ? (
                                <>✓ Saved</>
                            ) : (
                                <><Save size={14} /> Save Message</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </GlassCard>
    );
}