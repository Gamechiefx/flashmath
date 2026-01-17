'use client';

/**
 * Lazy-loaded Components
 * 
 * This module exports lazy-loaded versions of heavy components
 * to improve initial page load performance.
 * 
 * Usage:
 *   import { LazyArenaLeaderboard } from '@/components/lazy';
 * 
 * Benefits:
 * - Faster initial page load (components load on-demand)
 * - Reduced initial bundle size
 * - Better Core Web Vitals (LCP, FID)
 */

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// =============================================================================
// LOADING FALLBACKS
// =============================================================================

const LoadingSpinner = () => (
    <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
);

const LoadingCard = () => (
    <div className="animate-pulse bg-card/50 rounded-lg p-6 space-y-4">
        <div className="h-4 bg-muted rounded w-3/4"></div>
        <div className="h-4 bg-muted rounded w-1/2"></div>
        <div className="h-20 bg-muted rounded"></div>
    </div>
);

const LoadingTable = () => (
    <div className="animate-pulse space-y-2">
        <div className="h-10 bg-muted rounded"></div>
        {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-muted/50 rounded"></div>
        ))}
    </div>
);

// =============================================================================
// ARENA COMPONENTS (Heavy - animations, charts, real-time)
// =============================================================================

/**
 * Arena Leaderboard - Heavy component with animations and data tables
 */
export const LazyArenaLeaderboard = dynamic(
    () => import('@/components/arena/arena-leaderboard').then(mod => mod.ArenaLeaderboard),
    {
        loading: () => <LoadingTable />,
        ssr: false,
    }
);

/**
 * Real-time Match Interface - Socket.IO, animations, timers
 */
export const LazyRealTimeMatch = dynamic(
    () => import('@/components/arena/real-time-match').then(mod => mod.RealTimeMatch),
    {
        loading: () => <LoadingSpinner />,
        ssr: false,
    }
);

/**
 * Match Lobby - Pre-match waiting room with animations
 */
export const LazyMatchLobby = dynamic(
    () => import('@/components/arena/match-lobby').then(mod => mod.MatchLobby),
    {
        loading: () => <LoadingSpinner />,
        ssr: false,
    }
);

/**
 * Matchmaking Queue - Queue UI with timers
 */
export const LazyMatchmakingQueue = dynamic(
    () => import('@/components/arena/matchmaking-queue').then(mod => mod.MatchmakingQueue),
    {
        loading: () => <LoadingSpinner />,
        ssr: false,
    }
);

// =============================================================================
// EFFECTS COMPONENTS (Heavy - canvas, particles, audio)
// =============================================================================

/**
 * Particle Effects - Canvas-based particle system
 */
export const LazyParticleEffects = dynamic(
    () => import('@/components/effects/particle-effects').then(mod => mod.ParticleEffects),
    {
        loading: () => null, // No loading indicator for effects
        ssr: false,
    }
);

/**
 * Starfield Background - Animated canvas background
 */
export const LazyStarfield = dynamic(
    () => import('@/components/effects/starfield').then(mod => mod.Starfield),
    {
        loading: () => null,
        ssr: false,
    }
);

/**
 * BGM Player - Audio player component
 */
export const LazyBgmPlayer = dynamic(
    () => import('@/components/effects/bgm-player').then(mod => mod.BGMPlayer),
    {
        loading: () => null,
        ssr: false,
    }
);

// =============================================================================
// SOCIAL COMPONENTS (Moderate - real-time updates)
// =============================================================================

/**
 * Social Panel - Friends, parties, presence
 */
export const LazySocialPanel = dynamic(
    () => import('@/components/social/social-panel').then(mod => mod.SocialPanel),
    {
        loading: () => <LoadingCard />,
        ssr: false,
    }
);

// =============================================================================
// STATS/CHARTS COMPONENTS (Heavy - data visualization)
// =============================================================================

/**
 * Career Stats View - Charts and statistics
 */
export const LazyCareerStatsView = dynamic(
    () => import('@/components/career-stats-view').then(mod => mod.CareerStatsView),
    {
        loading: () => <LoadingCard />,
        ssr: false,
    }
);

/**
 * Operation Stats Modal - Detailed stats with charts
 */
export const LazyOperationStatsModal = dynamic(
    () => import('@/components/operation-stats-modal').then(mod => mod.OperationStatsModal),
    {
        loading: () => <LoadingSpinner />,
        ssr: false,
    }
);

/**
 * Leaderboard View - Full leaderboard with sorting
 */
export const LazyLeaderboardView = dynamic(
    () => import('@/components/leaderboard-view').then(mod => mod.LeaderboardView),
    {
        loading: () => <LoadingTable />,
        ssr: false,
    }
);

// =============================================================================
// SHOP/LOCKER COMPONENTS (Moderate - images, animations)
// =============================================================================

/**
 * Shop View - Item cards with preview
 */
export const LazyShopView = dynamic(
    () => import('@/components/shop-view').then(mod => mod.ShopView),
    {
        loading: () => <LoadingCard />,
        ssr: false,
    }
);

/**
 * Banner Editor - Canvas-based banner customization
 */
export const LazyBannerEditor = dynamic(
    () => import('@/components/locker/banner-editor-client').then(mod => mod.BannerEditorClient),
    {
        loading: () => <LoadingCard />,
        ssr: false,
    }
);

/**
 * Compact Locker View - Inventory display
 */
export const LazyCompactLockerView = dynamic(
    () => import('@/components/locker/compact-locker-view').then(mod => mod.CompactLockerView),
    {
        loading: () => <LoadingCard />,
        ssr: false,
    }
);

// =============================================================================
// ADMIN COMPONENTS (Heavy - data tables, forms)
// =============================================================================

/**
 * User Manager - Admin user management with data tables
 */
export const LazyUserManager = dynamic(
    () => import('@/components/admin/user-manager').then(mod => mod.UserManager),
    {
        loading: () => <LoadingTable />,
        ssr: false,
    }
);

/**
 * Auditor Panel - Match auditing tools
 */
export const LazyAuditorPanel = dynamic(
    () => import('@/components/auditor/auditor-panel').then(mod => mod.AuditorPanel),
    {
        loading: () => <LoadingCard />,
        ssr: false,
    }
);

// =============================================================================
// PRACTICE/GAME COMPONENTS (Heavy - timers, animations)
// =============================================================================

/**
 * Practice View - Main practice interface
 */
export const LazyPracticeView = dynamic(
    () => import('@/components/practice-view').then(mod => mod.PracticeView),
    {
        loading: () => <LoadingSpinner />,
        ssr: false,
    }
);

/**
 * Placement Test - Initial skill assessment
 */
export const LazyPlacementTest = dynamic(
    () => import('@/components/placement-test').then(mod => mod.PlacementTest),
    {
        loading: () => <LoadingSpinner />,
        ssr: false,
    }
);

/**
 * Mastery Test - Tier advancement test
 */
export const LazyMasteryTest = dynamic(
    () => import('@/components/mastery-test').then(mod => mod.MasteryTest),
    {
        loading: () => <LoadingSpinner />,
        ssr: false,
    }
);

// =============================================================================
// HELPER HOOKS
// =============================================================================

/**
 * Preload a lazy component (call on hover/focus for instant load)
 * 
 * Usage:
 *   onMouseEnter={() => preloadComponent(LazyArenaLeaderboard)}
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Accessing internal Next.js dynamic preload method
export const preloadComponent = (component: any) => {
    if (component?.preload) {
        component.preload();
    }
};
