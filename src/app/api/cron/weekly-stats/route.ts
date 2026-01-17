/**
 * Weekly Stats Email Cron Job
 * Sends weekly performance summary emails to active users
 * 
 * Run every Sunday at 6 PM (end of week)
 * Configure in Vercel/your cron provider:
 *   0 18 * * 0 curl -X POST https://flashmath.io/api/cron/weekly-stats -H "Authorization: Bearer $CRON_SECRET"
 */

import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { weeklyStatsEmailTemplate } from "@/lib/email/templates/weekly-stats";

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

interface UserRow {
    id: string;
    name: string;
    email: string;
    current_league_id?: string;
}

interface SessionRow {
    user_id: string;
    correct_count: number;
    total_count: number;
    avg_speed: number;
    xp_gained: number;
    max_streak: number;
    created_at: string;
}

interface LeagueParticipant {
    user_id: string;
    league_id: string;
    weekly_xp: number;
}

// League display names and icons
const LEAGUE_INFO: Record<string, { name: string; icon: string }> = {
    'neon-league': { name: 'Neon', icon: '💫' },
    'cobalt-league': { name: 'Cobalt', icon: '🔷' },
    'plasma-league': { name: 'Plasma', icon: '🔮' },
    'void-league': { name: 'Void', icon: '🌑' },
    'apex-league': { name: 'Apex', icon: '👑' },
};

export async function POST(request: NextRequest) {
    // Verify authorization
    const authHeader = request.headers.get("authorization");
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
        console.error("[WeeklyStats] Unauthorized cron request");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[WeeklyStats] Starting weekly stats email job...");

    try {
        // Get the date range for the past week
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const weekStart = oneWeekAgo.toISOString();

        // Find active users (users who have sessions this week)
        const activeSessions = query(
            `SELECT DISTINCT user_id FROM practice_sessions WHERE created_at >= ?`,
            [weekStart]
        ) as { user_id: string }[];

        const activeUserIds = activeSessions.map(s => s.user_id);
        
        if (activeUserIds.length === 0) {
            console.log("[WeeklyStats] No active users this week");
            return NextResponse.json({ 
                success: true, 
                message: "No active users this week",
                emailsSent: 0 
            });
        }

        console.log(`[WeeklyStats] Found ${activeUserIds.length} active users`);

        let emailsSent = 0;
        let emailsFailed = 0;
        const errors: string[] = [];

        for (const userId of activeUserIds) {
            try {
                // Get user info
                const user = queryOne(
                    'SELECT id, name, email, current_league_id FROM users WHERE id = ?',
                    [userId]
                ) as UserRow | null;

                if (!user || !user.email) {
                    continue;
                }

                // Get this week's sessions
                const sessions = query(
                    `SELECT * FROM practice_sessions WHERE user_id = ? AND created_at >= ?`,
                    [userId, weekStart]
                ) as SessionRow[];

                if (sessions.length === 0) {
                    continue;
                }

                // Calculate stats
                const totalSessions = sessions.length;
                const problemsSolved = sessions.reduce((sum, s) => sum + (s.total_count || 0), 0);
                const correctAnswers = sessions.reduce((sum, s) => sum + (s.correct_count || 0), 0);
                const accuracy = problemsSolved > 0 ? Math.round((correctAnswers / problemsSolved) * 100) : 0;
                const xpEarned = sessions.reduce((sum, s) => sum + (s.xp_gained || 0), 0);
                const bestStreak = Math.max(...sessions.map(s => s.max_streak || 0));
                
                // Calculate average speed (weighted by session size)
                const totalTime = sessions.reduce((sum, s) => sum + ((s.avg_speed || 0) * (s.total_count || 0)), 0);
                const averageSpeed = problemsSolved > 0 ? totalTime / problemsSolved : 0;

                // Get league info
                const leagueParticipant = queryOne(
                    'SELECT * FROM league_participants WHERE user_id = ?',
                    [userId]
                ) as LeagueParticipant | null;

                // Calculate rank within league
                let leagueRank: number | undefined;
                if (leagueParticipant) {
                    const allParticipants = query(
                        'SELECT * FROM league_participants WHERE league_id = ? ORDER BY weekly_xp DESC',
                        [leagueParticipant.league_id]
                    ) as LeagueParticipant[];
                    
                    leagueRank = allParticipants.findIndex(p => p.user_id === userId) + 1;
                }

                const leagueInfo = user.current_league_id ? LEAGUE_INFO[user.current_league_id] : null;

                // Generate and send email
                const template = weeklyStatsEmailTemplate(
                    user.name,
                    {
                        totalSessions,
                        problemsSolved,
                        accuracy,
                        averageSpeed: Math.round(averageSpeed * 100) / 100,
                        bestStreak,
                        xpEarned,
                        leagueName: leagueInfo?.name,
                        leagueIcon: leagueInfo?.icon,
                        leagueRank,
                    },
                    undefined, // No challenges for now
                    `${process.env.NEXTAUTH_URL || 'https://flashmath.io'}/dashboard`
                );

                const result = await sendEmail({
                    to: user.email,
                    subject: template.subject,
                    html: template.html,
                    text: template.text,
                });

                if (result.success) {
                    emailsSent++;
                    console.log(`[WeeklyStats] Email sent to ${user.email}`);
                } else {
                    emailsFailed++;
                    errors.push(`${user.email}: ${result.error}`);
                }
            } catch (err) {
                emailsFailed++;
                errors.push(`User ${userId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
        }

        console.log(`[WeeklyStats] Job complete. Sent: ${emailsSent}, Failed: ${emailsFailed}`);

        return NextResponse.json({
            success: true,
            emailsSent,
            emailsFailed,
            totalActiveUsers: activeUserIds.length,
            errors: errors.length > 0 ? errors.slice(0, 10) : undefined, // Limit error list
        });

    } catch (error) {
        console.error("[WeeklyStats] Job failed:", error);
        return NextResponse.json(
            { error: "Weekly stats job failed", details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

// GET endpoint for health checks
export async function GET() {
    return NextResponse.json({
        status: "ok",
        endpoint: "weekly-stats",
        description: "Sends weekly performance summary emails to active users",
        schedule: "Every Sunday at 6 PM",
    });
}
