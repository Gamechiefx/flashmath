"use client";

import { useEffect } from "react";
import { Item, ItemType, ITEMS } from "@/lib/items";

interface GlobalThemeManagerProps {
    equippedItems: Record<string, string>;
    availableItems?: Item[];
}

import { soundEngine } from "@/lib/sound-engine";

import { BGMPlayer } from "./effects/bgm-player";
import { ParticleEffects } from "./effects/particle-effects";
import { Starfield } from "./effects/starfield";
import { useItemPreview } from "./item-preview-provider";
import { useAudioSettings } from "./audio-settings-provider";

export function GlobalThemeManager({ equippedItems, availableItems = ITEMS }: GlobalThemeManagerProps) {
    const { sfxVolume } = useAudioSettings();

    // Sync SFX Volume
    useEffect(() => {
        soundEngine.setVolume(sfxVolume);
    }, [sfxVolume]);

    useEffect(() => {
        const root = document.documentElement;

        // Apply Theme
        const themeId = equippedItems[ItemType.THEME];
        const themeItem = availableItems.find(i => i.id === themeId);

        // Reset classes
        root.classList.remove(
            'theme-caution', 'theme-matrix', 'theme-synthwave', 'theme-deep-space',
            'theme-red-alert', 'theme-ice-cold', 'theme-sunset-drive'
        );

        if (themeItem && themeItem.type === ItemType.THEME) {
            if (themeItem.assetValue !== 'default') {
                root.classList.add(themeItem.assetValue);
            }
        }

        // Apply Font
        const fontId = equippedItems[ItemType.FONT];
        const fontItem = availableItems.find(i => i.id === fontId);
        if (fontItem && fontItem.type === ItemType.FONT) {
            root.style.setProperty('--font-primary', fontItem.assetValue);

            // Special scaling for retro font - Apply to BODY to preserve REM layout
            if (fontItem.id === 'font_press_start') {
                root.style.setProperty('--font-pref', 'retro');
                root.style.setProperty('--hero-size-mobile', '2.25rem'); // text-4xl
                root.style.setProperty('--hero-size-desktop', '3rem'); // text-5xl
                document.body.style.fontSize = '0.6em';
                document.body.style.lineHeight = '2.0';
            } else {
                root.style.setProperty('--font-pref', 'default');
                root.style.setProperty('--hero-size-mobile', '3.75rem'); // text-6xl
                root.style.setProperty('--hero-size-desktop', '6rem'); // text-8xl
                document.body.style.fontSize = '';
                document.body.style.lineHeight = '';
            }
        } else {
            root.style.removeProperty('--font-primary');
            root.style.setProperty('--font-pref', 'default');
            root.style.setProperty('--hero-size-mobile', '3.75rem'); // text-6xl (ensure defaults)
            root.style.setProperty('--hero-size-desktop', '6rem'); // text-8xl
            document.body.style.fontSize = '';
            document.body.style.lineHeight = '';
        }

        // Apply Sound Pack
        const soundId = equippedItems[ItemType.SOUND];
        const soundItem = availableItems.find(i => i.id === soundId);
        if (soundItem && soundItem.type === ItemType.SOUND) {
            soundEngine.setPack(soundItem.assetValue);
        }

    }, [equippedItems, availableItems]);



    // ... inside GlobalThemeManager ...
    const { previewItem, previewRect } = useItemPreview();

    // Particle Type
    let particleId = equippedItems[ItemType.PARTICLE] || 'default';

    // BGM Asset Path
    const bgmId = equippedItems[ItemType.BGM];
    const bgmItem = availableItems.find(i => i.id === bgmId);
    let bgmSrc = (bgmItem && bgmItem.type === ItemType.BGM) ? bgmItem.assetValue : 'default';

    // Sound Pack
    const soundId = equippedItems[ItemType.SOUND];
    const soundItem = availableItems.find(i => i.id === soundId);
    let soundPack = (soundItem && soundItem.type === ItemType.SOUND) ? soundItem.assetValue : 'default';

    // PREVIEW OVERRIDES
    if (previewItem) {
        if (previewItem.type === ItemType.BGM) {
            bgmSrc = previewItem.assetValue;
        }
        if (previewItem.type === ItemType.PARTICLE) {
            particleId = previewItem.id;
        }
        if (previewItem.type === ItemType.SOUND) {
            soundPack = previewItem.assetValue;
        }
    }

    // Apply Sound Pack (Preview or Equipped)
    useEffect(() => {
        soundEngine.setPack(soundPack);

        // If it's a preview interaction, play a test click
        if (previewItem && previewItem.type === ItemType.SOUND) {
            // Small delay to ensure pack loads? 
            // SoundEngine might be async. 
            // For now, fire and hope.
            setTimeout(() => soundEngine.playCorrect(0), 100);
        }
    }, [soundPack, previewItem]);

    // Theme Background Logic
    const isDeepSpace = equippedItems[ItemType.THEME] === 'theme_deep_space';

    return (
        <>
            <BGMPlayer src={bgmSrc} enabled={true} />
            <ParticleEffects effectType={particleId} previewRect={previewItem ? previewRect : null} />
            {isDeepSpace && <Starfield />}
        </>
    );
}
