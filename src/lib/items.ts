/* eslint-disable @typescript-eslint/no-explicit-any -- Icon components use any types */

import { Divide, Hexagon, Keyboard, MousePointerClick, Music, Sparkles, Type, Monitor, Shield, Trophy, Crown, Flame, Zap, Crosshair } from 'lucide-react';

export enum ItemType {
    THEME = 'theme',
    PARTICLE = 'particle',
    FONT = 'font',
    SOUND = 'sound',
    BGM = 'bgm',
    TITLE = 'title',
    FRAME = 'frame',
    BANNER = 'banner'
}

export enum Rarity {
    COMMON = 'common',
    UNCOMMON = 'uncommon',
    RARE = 'rare',
    EPIC = 'epic',
    LEGENDARY = 'legendary'
}

export interface Item {
    id: string;
    name: string;
    description: string;
    type: ItemType;
    rarity: Rarity;
    price: number;
    // For Themes/Frames/Particles, this might be a CSS class or asset path
    // For Audio, this is a file path
    assetValue: string;
    icon?: any; // Lucide icon for UI listing
}

export const RARITY_COLORS = {
    [Rarity.COMMON]: "text-slate-400 border-slate-400/20 bg-slate-400/5",
    [Rarity.UNCOMMON]: "text-green-400 border-green-400/20 bg-green-400/5",
    [Rarity.RARE]: "text-blue-400 border-blue-400/20 bg-blue-400/5",
    [Rarity.EPIC]: "text-purple-400 border-purple-400/20 bg-purple-400/5",
    [Rarity.LEGENDARY]: "text-amber-400 border-amber-400/20 bg-amber-400/5",
};

export const ITEMS: Item[] = [
    // --- 1. System Themes ---
    {
        id: 'theme_caution',
        name: 'Caution',
        description: 'Industrial yellow and black hazard stripes.',
        type: ItemType.THEME,
        rarity: Rarity.UNCOMMON,
        price: 500,
        assetValue: 'theme-caution',
        icon: Shield
    },
    {
        id: 'theme_matrix',
        name: 'The Matrix',
        description: 'Old-school terminal green text on black.',
        type: ItemType.THEME,
        rarity: Rarity.RARE,
        price: 2500,
        assetValue: 'theme-matrix',
        icon: Monitor
    },
    {
        id: 'theme_synthwave',
        name: 'Synthwave',
        description: 'Hot pink and cyan neon gradients.',
        type: ItemType.THEME,
        rarity: Rarity.EPIC,
        price: 10000,
        assetValue: 'theme-synthwave',
        icon: Zap
    },
    {
        id: 'theme_deep_space',
        name: 'Deep Space',
        description: 'OLED black with subtle white stars.',
        type: ItemType.THEME,
        rarity: Rarity.LEGENDARY,
        price: 50000,
        assetValue: 'theme-deep-space',
        icon: Hexagon
    },
    {
        id: 'theme_red_alert',
        name: 'Red Alert',
        description: 'Empire vibes. Deep reds and smooth blacks.',
        type: ItemType.THEME,
        rarity: Rarity.UNCOMMON,
        price: 750,
        assetValue: 'theme-red-alert',
        icon: Shield
    },
    {
        id: 'theme_ice_cold',
        name: 'Ice Cold',
        description: 'Stay frosty. Cool blues and whites.',
        type: ItemType.THEME,
        rarity: Rarity.RARE,
        price: 3000,
        assetValue: 'theme-ice-cold',
        icon: Hexagon
    },
    {
        id: 'theme_sunset_drive',
        name: 'Sunset Drive',
        description: 'Cruising down the grid. Purple to Orange.',
        type: ItemType.THEME,
        rarity: Rarity.EPIC,
        price: 15000,
        assetValue: 'theme-sunset-drive',
        icon: Zap
    },

    // --- 2. Particle Effects ---
    {
        id: 'particle_sparks',
        name: 'Sparks',
        description: 'Digital sparks fly off the cursor on type.',
        type: ItemType.PARTICLE,
        rarity: Rarity.RARE,
        price: 2000,
        assetValue: 'particle-sparks',
        icon: Sparkles
    },
    {
        id: 'particle_glitch',
        name: 'Glitch',
        description: 'Screen glitches briefly on combos.',
        type: ItemType.PARTICLE,
        rarity: Rarity.LEGENDARY,
        price: 35000,
        assetValue: 'particle-glitch',
        icon: Zap
    },
    {
        id: 'particle_binary',
        name: 'Binary Rain',
        description: 'The code falls... waiting to be decrypted.',
        type: ItemType.PARTICLE,
        rarity: Rarity.RARE,
        price: 2500,
        assetValue: 'particle-binary',
        icon: Monitor
    },
    {
        id: 'particle_explosion',
        name: 'Comic Boom',
        description: 'POW! Tiny explosions on every combo.',
        type: ItemType.PARTICLE,
        rarity: Rarity.EPIC,
        price: 12000,
        assetValue: 'particle-explosion',
        icon: Flame
    },
    {
        id: 'particle_vortex',
        name: 'Vortex',
        description: 'A swirling portal consumes the numbers.',
        type: ItemType.PARTICLE,
        rarity: Rarity.LEGENDARY,
        price: 45000,
        assetValue: 'particle-vortex',
        icon: Sparkles
    },

    // --- 3. Fonts ---
    {
        id: 'font_press_start',
        name: 'Press Start 2P',
        description: 'Retro arcade pixel font.',
        type: ItemType.FONT,
        rarity: Rarity.EPIC,
        price: 8000,
        assetValue: '"Press Start 2P", monospace',
        icon: Type
    },

    // --- 4. Switch Emulators (Sounds) ---
    {
        id: 'sound_clicky',
        name: 'Mech-Clicky',
        description: 'Loud, satisfying Cherry MX Blue clicks.',
        type: ItemType.SOUND,
        rarity: Rarity.UNCOMMON,
        price: 400,
        assetValue: '/sounds/mech-click.mp3',
        icon: Keyboard
    },
    {
        id: 'sound_silencer',
        name: 'Silencer',
        description: 'Soft, thocky, muted sounds.',
        type: ItemType.SOUND,
        rarity: Rarity.RARE,
        price: 1500,
        assetValue: '/sounds/silencer.mp3',
        icon: Keyboard
    },
    {
        id: 'sound_scifi',
        name: 'Sci-Fi',
        description: 'Computer blips and chirps (LCARS style).',
        type: ItemType.SOUND,
        rarity: Rarity.EPIC,
        price: 9000,
        assetValue: '/sounds/scifi.mp3',
        icon: Monitor
    },
    {
        id: 'sound_typewriter',
        name: 'Typewriter',
        description: 'Classic heavy mechanical clack.',
        type: ItemType.SOUND,
        rarity: Rarity.UNCOMMON,
        price: 800,
        assetValue: '/sounds/typewriter.mp3',
        icon: Keyboard
    },
    {
        id: 'sound_8bit',
        name: '8-Bit Zap',
        description: 'Retro jump sounds for every key.',
        type: ItemType.SOUND,
        rarity: Rarity.RARE,
        price: 4000,
        assetValue: '/sounds/8bit.mp3',
        icon: Zap
    },

    // --- 5. BGM Loops ---
    {
        id: 'bgm_lofi',
        name: 'Lo-Fi Beats',
        description: 'Chill beats to study math to.',
        type: ItemType.BGM,
        rarity: Rarity.RARE,
        price: 2000,
        assetValue: '/music/bgm_cozy_lofi.mp3',
        icon: Music
    },
    {
        id: 'bgm_darksynth',
        name: 'Dark Synth',
        description: 'Aggressive, fast-paced electronic.',
        type: ItemType.BGM,
        rarity: Rarity.RARE,
        price: 2000,
        assetValue: '/music/bgm_synth_motivation.mp3',
        icon: Music
    },
    {
        id: 'bgm_binaural',
        name: 'Neon Horizon',
        description: 'Chill synthwave melodies.',
        type: ItemType.BGM,
        rarity: Rarity.EPIC,
        price: 8500,
        assetValue: '/music/bgm_deep_space.mp3',
        icon: Music
    },

    // --- 6. Pilot Tags (Titles) ---
    { id: 'title_high_scorer', name: 'The High Scorer', description: '', type: ItemType.TITLE, rarity: Rarity.COMMON, price: 50, assetValue: 'The High Scorer', icon: Divide },
    { id: 'title_just_fun', name: 'Just Here For Fun', description: '', type: ItemType.TITLE, rarity: Rarity.COMMON, price: 50, assetValue: 'Just Here For Fun', icon: Divide },

    { id: 'title_fast_fingers', name: 'Certified Fast Fingers', description: '', type: ItemType.TITLE, rarity: Rarity.UNCOMMON, price: 300, assetValue: 'Certified Fast Fingers', icon: Zap },
    { id: 'title_accuracy_ace', name: 'Accuracy Ace', description: '', type: ItemType.TITLE, rarity: Rarity.UNCOMMON, price: 300, assetValue: 'Accuracy Ace', icon: Crosshair },

    { id: 'title_wizard', name: 'Keyboard Wizard', description: '', type: ItemType.TITLE, rarity: Rarity.RARE, price: 1500, assetValue: 'Keyboard Wizard', icon: Sparkles },
    { id: 'title_turbo', name: 'Turbo Typer', description: '', type: ItemType.TITLE, rarity: Rarity.RARE, price: 1500, assetValue: 'Turbo Typer', icon: Flame },

    { id: 'title_zen', name: 'Zen Master', description: '', type: ItemType.TITLE, rarity: Rarity.EPIC, price: 8000, assetValue: 'Zen Master', icon: Crown },

    { id: 'title_unstoppable', name: 'The Unstoppable', description: '', type: ItemType.TITLE, rarity: Rarity.LEGENDARY, price: 30000, assetValue: 'The Unstoppable', icon: Trophy },
    { id: 'title_pinnacle', name: 'The Pinnacle', description: '', type: ItemType.TITLE, rarity: Rarity.LEGENDARY, price: 50000, assetValue: 'The Pinnacle', icon: Trophy },
    { id: 'title_human_calc', name: 'Human Calculator', description: '', type: ItemType.TITLE, rarity: Rarity.EPIC, price: 10000, assetValue: 'Human Calculator', icon: Monitor },

    // --- 6b. Achievement Titles (Earned, not purchasable) ---
    { id: 'title_newbie', name: 'The Newbie', description: 'Achievement reward', type: ItemType.TITLE, rarity: Rarity.COMMON, price: 0, assetValue: 'The Newbie', icon: Trophy },
    { id: 'title_rising_star', name: 'Rising Star', description: 'Achievement reward', type: ItemType.TITLE, rarity: Rarity.UNCOMMON, price: 0, assetValue: 'Rising Star', icon: Trophy },
    { id: 'title_halfway_hero', name: 'Halfway Hero', description: 'Achievement reward', type: ItemType.TITLE, rarity: Rarity.RARE, price: 0, assetValue: 'Halfway Hero', icon: Crown },
    { id: 'title_elite_pilot', name: 'Elite Pilot', description: 'Achievement reward', type: ItemType.TITLE, rarity: Rarity.EPIC, price: 0, assetValue: 'Elite Pilot', icon: Crown },
    { id: 'title_legendary', name: 'Legendary', description: 'Achievement reward', type: ItemType.TITLE, rarity: Rarity.LEGENDARY, price: 0, assetValue: 'Legendary', icon: Crown },
    { id: 'title_streak_master', name: 'Streak Master', description: 'Achievement reward', type: ItemType.TITLE, rarity: Rarity.RARE, price: 0, assetValue: 'Streak Master', icon: Flame },
    { id: 'title_speed_demon', name: 'Speed Demon', description: 'Achievement reward', type: ItemType.TITLE, rarity: Rarity.RARE, price: 0, assetValue: 'Speed Demon', icon: Zap },
    { id: 'title_the_flash', name: 'The Flash', description: 'Achievement reward', type: ItemType.TITLE, rarity: Rarity.EPIC, price: 0, assetValue: 'The Flash', icon: Zap },
    { id: 'title_addition_ace', name: 'Addition Ace', description: 'Achievement reward', type: ItemType.TITLE, rarity: Rarity.RARE, price: 0, assetValue: 'Addition Ace', icon: Trophy },
    { id: 'title_subtraction_specialist', name: 'Subtraction Specialist', description: 'Achievement reward', type: ItemType.TITLE, rarity: Rarity.RARE, price: 0, assetValue: 'Subtraction Specialist', icon: Trophy },
    { id: 'title_multiplication_master', name: 'Multiplication Master', description: 'Achievement reward', type: ItemType.TITLE, rarity: Rarity.RARE, price: 0, assetValue: 'Multiplication Master', icon: Trophy },
    { id: 'title_division_dominator', name: 'Division Dominator', description: 'Achievement reward', type: ItemType.TITLE, rarity: Rarity.RARE, price: 0, assetValue: 'Division Dominator', icon: Trophy },
    { id: 'title_math_wizard', name: 'Math Wizard', description: 'Achievement reward', type: ItemType.TITLE, rarity: Rarity.LEGENDARY, price: 0, assetValue: 'Math Wizard', icon: Crown },
    { id: 'title_math_tryhard', name: 'The Math TryHard', description: 'Achievement reward', type: ItemType.TITLE, rarity: Rarity.LEGENDARY, price: 0, assetValue: 'The Math TryHard', icon: Crown },
    { id: 'title_wealthy_one', name: 'Wealthy One', description: 'Achievement reward', type: ItemType.TITLE, rarity: Rarity.EPIC, price: 0, assetValue: 'Wealthy One', icon: Crown },
    { id: 'title_lofi_lyricist', name: 'Lo-Fi Lyricist', description: 'Achievement reward', type: ItemType.TITLE, rarity: Rarity.RARE, price: 0, assetValue: 'Lo-Fi Lyricist', icon: Music },

    // --- 7. Avatar Frames ---
    { id: 'frame_bronze', name: 'The Bronze Border', description: 'Simple, sturdy bronze.', type: ItemType.FRAME, rarity: Rarity.COMMON, price: 100, assetValue: 'frame-bronze', icon: Shield },
    { id: 'frame_circuit', name: 'Circuit Frame', description: 'Green PCB traces.', type: ItemType.FRAME, rarity: Rarity.UNCOMMON, price: 500, assetValue: 'frame-circuit', icon: Monitor },
    { id: 'frame_camo', name: 'Digital Camo', description: 'Pixelated military vibes.', type: ItemType.FRAME, rarity: Rarity.UNCOMMON, price: 500, assetValue: 'frame-camo', icon: Shield },
    { id: 'frame_glitch_ring', name: 'Animated Glitch Ring', description: 'Unstable reality.', type: ItemType.FRAME, rarity: Rarity.EPIC, price: 12000, assetValue: 'frame-glitch', icon: Zap },
    { id: 'frame_gold_hex', name: 'Golden Hexagon', description: 'Pure luxury.', type: ItemType.FRAME, rarity: Rarity.LEGENDARY, price: 40000, assetValue: 'frame-gold-hex', icon: Hexagon },
    { id: 'frame_nebula', name: 'Cosmic Nebula', description: 'Starlight in a frame.', type: ItemType.FRAME, rarity: Rarity.LEGENDARY, price: 45000, assetValue: 'frame-nebula', icon: Sparkles },
    { id: 'frame_wanted', name: 'Wanted Poster', description: 'Reward: 1,000,000 Flux.', type: ItemType.FRAME, rarity: Rarity.UNCOMMON, price: 1000, assetValue: 'frame-wanted', icon: Shield },
    { id: 'frame_hologram', name: 'Hologram', description: 'Unstable photonic containment.', type: ItemType.FRAME, rarity: Rarity.RARE, price: 5000, assetValue: 'frame-hologram', icon: Monitor },
    { id: 'frame_rainbow', name: 'Rainbow Glitch', description: 'Taste the spectrum error.', type: ItemType.FRAME, rarity: Rarity.EPIC, price: 20000, assetValue: 'frame-rainbow', icon: Zap },
    { id: 'frame_diamond', name: 'Diamond', description: 'Indestructible brilliance.', type: ItemType.FRAME, rarity: Rarity.LEGENDARY, price: 60000, assetValue: 'frame-diamond', icon: Hexagon },

    // --- 8. Arena Banners ---
    { id: 'banner_caution', name: 'Caution High Math', description: 'Animated amber hazard stripes.', type: ItemType.BANNER, rarity: Rarity.UNCOMMON, price: 500, assetValue: 'caution', icon: Shield },
    { id: 'banner_matrices', name: 'System Override', description: 'Matrix rain dots falling.', type: ItemType.BANNER, rarity: Rarity.RARE, price: 2500, assetValue: 'matrices', icon: Monitor },
    { id: 'banner_synthwave', name: 'Retro Pulse', description: 'Neon scan lines sweep.', type: ItemType.BANNER, rarity: Rarity.EPIC, price: 10000, assetValue: 'synthwave', icon: Zap },
    { id: 'banner_royal', name: 'The King', description: 'Subtle royal shimmer.', type: ItemType.BANNER, rarity: Rarity.EPIC, price: 15000, assetValue: 'royal', icon: Crown },
    { id: 'banner_legendary', name: 'Grand Champion', description: 'Golden sparkle particles.', type: ItemType.BANNER, rarity: Rarity.LEGENDARY, price: 50000, assetValue: 'legendary', icon: Trophy },
    { id: 'banner_plasma', name: 'Plasma Core', description: 'Pulsing gradient wave.', type: ItemType.BANNER, rarity: Rarity.LEGENDARY, price: 60000, assetValue: 'plasma', icon: Flame },
];

// ============================================================================
// Helper functions for resolving item IDs to display values
// ============================================================================

/**
 * Look up an item's assetValue from its ID
 * e.g., "banner_caution" -> "caution", "title_unstoppable" -> "The Unstoppable"
 */
export function getItemAssetValue(itemId: string | undefined | null, fallback: string = 'default'): string {
    if (!itemId) return fallback;

    const item = ITEMS.find(i => i.id === itemId);
    if (item) {
        return item.assetValue;
    }

    // If not found and it looks like an ID with a prefix, try to extract just the suffix
    // This handles cases where the assetValue might have been stored directly
    if (itemId.includes('_')) {
        const parts = itemId.split('_');
        parts.shift(); // Remove the type prefix (banner, title, etc.)
        return parts.join('_') || fallback;
    }

    return itemId; // Return as-is if it might already be an assetValue
}

/**
 * Get the display name for a title ID
 * e.g., "title_unstoppable" -> "The Unstoppable"
 */
export function getTitleDisplayName(titleId: string | undefined | null): string {
    if (!titleId || titleId === 'default') return 'FlashMath Competitor';

    const item = ITEMS.find(i => i.id === titleId && i.type === ItemType.TITLE);
    if (item) {
        return item.assetValue; // assetValue is the display name for titles
    }

    // If not found, check if it's already a display name (no underscore prefix)
    if (!titleId.startsWith('title_')) {
        return titleId;
    }

    // Fallback: convert ID to readable format
    // e.g., "title_unstoppable" -> "Unstoppable"
    const parts = titleId.replace('title_', '').split('_');
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/**
 * Get the banner assetValue from a banner ID
 * e.g., "banner_caution" -> "caution"
 */
export function getBannerAssetValue(bannerId: string | undefined | null): string {
    if (!bannerId || bannerId === 'default') return 'default';

    const item = ITEMS.find(i => i.id === bannerId && i.type === ItemType.BANNER);
    if (item) {
        return item.assetValue;
    }

    // If not found, check if it already looks like an assetValue (no prefix)
    if (!bannerId.startsWith('banner_')) {
        return bannerId;
    }

    // Fallback: strip the prefix
    return bannerId.replace('banner_', '');
}
