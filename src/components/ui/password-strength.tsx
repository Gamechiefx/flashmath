"use client";

/**
 * Password Strength Indicator Component
 */

import { useMemo } from "react";

interface PasswordStrengthProps {
    password: string;
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
    const analysis = useMemo(() => {
        let score = 0;
        const checks = {
            length: password.length >= 8,
            lowercase: /[a-z]/.test(password),
            uppercase: /[A-Z]/.test(password),
            number: /[0-9]/.test(password),
            special: /[^A-Za-z0-9]/.test(password),
        };

        if (checks.length) score++;
        if (checks.lowercase) score++;
        if (checks.uppercase) score++;
        if (checks.number) score++;
        if (checks.special) score++;

        let label = "Weak";
        let color = "bg-red-500";

        if (score >= 5) {
            label = "Very Strong";
            color = "bg-green-500";
        } else if (score >= 4) {
            label = "Strong";
            color = "bg-green-400";
        } else if (score >= 3) {
            label = "Good";
            color = "bg-yellow-500";
        } else if (score >= 2) {
            label = "Fair";
            color = "bg-orange-500";
        }

        return { score, label, color, checks };
    }, [password]);

    if (!password) return null;

    return (
        <div className="mt-2 space-y-2">
            {/* Strength Bar */}
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((level) => (
                    <div
                        key={level}
                        className={`h-1.5 flex-1 rounded-full transition-all ${level <= analysis.score ? analysis.color : "bg-white/10"
                            }`}
                    />
                ))}
            </div>

            {/* Label */}
            <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Password strength:</span>
                <span className={`font-medium ${analysis.score >= 4 ? "text-green-400" :
                        analysis.score >= 3 ? "text-yellow-400" : "text-red-400"
                    }`}>
                    {analysis.label}
                </span>
            </div>

            {/* Requirements */}
            <div className="grid grid-cols-2 gap-1 text-xs">
                <Requirement met={analysis.checks.length} text="8+ characters" />
                <Requirement met={analysis.checks.lowercase} text="Lowercase letter" />
                <Requirement met={analysis.checks.uppercase} text="Uppercase letter" />
                <Requirement met={analysis.checks.number} text="Number" />
                <Requirement met={analysis.checks.special} text="Special character" />
            </div>
        </div>
    );
}

function Requirement({ met, text }: { met: boolean; text: string }) {
    return (
        <div className={`flex items-center gap-1 ${met ? "text-green-400" : "text-muted-foreground"}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${met ? "bg-green-400" : "bg-white/20"}`} />
            {text}
        </div>
    );
}
