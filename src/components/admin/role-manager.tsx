"use client";

import { useState } from "react";
import { Role, ROLE_LABELS, ROLE_COLORS, ROLE_HIERARCHY } from "@/lib/rbac";
import { changeUserRole } from "@/lib/actions/roles";
import { Shield, ChevronDown, Crown, User, UserCheck } from "lucide-react";

interface RoleManagerProps {
    userId: string;
    userName: string;
    currentRole: Role;
    managerRole: Role;
    onRoleChanged?: () => void;
}

const ROLE_ICONS: Record<Role, React.ReactNode> = {
    [Role.USER]: <User size={14} />,
    [Role.MODERATOR]: <Shield size={14} />,
    [Role.ADMIN]: <UserCheck size={14} />,
    [Role.SUPER_ADMIN]: <Crown size={14} />,
};

export function RoleManager({ userId, userName, currentRole, managerRole, onRoleChanged }: RoleManagerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const managerLevel = ROLE_HIERARCHY[managerRole];
    const currentLevel = ROLE_HIERARCHY[currentRole];

    // Can only manage users below our level
    const canManage = managerLevel > currentLevel;

    // Get available roles (all roles below manager level)
    const availableRoles = Object.entries(ROLE_HIERARCHY)
        .filter(([_, level]) => level < managerLevel)
        .map(([role, _]) => role as Role)
        .sort((a, b) => ROLE_HIERARCHY[b] - ROLE_HIERARCHY[a]); // Highest first

    const handleRoleChange = async (newRole: Role) => {
        if (newRole === currentRole) {
            setIsOpen(false);
            return;
        }

        setLoading(true);
        setError(null);

        const result = await changeUserRole(userId, newRole);

        if (result.success) {
            onRoleChanged?.();
        } else {
            setError(result.error || "Failed to change role");
        }

        setLoading(false);
        setIsOpen(false);
    };

    if (!canManage) {
        // Can't manage - just show badge
        return (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[currentRole]}`}>
                {ROLE_ICONS[currentRole]}
                {ROLE_LABELS[currentRole]}
            </span>
        );
    }

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={loading}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[currentRole]} hover:opacity-80 transition-opacity cursor-pointer`}
            >
                {ROLE_ICONS[currentRole]}
                {ROLE_LABELS[currentRole]}
                <ChevronDown size={12} className={`ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Dropdown */}
                    <div className="absolute left-0 top-full mt-1 z-50 min-w-[160px] bg-background border border-white/10 rounded-lg shadow-xl overflow-hidden">
                        <div className="py-1">
                            {availableRoles.map(role => (
                                <button
                                    key={role}
                                    onClick={() => handleRoleChange(role)}
                                    disabled={loading}
                                    className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-white/5 transition-colors ${role === currentRole ? 'bg-white/10' : ''
                                        }`}
                                >
                                    <span className={ROLE_COLORS[role].split(' ')[0]}>
                                        {ROLE_ICONS[role]}
                                    </span>
                                    <span>{ROLE_LABELS[role]}</span>
                                    {role === currentRole && (
                                        <span className="ml-auto text-xs text-muted-foreground">Current</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {error && (
                <div className="absolute left-0 top-full mt-1 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
                    {error}
                </div>
            )}
        </div>
    );
}
