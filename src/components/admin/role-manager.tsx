"use client";

import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
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
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const managerLevel = ROLE_HIERARCHY[managerRole];
    const currentLevel = ROLE_HIERARCHY[currentRole];

    // Can only manage users below our level
    const canManage = managerLevel > currentLevel;

    // Get available roles (all roles below manager level)
    const availableRoles = Object.entries(ROLE_HIERARCHY)
        .filter(([_, level]) => level < managerLevel)
        .map(([role, _]) => role as Role)
        .sort((a, b) => ROLE_HIERARCHY[b] - ROLE_HIERARCHY[a]); // Highest first

    const openDropdown = useCallback(() => {
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom + 4,
                left: rect.left
            });
            setIsOpen(true);
        }
    }, []);

    const closeDropdown = useCallback(() => {
        setIsOpen(false);
        setPosition(null);
    }, []);

    const handleRoleChange = async (newRole: Role) => {
        if (newRole === currentRole) {
            closeDropdown();
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
        closeDropdown();
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
        <div className="relative inline-block">
            <button
                ref={buttonRef}
                onClick={() => isOpen ? closeDropdown() : openDropdown()}
                disabled={loading}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[currentRole]} hover:opacity-80 transition-opacity cursor-pointer`}
            >
                {ROLE_ICONS[currentRole]}
                {ROLE_LABELS[currentRole]}
                <ChevronDown size={12} className={`ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && position && typeof document !== 'undefined' && createPortal(
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0"
                        style={{ zIndex: 9998 }}
                        onClick={closeDropdown}
                    />

                    {/* Dropdown */}
                    <div
                        className="min-w-[160px] bg-zinc-900 border border-white/20 rounded-lg shadow-2xl"
                        style={{
                            position: 'fixed',
                            top: position.top,
                            left: position.left,
                            zIndex: 9999
                        }}
                    >
                        <div className="py-1">
                            {availableRoles.map(role => (
                                <button
                                    key={role}
                                    onClick={() => handleRoleChange(role)}
                                    disabled={loading}
                                    className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-white/10 transition-colors ${role === currentRole ? 'bg-white/10' : ''
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
                </>,
                document.body
            )}

            {error && (
                <div className="absolute left-0 top-full mt-1 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded whitespace-nowrap">
                    {error}
                </div>
            )}
        </div>
    );
}
