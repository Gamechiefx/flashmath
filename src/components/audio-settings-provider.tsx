"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface AudioSettingsContextType {
    bgmVolume: number; // 0.0 to 1.0
    sfxVolume: number; // 0.0 to 1.0
    setBGMVolume: (vol: number) => void;
    setSFXVolume: (vol: number) => void;
}

const AudioSettingsContext = createContext<AudioSettingsContextType>({
    bgmVolume: 0.5,
    sfxVolume: 0.5,
    setBGMVolume: () => { },
    setSFXVolume: () => { },
});

export function useAudioSettings() {
    return useContext(AudioSettingsContext);
}

export function AudioSettingsProvider({ children }: { children: React.ReactNode }) {
    const [bgmVolume, setBGMVolumeState] = useState(0.5);
    const [sfxVolume, setSFXVolumeState] = useState(0.5);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const storedBGM = localStorage.getItem("fg_bgm_volume");
        const storedSFX = localStorage.getItem("fg_sfx_volume");

        if (storedBGM) setBGMVolumeState(parseFloat(storedBGM));
        if (storedSFX) setSFXVolumeState(parseFloat(storedSFX));
        setMounted(true);
    }, []);

    const setBGMVolume = (vol: number) => {
        setBGMVolumeState(vol);
        localStorage.setItem("fg_bgm_volume", vol.toString());
    };

    const setSFXVolume = (vol: number) => {
        setSFXVolumeState(vol);
        localStorage.setItem("fg_sfx_volume", vol.toString());
    };

    // Prevent hydration mismatch by rendering children only after mount, 
    // or just accept initial state might be different. 
    // For audio it's better to wait for mount to apply correct volume? 
    // Actually, default 0.5 is fine for hydration.

    return (
        <AudioSettingsContext.Provider value={{ bgmVolume, sfxVolume, setBGMVolume, setSFXVolume }}>
            {children}
        </AudioSettingsContext.Provider>
    );
}
