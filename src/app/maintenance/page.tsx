import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";

export default function MaintenancePage() {
    return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
            <div className="max-w-md text-center space-y-8">
                <div className="flex justify-center">
                    <div className="p-6 rounded-full bg-yellow-500/10 border border-yellow-500/30">
                        <AlertTriangle size={64} className="text-yellow-400" />
                    </div>
                </div>

                <div className="space-y-4">
                    <h1 className="text-4xl font-black uppercase tracking-tighter">
                        Under <span className="text-yellow-400">Maintenance</span>
                    </h1>
                    <p className="text-muted-foreground text-lg">
                        FlashMath is currently undergoing scheduled maintenance.
                        We'll be back shortly!
                    </p>
                </div>

                <div className="p-6 rounded-xl bg-white/5 border border-white/10 space-y-2">
                    <p className="text-sm text-muted-foreground">
                        We're working hard to improve your experience.
                        Please check back in a few minutes.
                    </p>
                </div>

                <div className="flex justify-center">
                    <Link
                        href="/"
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-sm font-bold uppercase tracking-widest"
                    >
                        <ArrowLeft size={16} />
                        Try Again
                    </Link>
                </div>
            </div>
        </div>
    );
}
