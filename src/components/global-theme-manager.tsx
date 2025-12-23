"use client";

import { useEffect } from "react";
import { Item, ItemType, ITEMS } from "@/lib/items";

interface GlobalThemeManagerProps {
    equippedItems: Record<string, string>;
}

import { soundEngine } from "@/lib/sound-engine";

import { BGMPlayer } from "./effects/bgm-player";
import { ParticleEffects } from "./effects/particle-effects";
import { Starfield } from "./effects/starfield";
import { useItemPreview } from "./item-preview-provider";

export function GlobalThemeManager({ equippedItems }: GlobalThemeManagerProps) {
    useEffect(() => {
        const root = document.documentElement;

        // Apply Theme
        const themeId = equippedItems[ItemType.THEME];
        const themeItem = ITEMS.find(i => i.id === themeId);

        // Reset classes
        root.classList.remove('theme-caution', 'theme-matrix', 'theme-synthwave', 'theme-deep-space');

        if (themeItem && themeItem.type === ItemType.THEME) {
            if (themeItem.assetValue !== 'default') {
                root.classList.add(themeItem.assetValue);
            }
        }

        // Apply Font
        const fontId = equippedItems[ItemType.FONT];
        const fontItem = ITEMS.find(i => i.id === fontId);
        if (fontItem && fontItem.type === ItemType.FONT) {
            root.style.setProperty('--font-primary', fontItem.assetValue);

            // Special scaling for retro font - Apply to BODY to preserve REM layout
            if (fontItem.id === 'font_press_start') {
                document.body.style.fontSize = '0.75em'; // Scale text down
                document.body.style.lineHeight = '1.8';
            } else {
                document.body.style.fontSize = '';
                document.body.style.lineHeight = '';
            }
        } else {
            root.style.removeProperty('--font-primary');
            document.body.style.fontSize = '';
            document.body.style.lineHeight = '';
        }

        // Apply Sound Pack
        const soundId = equippedItems[ItemType.SOUND];
        const soundItem = ITEMS.find(i => i.id === soundId);
        if (soundItem && soundItem.type === ItemType.SOUND) {
            soundEngine.setPack(soundItem.assetValue);
        }

    }, [equippedItems]);



    // ... inside GlobalThemeManager ...
    const { previewItem, previewRect } = useItemPreview();

    // Particle Type
    let particleId = equippedItems[ItemType.PARTICLE] || 'default';

    // BGM Asset Path
    const bgmId = equippedItems[ItemType.BGM];
    const bgmItem = ITEMS.find(i => i.id === bgmId);
    let bgmSrc = (bgmItem && bgmItem.type === ItemType.BGM) ? bgmItem.assetValue : 'default';

    // Sound Pack
    const soundId = equippedItems[ItemType.SOUND];
    const soundItem = ITEMS.find(i => i.id === soundId);
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
