import { isSignupEnabled } from "@/lib/actions/system";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";

/**
 * Wraps registration content and, when signups are disabled, presents a "REGISTRATION CLOSED" notice with alternative actions.
 *
 * @returns The registration-closed UI when signups are disabled, or the provided `children` when signups are enabled.
 */
export default async function RegisterLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const signupEnabled = await isSignupEnabled();

    if (!signupEnabled) {
        return (
            <main className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-background text-foreground">
                {/* Background Glows */}
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-yellow-500/10 rounded-full blur-[120px]" />
                </div>

                <Link href="/" className="absolute top-10 left-10 flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                    <ArrowLeft size={16} />
                    Back to Home
                </Link>

                <div className="w-full max-w-md relative z-10 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-yellow-500/20 text-yellow-400 mb-6">
                        <AlertTriangle size={32} />
                    </div>

                    <h1 className="text-3xl font-black tracking-tight mb-4">REGISTRATION CLOSED</h1>

                    <GlassCard className="space-y-4">
                        <p className="text-muted-foreground">
                            New account registration is currently disabled. Please check back later or contact an administrator.
                        </p>

                        <div className="flex flex-col gap-3 pt-2">
                            <Link
                                href="/auth/login"
                                className="w-full py-3 px-4 bg-primary/20 hover:bg-primary/30 border border-primary/30 rounded-xl text-primary font-bold transition-all text-center"
                            >
                                Sign In Instead
                            </Link>
                            <Link
                                href="/"
                                className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-bold transition-all text-center"
                            >
                                Return Home
                            </Link>
                        </div>
                    </GlassCard>
                </div>
            </main>
        );
    }

    return <>{children}</>;
}