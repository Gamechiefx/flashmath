import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { auth } from "@/auth";
import { parseRole, hasPermission, Permission } from "@/lib/rbac";

export async function GET() {
    // Check if user is admin
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDatabase();
    const userId = (session.user as any).id;
    const user = db.prepare('SELECT role, is_admin FROM users WHERE id = ?').get(userId) as any;

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userRole = parseRole(user.role, !!user.is_admin);

    if (!hasPermission(userRole, Permission.VIEW_ADMIN_CONSOLE)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Count users active in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const result = db.prepare(`
        SELECT COUNT(*) as count
        FROM users
        WHERE last_active > ?
    `).get(fiveMinutesAgo) as { count: number };

    return NextResponse.json({ count: result?.count || 0 });
}
