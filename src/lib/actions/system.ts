"use server";

import { getDatabase } from "@/lib/db";
import { auth } from "@/auth";
import { parseRole, hasPermission, Permission, Role } from "@/lib/rbac";

const now = () => new Date().toISOString();

// Ensure system_settings table exists
function ensureSystemSettingsTable() {
    const db = getDatabase();
    db.exec(`
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT,
            updated_by TEXT
        )
    `);
    // Insert defaults if not exists
    db.exec(`
        INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES
            ('maintenance_mode', 'false', datetime('now')),
            ('maintenance_message', 'We are currently performing scheduled maintenance. Please check back soon!', datetime('now')),
            ('signup_enabled', 'true', datetime('now'))
    `);
}

/**
 * Get a system setting value
 */
export async function getSystemSetting(key: string): Promise<string | null> {
    ensureSystemSettingsTable();
    const db = getDatabase();
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
}

/**
 * Get all system settings
 */
export async function getAllSystemSettings(): Promise<Record<string, string>> {
    ensureSystemSettingsTable();
    const db = getDatabase();
    const rows = db.prepare('SELECT key, value FROM system_settings').all() as Array<{ key: string; value: string }>;
    const settings: Record<string, string> = {};
    for (const row of rows) {
        settings[row.key] = row.value;
    }
    return settings;
}

/**
 * Update a system setting (admin only)
 */
export async function updateSystemSetting(key: string, value: string): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: "Not authenticated" };
    }

    const db = getDatabase();
    const userId = (session.user as { id: string }).id;
    const user = db.prepare('SELECT role, is_admin FROM users WHERE id = ?').get(userId) as { role?: string | null; is_admin?: number } | undefined;

    if (!user) {
        return { success: false, error: "User not found" };
    }

    const userRole = parseRole(user.role, !!user.is_admin);

    // Only admins can change system settings
    if (!hasPermission(userRole, Permission.VIEW_ADMIN_CONSOLE)) {
        return { success: false, error: "Insufficient permissions" };
    }

    ensureSystemSettingsTable();

    db.prepare(`
        INSERT INTO system_settings (key, value, updated_at, updated_by)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?, updated_by = ?
    `).run(key, value, now(), userId, value, now(), userId);

    console.log(`[System] Setting '${key}' updated to '${value}' by ${userId}`);
    return { success: true };
}

/**
 * Quick check: Is maintenance mode enabled?
 */
export async function isMaintenanceMode(): Promise<boolean> {
    const value = await getSystemSetting('maintenance_mode');
    return value === 'true';
}

/**
 * Quick check: Are signups enabled?
 */
export async function isSignupEnabled(): Promise<boolean> {
    const value = await getSystemSetting('signup_enabled');
    return value !== 'false'; // Default to true
}

/**
 * Check if current user can bypass maintenance mode
 */
export async function canBypassMaintenance(): Promise<boolean> {
    const session = await auth();
    if (!session?.user) return false;

    const db = getDatabase();
    const userId = (session.user as { id: string }).id;
    const user = db.prepare('SELECT role, is_admin FROM users WHERE id = ?').get(userId) as { role?: string | null; is_admin?: number } | undefined;

    if (!user) return false;

    const userRole = parseRole(user.role, !!user.is_admin);
    // Admins and above can bypass maintenance
    return userRole === Role.ADMIN || userRole === Role.SUPER_ADMIN;
}
