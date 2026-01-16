"use client";

/**
 * Sound types that can be customized with audio files
 */
export type SoundType =
    | 'correct'
    | 'incorrect'
    | 'victory'
    | 'defeat'
    | 'relay_handoff'
    | 'your_turn'
    | 'teammate_correct'
    | 'timeout'
    | 'double_callin'
    | 'round_end'
    | 'halftime'
    | 'streak_3'
    | 'streak_5'
    | 'streak_10'
    | 'countdown_tick'
    | 'countdown_urgent'
    | 'go';

/**
 * Sound pack configuration
 * Place audio files in /public/sounds/[pack-name]/[sound-type].mp3
 *
 * Example structure:
 * /public/sounds/
 *   ├── esports/
 *   │   ├── correct.mp3
 *   │   ├── incorrect.mp3
 *   │   ├── victory.mp3
 *   │   ├── your_turn.mp3
 *   │   ├── go.mp3
 *   │   └── ...
 *   ├── retro/
 *   │   ├── correct.mp3
 *   │   └── ...
 *   └── minimal/
 *       └── ...
 */
export interface SoundPackConfig {
    /** Pack identifier (matches folder name) */
    id: string;
    /** Display name */
    name: string;
    /** Which sounds have custom files (others fall back to procedural) */
    customSounds: SoundType[];
    /** Volume multiplier for this pack */
    volumeMultiplier?: number;
}

// Registered sound packs with file-based sounds
const SOUND_PACKS: Record<string, SoundPackConfig> = {
    // Example packs - add your own here when you have audio files
    // 'esports': {
    //     id: 'esports',
    //     name: 'Esports Pro',
    //     customSounds: ['correct', 'incorrect', 'victory', 'defeat', 'your_turn', 'go', 'countdown_tick', 'countdown_urgent'],
    //     volumeMultiplier: 1.0,
    // },
    // 'retro': {
    //     id: 'retro',
    //     name: 'Retro Arcade',
    //     customSounds: ['correct', 'incorrect', 'victory', 'streak_3', 'streak_5', 'streak_10'],
    //     volumeMultiplier: 0.8,
    // },
};

class SoundEngine {
    private ctx: AudioContext | null = null;
    private enabled: boolean = true;

    // Audio buffer cache for file-based sounds
    private audioCache: Map<string, AudioBuffer> = new Map();
    private loadingPromises: Map<string, Promise<AudioBuffer | null>> = new Map();
    
    // Track which ambient music should be playing (for resuming when sound is re-enabled)
    private desiredAmbientMusic: 'arenaEntrance' | 'queue' | 'strategy' | 'match' | 'halftime' | null = null;

    constructor() {
        if (typeof window !== 'undefined') {
            this.enabled = localStorage.getItem('sound_enabled') !== 'false';
        }
    }

    private init() {
        if (!this.ctx) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- webkitAudioContext is not in TypeScript types
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
    
    // Async version of init that waits for AudioContext to resume
    // Use this when enabling sound from a user gesture to ensure context is ready
    private async initAsync(): Promise<boolean> {
        if (!this.ctx) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- webkitAudioContext is not in TypeScript types
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            try {
                await this.ctx.resume();
                return true;
            } catch (_e) {
                console.error('[SoundEngine] Failed to resume AudioContext:', e);
                return false;
            }
        }
        return true;
    }

    setEnabled(enabled: boolean) {
        this.enabled = enabled;
        localStorage.setItem('sound_enabled', enabled ? 'true' : 'false');
        
        // When disabling sound, stop all currently playing music immediately
        // BUT preserve the desiredAmbientMusic tracker so we can resume when re-enabled
        if (!enabled) {
            const savedDesiredMusic = this.desiredAmbientMusic;
            this.stopAllPhaseMusic(0);
            this.stopArenaEntranceMusic(0);
            this.stopBGM();
            // Restore the tracker - we still want to resume this music when re-enabled
            this.desiredAmbientMusic = savedDesiredMusic;
        } else {
            // When re-enabling sound, we need to resume the AudioContext first (async)
            // This is called from a user gesture (click), so resume should work
            this.resumeAmbientMusic();
        }
    }
    
    // Resume the appropriate ambient music after re-enabling sound
    // This properly awaits AudioContext resume before playing
    private async resumeAmbientMusic() {
        if (!this.desiredAmbientMusic) return;
        
        // First, ensure AudioContext is resumed (we have a user gesture from the toggle click)
        const ready = await this.initAsync();
        if (!ready) return;
        
        // Now play the appropriate music
        switch (this.desiredAmbientMusic) {
            case 'arenaEntrance':
                this.playArenaEntranceMusic();
                break;
            case 'queue':
                this.playQueueMusic();
                break;
            case 'strategy':
                this.playStrategyMusic();
                break;
            case 'match':
                this.playMatchMusic();
                break;
            case 'halftime':
                this.playHalftimeMusic();
                break;
        }
    }

    isEnabled() {
        return this.enabled;
    }

    private volume: number = 0.5;

    setVolume(vol: number) {
        this.volume = vol;
    }

    private pack: string = 'default';

    setPack(assetValue: string) {
        this.pack = assetValue;
        // Preload sounds for file-based packs
        this.preloadPackSounds(assetValue);
    }

    // ========== FILE-BASED SOUND SUPPORT ==========

    /**
     * Get the current pack config if it's a file-based pack
     */
    private getPackConfig(): SoundPackConfig | null {
        return SOUND_PACKS[this.pack] || null;
    }

    /**
     * Check if a sound type has a custom audio file for the current pack
     */
    private hasCustomSound(soundType: SoundType): boolean {
        const config = this.getPackConfig();
        return config?.customSounds.includes(soundType) ?? false;
    }

    /**
     * Get the audio file path for a sound
     */
    private getSoundPath(soundType: SoundType): string {
        return `/sounds/${this.pack}/${soundType}.mp3`;
    }

    /**
     * Load an audio file and cache it
     */
    private async loadSound(soundType: SoundType): Promise<AudioBuffer | null> {
        const path = this.getSoundPath(soundType);

        // Check cache first
        if (this.audioCache.has(path)) {
            return this.audioCache.get(path)!;
        }

        // Check if already loading
        if (this.loadingPromises.has(path)) {
            return this.loadingPromises.get(path)!;
        }

        // Start loading
        const loadPromise = (async () => {
            try {
                this.init();
                if (!this.ctx) return null;

                const response = await fetch(path);
                if (!response.ok) {
                    console.warn(`[SoundEngine] Sound file not found: ${path}`);
                    return null;
                }

                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

                this.audioCache.set(path, audioBuffer);
                return audioBuffer;
            } catch (_e) {
                console.warn(`[SoundEngine] Failed to load sound: ${path}`, e);
                return null;
            } finally {
                this.loadingPromises.delete(path);
            }
        })();

        this.loadingPromises.set(path, loadPromise);
        return loadPromise;
    }

    /**
     * Preload all sounds for a pack
     */
    private async preloadPackSounds(packId: string): Promise<void> {
        const config = SOUND_PACKS[packId];
        if (!config) return;

        console.log(`[SoundEngine] Preloading sounds for pack: ${packId}`);

        // Load all custom sounds in parallel
        await Promise.all(
            config.customSounds.map(soundType => this.loadSound(soundType))
        );
    }

    /**
     * Play a cached audio buffer
     */
    private playBuffer(buffer: AudioBuffer, volumeMultiplier: number = 1): void {
        if (!this.ctx) return;

        const source = this.ctx.createBufferSource();
        const gainNode = this.ctx.createGain();

        source.buffer = buffer;

        const packConfig = this.getPackConfig();
        const packVol = packConfig?.volumeMultiplier ?? 1;
        gainNode.gain.value = this.volume * volumeMultiplier * packVol;

        source.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        source.start(0);
    }

    /**
     * Try to play a file-based sound, returns true if successful
     * Returns false if no custom sound exists (caller should use procedural fallback)
     */
    private async tryPlayFileSound(soundType: SoundType, volumeMultiplier: number = 1): Promise<boolean> {
        if (!this.hasCustomSound(soundType)) {
            return false;
        }

        const buffer = await this.loadSound(soundType);
        if (!buffer) {
            return false;
        }

        this.init();
        this.playBuffer(buffer, volumeMultiplier);
        return true;
    }

    /**
     * Play a sound - tries file-based first, falls back to procedural
     * This is the main method for playing sounds with file support
     */
    private async playSoundWithFallback(
        soundType: SoundType,
        proceduralFallback: () => void,
        volumeMultiplier: number = 1
    ): Promise<void> {
        // Try file-based sound first
        const played = await this.tryPlayFileSound(soundType, volumeMultiplier);

        // If no file or failed, use procedural
        if (!played) {
            proceduralFallback();
        }
    }

    /**
     * Synchronous version - plays file if cached, otherwise procedural
     * Use this for latency-sensitive sounds
     */
    private playSoundSync(soundType: SoundType, proceduralFallback: () => void): void {
        const path = this.getSoundPath(soundType);
        const buffer = this.audioCache.get(path);

        if (buffer && this.hasCustomSound(soundType)) {
            this.init();
            this.playBuffer(buffer);
        } else {
            proceduralFallback();
        }
    }

    // Helper to get oscillator type based on pack
    private getPackOscType(): OscillatorType {
        if (this.pack.includes('mech')) return 'square';
        if (this.pack.includes('scifi')) return 'sawtooth';
        if (this.pack.includes('8bit')) return 'square';
        return 'sine';
    }

    // Helper to get volume multiplier based on pack
    private getPackVolume(): number {
        if (this.pack.includes('silencer')) return 0.3;
        return 1.0;
    }

    // Helper to check if pack uses low-freq mechanical sounds
    private isTypewriterPack(): boolean {
        return this.pack.includes('typewriter');
    }

    // Helper to check if pack uses retro 8-bit style
    private is8BitPack(): boolean {
        return this.pack.includes('8bit');
    }

    playCorrect(streak: number = 0) {
        if (!this.enabled) return;

        // Try file-based sound first (synchronous for low latency)
        this.playSoundSync('correct', () => this._playCorrectProcedural(streak));
    }

    private _playCorrectProcedural(streak: number = 0) {
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Pack Logic
        let type: OscillatorType = 'sine';
        if (this.pack.includes('mech')) type = 'square'; // Clicky
        if (this.pack.includes('scifi')) type = 'sawtooth'; // Sci-Fi

        osc.type = type;

        // Frequency Logic (Scale)
        const scale = [0, 2, 4, 7, 9, 12, 14, 16];
        const noteIndex = Math.min(streak, scale.length - 1);
        const baseFreq = this.pack.includes('scifi') ? 880 : 523.25;
        const freq = baseFreq * Math.pow(2, scale[noteIndex] / 12);

        osc.frequency.setValueAtTime(freq, now);

        if (this.pack.includes('silencer')) {
            // Muted/soft
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.05 * this.volume, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.1);
        } else if (this.pack.includes('typewriter')) {
            // Heavy mechanical CLACK
            osc.frequency.setValueAtTime(100 + Math.random() * 50, now); // Low thud
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.3 * this.volume, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.08);
        } else if (this.pack.includes('8bit')) {
            // Retro Jump/Coin
            osc.type = 'square';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.linearRampToValueAtTime(880, now + 0.1); // Slide up
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.1 * this.volume, now + 0.01);
            gain.gain.linearRampToValueAtTime(0, now + 0.1);
        } else {
            // Normal / SciFi / Mech
            osc.frequency.exponentialRampToValueAtTime(freq * 1.05, now + 0.05); // slight chirp
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.15 * this.volume, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.15);
        }

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.2);
    }

    playIncorrect() {
        if (!this.enabled) return;

        // Try file-based sound first
        this.playSoundSync('incorrect', () => this._playIncorrectProcedural());
    }

    private _playIncorrectProcedural() {
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1 * this.volume, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.2);
    }

    playComplete() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const chord = [523.25, 659.25, 783.99, 1046.50]; // C Major

        chord.forEach((freq, i) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.05);

            gain.gain.setValueAtTime(0, now + i * 0.05);
            gain.gain.linearRampToValueAtTime(0.05 * this.volume, now + i * 0.05 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + i * 0.05 + 0.4);

            osc.connect(gain);
            gain.connect(this.ctx!.destination);

            osc.start(now + i * 0.05);
            osc.stop(now + i * 0.05 + 0.5);
        });
    }

    // Arena-specific sounds
    playCountdownTick() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08 * this.volume, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.1);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.15);
    }

    playMatchStart() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        // Rising fanfare
        const freqs = [523.25, 659.25, 783.99, 1046.50]; // C E G C

        freqs.forEach((freq, i) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.1);

            gain.gain.setValueAtTime(0, now + i * 0.1);
            gain.gain.linearRampToValueAtTime(0.12 * this.volume, now + i * 0.1 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + i * 0.1 + 0.3);

            osc.connect(gain);
            gain.connect(this.ctx!.destination);

            osc.start(now + i * 0.1);
            osc.stop(now + i * 0.1 + 0.4);
        });
    }

    playVictory() {
        if (!this.enabled) return;

        // Try file-based sound first
        this.playSoundSync('victory', () => this._playVictoryProcedural());
    }

    private _playVictoryProcedural() {
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        // Triumphant fanfare: ascending arpeggio
        const freqs = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C E G C E

        freqs.forEach((freq, i) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.12);

            gain.gain.setValueAtTime(0, now + i * 0.12);
            gain.gain.linearRampToValueAtTime(0.15 * this.volume, now + i * 0.12 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + i * 0.12 + 0.5);

            osc.connect(gain);
            gain.connect(this.ctx!.destination);

            osc.start(now + i * 0.12);
            osc.stop(now + i * 0.12 + 0.6);
        });
    }

    playDefeat() {
        if (!this.enabled) return;

        // Try file-based sound first
        this.playSoundSync('defeat', () => this._playDefeatProcedural());
    }

    private _playDefeatProcedural() {
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        // Descending sad tones
        const freqs = [392, 349.23, 293.66, 261.63]; // G F D C

        freqs.forEach((freq, i) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.15);

            gain.gain.setValueAtTime(0, now + i * 0.15);
            gain.gain.linearRampToValueAtTime(0.08 * this.volume, now + i * 0.15 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + i * 0.15 + 0.4);

            osc.connect(gain);
            gain.connect(this.ctx!.destination);

            osc.start(now + i * 0.15);
            osc.stop(now + i * 0.15 + 0.5);
        });
    }

    playOpponentScore() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Low warning tone
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.1);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.06 * this.volume, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.2);
    }

    playTimeWarning() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Urgent beep
        osc.type = 'square';
        osc.frequency.setValueAtTime(660, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08 * this.volume, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.1);
    }

    // UI Sounds
    playHover() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(550, now + 0.05);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.02 * this.volume, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.05);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.05);
    }

    playClick() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Smoother click (sine wave, quick fade)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1 * this.volume, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.1);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.1);
    }

    playMatchFound() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;

        // Impact sound
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(50, now + 0.5);
        gain.gain.setValueAtTime(0.3 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.5);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.5);

        // High shimmer
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(400, now);
        osc2.frequency.linearRampToValueAtTime(800, now + 0.3);
        gain2.gain.setValueAtTime(0, now);
        gain2.gain.linearRampToValueAtTime(0.1 * this.volume, now + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.4);
        osc2.connect(gain2);
        gain2.connect(this.ctx.destination);
        osc2.start(now);
        osc2.stop(now + 0.4);
    }

    playChat() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Bubble pop
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.1);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1 * this.volume, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.15);
    }

    // ========== 5v5 TEAM MATCH SOUNDS ==========

    playRelayHandoff() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const packVol = this.getPackVolume();

        // Whoosh sound - frequency sweep (adapted for pack)
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        if (this.is8BitPack()) {
            // 8-bit: Quick descending arpeggio
            osc.type = 'square';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.setValueAtTime(600, now + 0.08);
            osc.frequency.setValueAtTime(400, now + 0.16);
        } else if (this.isTypewriterPack()) {
            // Typewriter: Heavy mechanical slide
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(80, now);
            osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
        } else {
            osc.type = this.getPackOscType() === 'square' ? 'square' : 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
            osc.frequency.exponentialRampToValueAtTime(400, now + 0.3);
        }

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, now);
        filter.frequency.linearRampToValueAtTime(500, now + 0.3);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12 * this.volume * packVol, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.3);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.35);
    }

    playYourTurn() {
        if (!this.enabled) return;

        // Try file-based sound first
        this.playSoundSync('your_turn', () => this._playYourTurnProcedural());
    }

    private _playYourTurnProcedural() {
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const packVol = this.getPackVolume();
        const oscType = this.getPackOscType();

        // Competitive "ready up" tone - deep bass hit + alert tone
        // Bass impact
        const bass = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bass.type = 'sine';
        bass.frequency.setValueAtTime(80, now);
        bass.frequency.exponentialRampToValueAtTime(50, now + 0.15);
        bassGain.gain.setValueAtTime(0.2 * this.volume * packVol, now);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        bass.connect(bassGain);
        bassGain.connect(this.ctx.destination);
        bass.start(now);
        bass.stop(now + 0.25);

        // Alert tones - two quick ascending notes
        const freqs = this.is8BitPack() ? [440, 880] : [392, 523.25]; // G to C
        freqs.forEach((freq, i) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();

            osc.type = this.is8BitPack() ? 'square' : oscType;
            osc.frequency.setValueAtTime(freq, now + 0.05 + i * 0.1);

            gain.gain.setValueAtTime(0, now + 0.05 + i * 0.1);
            gain.gain.linearRampToValueAtTime(0.12 * this.volume * packVol, now + 0.05 + i * 0.1 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.05 + i * 0.1 + 0.15);

            osc.connect(gain);
            gain.connect(this.ctx!.destination);

            osc.start(now + 0.05 + i * 0.1);
            osc.stop(now + 0.05 + i * 0.1 + 0.2);
        });
    }

    playTeammateCorrect() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const packVol = this.getPackVolume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Subtle but satisfying confirmation tick
        osc.type = this.is8BitPack() ? 'square' : this.getPackOscType();
        osc.frequency.setValueAtTime(this.is8BitPack() ? 660 : 440, now);
        osc.frequency.exponentialRampToValueAtTime(this.is8BitPack() ? 880 : 550, now + 0.04);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.06 * this.volume * packVol, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.1);
    }

    playTimeout() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const packVol = this.getPackVolume();

        // Sports whistle - authoritative double blast
        const freqs = this.is8BitPack() ? [880, 1320] : [1200, 1600];
        freqs.forEach((freq, i) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();

            osc.type = this.is8BitPack() ? 'square' : 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.2);
            // Add slight vibrato for whistle effect
            if (!this.is8BitPack()) {
                osc.frequency.setValueAtTime(freq * 1.02, now + i * 0.2 + 0.05);
                osc.frequency.setValueAtTime(freq, now + i * 0.2 + 0.1);
            }

            gain.gain.setValueAtTime(0, now + i * 0.2);
            gain.gain.linearRampToValueAtTime(0.15 * this.volume * packVol, now + i * 0.2 + 0.01);
            gain.gain.linearRampToValueAtTime(0.15 * this.volume * packVol, now + i * 0.2 + 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + i * 0.2 + 0.18);

            osc.connect(gain);
            gain.connect(this.ctx!.destination);

            osc.start(now + i * 0.2);
            osc.stop(now + i * 0.2 + 0.22);
        });
    }

    playDoubleCallin() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const packVol = this.getPackVolume();

        // Strategic power-up - deep bass + rising tone (like activating an ability)
        // Bass foundation
        const bass = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bass.type = 'sine';
        bass.frequency.setValueAtTime(60, now);
        bassGain.gain.setValueAtTime(0.25 * this.volume * packVol, now);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        bass.connect(bassGain);
        bassGain.connect(this.ctx.destination);
        bass.start(now);
        bass.stop(now + 0.35);

        // Rising power tone
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = this.is8BitPack() ? 'square' : this.getPackOscType();
        osc.frequency.setValueAtTime(this.is8BitPack() ? 220 : 150, now);
        osc.frequency.exponentialRampToValueAtTime(this.is8BitPack() ? 880 : 500, now + 0.25);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12 * this.volume * packVol, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);

        // Confirmation ping at the end
        setTimeout(() => {
            if (!this.ctx) return;
            const ping = this.ctx.createOscillator();
            const pingGain = this.ctx.createGain();
            ping.type = this.is8BitPack() ? 'square' : 'sine';
            ping.frequency.setValueAtTime(this.is8BitPack() ? 1320 : 880, this.ctx.currentTime);
            pingGain.gain.setValueAtTime(0.1 * this.volume * packVol, this.ctx.currentTime);
            pingGain.gain.exponentialRampToValueAtTime(0.001 * this.volume, this.ctx.currentTime + 0.15);
            ping.connect(pingGain);
            pingGain.connect(this.ctx.destination);
            ping.start(this.ctx.currentTime);
            ping.stop(this.ctx.currentTime + 0.2);
        }, 200);
    }

    playRoundEnd() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const packVol = this.getPackVolume();

        // Round end buzzer - authoritative, short
        const buzzer = this.ctx.createOscillator();
        const buzzerGain = this.ctx.createGain();
        buzzer.type = this.is8BitPack() ? 'square' : 'sawtooth';
        buzzer.frequency.setValueAtTime(this.is8BitPack() ? 440 : 220, now);

        buzzerGain.gain.setValueAtTime(0, now);
        buzzerGain.gain.linearRampToValueAtTime(0.18 * this.volume * packVol, now + 0.02);
        buzzerGain.gain.linearRampToValueAtTime(0.18 * this.volume * packVol, now + 0.25);
        buzzerGain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.35);

        buzzer.connect(buzzerGain);
        buzzerGain.connect(this.ctx.destination);
        buzzer.start(now);
        buzzer.stop(now + 0.4);

        // Second tone - confirmation
        const confirm = this.ctx.createOscillator();
        const confirmGain = this.ctx.createGain();
        confirm.type = this.is8BitPack() ? 'square' : this.getPackOscType();
        confirm.frequency.setValueAtTime(this.is8BitPack() ? 660 : 330, now + 0.15);

        confirmGain.gain.setValueAtTime(0, now + 0.15);
        confirmGain.gain.linearRampToValueAtTime(0.12 * this.volume * packVol, now + 0.17);
        confirmGain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.4);

        confirm.connect(confirmGain);
        confirmGain.connect(this.ctx.destination);
        confirm.start(now + 0.15);
        confirm.stop(now + 0.45);
    }

    playHalftime() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const packVol = this.getPackVolume();

        // Stadium horn - deep, authoritative halftime signal
        const horn = this.ctx.createOscillator();
        const hornGain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        horn.type = this.is8BitPack() ? 'square' : 'sawtooth';
        horn.frequency.setValueAtTime(this.is8BitPack() ? 220 : 110, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);

        hornGain.gain.setValueAtTime(0, now);
        hornGain.gain.linearRampToValueAtTime(0.22 * this.volume * packVol, now + 0.08);
        hornGain.gain.linearRampToValueAtTime(0.22 * this.volume * packVol, now + 0.5);
        hornGain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.7);

        horn.connect(filter);
        filter.connect(hornGain);
        hornGain.connect(this.ctx.destination);
        horn.start(now);
        horn.stop(now + 0.75);

        // Second horn note (fifth above) for richness
        const horn2 = this.ctx.createOscillator();
        const horn2Gain = this.ctx.createGain();
        horn2.type = this.is8BitPack() ? 'square' : 'sawtooth';
        horn2.frequency.setValueAtTime(this.is8BitPack() ? 330 : 165, now); // Perfect fifth

        horn2Gain.gain.setValueAtTime(0, now);
        horn2Gain.gain.linearRampToValueAtTime(0.12 * this.volume * packVol, now + 0.08);
        horn2Gain.gain.linearRampToValueAtTime(0.12 * this.volume * packVol, now + 0.5);
        horn2Gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.7);

        horn2.connect(filter);
        horn2.start(now);
        horn2.stop(now + 0.75);
    }

    playStreakMilestone(streakLevel: 3 | 5 | 10) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const packVol = this.getPackVolume();
        const oscType = this.is8BitPack() ? 'square' : this.getPackOscType();

        // Competitive streak sounds - quick, impactful
        const configs: Record<number, { freqs: number[], delay: number, vol: number }> = {
            3: { freqs: [392, 523.25], delay: 0.06, vol: 0.1 }, // 3x - quick double beep
            5: { freqs: [392, 523.25, 659.25], delay: 0.05, vol: 0.12 }, // 5x - triple
            10: { freqs: [261.63, 392, 523.25, 783.99], delay: 0.04, vol: 0.15 }, // 10x - epic quad
        };

        const config = configs[streakLevel] || configs[3];

        // Add bass impact for higher streaks
        if (streakLevel >= 5) {
            const bass = this.ctx.createOscillator();
            const bassGain = this.ctx.createGain();
            bass.type = 'sine';
            bass.frequency.setValueAtTime(streakLevel === 10 ? 50 : 65, now);
            bassGain.gain.setValueAtTime(0.15 * this.volume * packVol, now);
            bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            bass.connect(bassGain);
            bassGain.connect(this.ctx.destination);
            bass.start(now);
            bass.stop(now + 0.25);
        }

        config.freqs.forEach((freq, i) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();

            osc.type = oscType;
            osc.frequency.setValueAtTime(freq, now + i * config.delay);

            gain.gain.setValueAtTime(0, now + i * config.delay);
            gain.gain.linearRampToValueAtTime(config.vol * this.volume * packVol, now + i * config.delay + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + i * config.delay + 0.2);

            osc.connect(gain);
            gain.connect(this.ctx!.destination);

            osc.start(now + i * config.delay);
            osc.stop(now + i * config.delay + 0.25);
        });
    }

    playMVPReveal() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;

        // Dramatic reveal - drum roll then fanfare
        // Drum roll simulation
        for (let i = 0; i < 8; i++) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(100 + i * 20, now + i * 0.06);

            gain.gain.setValueAtTime(0, now + i * 0.06);
            gain.gain.linearRampToValueAtTime((0.05 + i * 0.01) * this.volume, now + i * 0.06 + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + i * 0.06 + 0.08);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now + i * 0.06);
            osc.stop(now + i * 0.06 + 0.1);
        }

        // Fanfare after drum roll
        setTimeout(() => {
            if (!this.ctx) return;
            const fanfareNow = this.ctx.currentTime;
            const fanfareFreqs = [523.25, 659.25, 783.99, 1046.50, 1318.51];

            fanfareFreqs.forEach((freq, i) => {
                const osc = this.ctx!.createOscillator();
                const gain = this.ctx!.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, fanfareNow + i * 0.1);

                gain.gain.setValueAtTime(0, fanfareNow + i * 0.1);
                gain.gain.linearRampToValueAtTime(0.15 * this.volume, fanfareNow + i * 0.1 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, fanfareNow + i * 0.1 + 0.5);

                osc.connect(gain);
                gain.connect(this.ctx!.destination);

                osc.start(fanfareNow + i * 0.1);
                osc.stop(fanfareNow + i * 0.1 + 0.6);
            });
        }, 500);
    }

    playCountdownTickIntense(secondsRemaining: number) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const packVol = this.getPackVolume();

        // Aggressive countdown tick - gets more intense
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Frequency and volume increase as time decreases
        const baseFreq = this.is8BitPack()
            ? (secondsRemaining <= 2 ? 880 : secondsRemaining <= 3 ? 660 : 440)
            : (secondsRemaining <= 2 ? 600 : secondsRemaining <= 3 ? 500 : 400);
        const vol = secondsRemaining <= 2 ? 0.18 : secondsRemaining <= 3 ? 0.12 : 0.08;

        osc.type = this.is8BitPack() ? 'square' : this.getPackOscType();
        osc.frequency.setValueAtTime(baseFreq, now);

        // Sharp attack for competitive feel
        gain.gain.setValueAtTime(vol * this.volume * packVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.1);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.12);

        // Add sub-bass thump for final 2 seconds
        if (secondsRemaining <= 2) {
            const bass = this.ctx.createOscillator();
            const bassGain = this.ctx.createGain();
            bass.type = 'sine';
            bass.frequency.setValueAtTime(60, now);
            bassGain.gain.setValueAtTime(0.2 * this.volume * packVol, now);
            bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            bass.connect(bassGain);
            bassGain.connect(this.ctx.destination);
            bass.start(now);
            bass.stop(now + 0.18);
        }
    }

    playGo() {
        if (!this.enabled) return;

        // Try file-based sound first
        this.playSoundSync('go', () => this._playGoProcedural());
    }

    private _playGoProcedural() {
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const packVol = this.getPackVolume();

        // Impactful "GO!" - deep bass hit with rising energy burst
        // Bass impact
        const bass = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bass.type = 'sine';
        bass.frequency.setValueAtTime(50, now);
        bass.frequency.exponentialRampToValueAtTime(40, now + 0.15);
        bassGain.gain.setValueAtTime(0.35 * this.volume * packVol, now);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        bass.connect(bassGain);
        bassGain.connect(this.ctx.destination);
        bass.start(now);
        bass.stop(now + 0.3);

        // Rising power chord
        const freqs = this.is8BitPack() ? [262, 330, 392, 523] : [196, 262, 330, 392]; // Lower, more powerful
        freqs.forEach((freq, _i) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();

            osc.type = this.is8BitPack() ? 'square' : this.getPackOscType();
            osc.frequency.setValueAtTime(freq, now);
            osc.frequency.exponentialRampToValueAtTime(freq * 1.05, now + 0.15);

            gain.gain.setValueAtTime(0.12 * this.volume * packVol, now);
            gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + 0.25);

            osc.connect(gain);
            gain.connect(this.ctx!.destination);

            osc.start(now);
            osc.stop(now + 0.3);
        });
    }

    // Strategy/Countdown Music (for match starting phase)
    private strategySource: AudioBufferSourceNode | null = null;
    private strategyGain: GainNode | null = null;
    private strategyBuffer: AudioBuffer | null = null;

    // Match Music (during active gameplay)
    private matchSource: AudioBufferSourceNode | null = null;
    private matchGain: GainNode | null = null;
    private matchBuffer: AudioBuffer | null = null;

    // Halftime Music (during halftime break)
    private halftimeSource: AudioBufferSourceNode | null = null;
    private halftimeGain: GainNode | null = null;
    private halftimeBuffer: AudioBuffer | null = null;

    // Strategy music loading/stopped flags for race condition protection
    private strategyLoading: boolean = false;
    private strategyStopped: boolean = false;

    async playStrategyMusic() {
        // Track that strategy music should be playing (for resume on re-enable)
        this.desiredAmbientMusic = 'strategy';
        
        // Clear stopped flag - we're intentionally starting playback
        this.strategyStopped = false;
        
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        // Don't restart if already playing OR loading (prevents race condition)
        if (this.strategySource || this.strategyLoading) {
            return;
        }

        // Set loading flag BEFORE any async operations
        this.strategyLoading = true;

        try {
            // Load buffer if not cached
            if (!this.strategyBuffer) {
                const response = await fetch('/sounds/countdown-tension.mp3');
                if (!response.ok) {
                    console.warn('[SoundEngine] Strategy music not found');
                    this.strategyLoading = false;
                    return;
                }
                const arrayBuffer = await response.arrayBuffer();
                this.strategyBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            }

            // Check if stop was called while loading - abort if so
            if (this.strategyStopped) {
                this.strategyLoading = false;
                return;
            }

            // Double-check we haven't started playing while loading
            if (this.strategySource) {
                this.strategyLoading = false;
                return;
            }

            const source = this.ctx.createBufferSource();
            source.buffer = this.strategyBuffer;
            source.loop = true; // Loop if song ends before phase completes

            const gain = this.ctx.createGain();
            // Fade in over 1 second
            gain.gain.setValueAtTime(0, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.4 * this.volume, this.ctx.currentTime + 1);

            source.connect(gain);
            gain.connect(this.ctx.destination);

            source.start(0);

            this.strategySource = source;
            this.strategyGain = gain;
            this.strategyLoading = false;

            // Handle when source ends (for cleanup if not looping)
            source.onended = () => {
                if (this.strategySource === source) {
                    this.strategySource = null;
                    this.strategyGain = null;
                }
            };
        } catch (_e) {
            console.error('[SoundEngine] Failed to play strategy music:', e);
            this.strategyLoading = false;
        }
    }

    stopStrategyMusic(fadeOutMs: number = 1500) {
        // Clear the desired ambient music tracker
        if (this.desiredAmbientMusic === 'strategy') {
            this.desiredAmbientMusic = null;
        }
        
        // Mark as stopped - prevents music from starting if still loading
        this.strategyStopped = true;
        this.strategyLoading = false;
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sound-engine.ts:stopStrategyMusic',message:'Stop strategy music called',data:{hasSource:!!this.strategySource,fadeOutMs},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        if (this.strategySource && this.strategyGain && this.ctx) {
            const now = this.ctx.currentTime;
            const fadeOutSec = fadeOutMs / 1000;

            // Cancel any scheduled changes and fade out
            this.strategyGain.gain.cancelScheduledValues(now);
            this.strategyGain.gain.setValueAtTime(this.strategyGain.gain.value, now);
            this.strategyGain.gain.linearRampToValueAtTime(0, now + fadeOutSec);

            // Stop after fade completes
            const sourceToStop = this.strategySource;
            setTimeout(() => {
                try {
                    sourceToStop.stop();
                } catch (_e) {
                    // Already stopped
                }
            }, fadeOutMs);

            this.strategySource = null;
            this.strategyGain = null;
        }
    }

    // #region agent log - match music loading/stopped flags for race condition protection
    private matchLoading: boolean = false;
    private matchStopped: boolean = false;
    // #endregion

    // Match Music (high energy during active gameplay)
    async playMatchMusic() {
        // Track that match music should be playing (for resume on re-enable)
        this.desiredAmbientMusic = 'match';
        
        // Clear stopped flag - we're intentionally starting playback
        this.matchStopped = false;
        
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        // Don't restart if already playing OR loading (prevents race condition)
        if (this.matchSource || this.matchLoading) {
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sound-engine.ts:playMatchMusic',message:'Skipped - already playing or loading',data:{hasSource:!!this.matchSource,isLoading:this.matchLoading},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            return;
        }

        // Set loading flag BEFORE any async operations
        this.matchLoading = true;
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sound-engine.ts:playMatchMusic',message:'Started loading match music',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion

        try {
            // Load buffer if not cached
            if (!this.matchBuffer) {
                const response = await fetch('/sounds/match-music.mp3');
                if (!response.ok) {
                    console.warn('[SoundEngine] Match music not found');
                    this.matchLoading = false;
                    return;
                }
                const arrayBuffer = await response.arrayBuffer();
                this.matchBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            }

            // Check if stop was called while loading - abort if so
            if (this.matchStopped) {
                // #region agent log
                fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sound-engine.ts:playMatchMusic',message:'Aborted - stop was called during loading',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                this.matchLoading = false;
                return;
            }

            // Double-check we haven't started playing while loading
            if (this.matchSource) {
                this.matchLoading = false;
                return;
            }

            const source = this.ctx.createBufferSource();
            source.buffer = this.matchBuffer;
            source.loop = true; // Loop during match

            const gain = this.ctx.createGain();
            // Fade in over 1.5 seconds (volume reduced by 25% from 0.35 to 0.26)
            gain.gain.setValueAtTime(0, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.26 * this.volume, this.ctx.currentTime + 1.5);

            source.connect(gain);
            gain.connect(this.ctx.destination);

            source.start(0);

            this.matchSource = source;
            this.matchGain = gain;
            this.matchLoading = false;
            
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sound-engine.ts:playMatchMusic',message:'Match music started playing',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
            // #endregion

            source.onended = () => {
                if (this.matchSource === source) {
                    this.matchSource = null;
                    this.matchGain = null;
                }
            };
        } catch (_e) {
            console.error('[SoundEngine] Failed to play match music:', e);
            this.matchLoading = false;
        }
    }

    stopMatchMusic(fadeOutMs: number = 1500) {
        // Clear the desired ambient music tracker
        if (this.desiredAmbientMusic === 'match') {
            this.desiredAmbientMusic = null;
        }
        
        // Mark as stopped - prevents music from starting if still loading
        this.matchStopped = true;
        this.matchLoading = false;
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sound-engine.ts:stopMatchMusic',message:'Stop match music called',data:{hasSource:!!this.matchSource,fadeOutMs},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        if (this.matchSource && this.matchGain && this.ctx) {
            const now = this.ctx.currentTime;
            const fadeOutSec = fadeOutMs / 1000;

            this.matchGain.gain.cancelScheduledValues(now);
            this.matchGain.gain.setValueAtTime(this.matchGain.gain.value, now);
            this.matchGain.gain.linearRampToValueAtTime(0, now + fadeOutSec);

            const sourceToStop = this.matchSource;
            setTimeout(() => {
                try {
                    sourceToStop.stop();
                } catch (_e) {
                    // Already stopped
                }
            }, fadeOutMs);

            this.matchSource = null;
            this.matchGain = null;
        }
    }

    // #region agent log - halftime music loading/stopped flags for race condition protection
    private halftimeLoading: boolean = false;
    private halftimeStopped: boolean = false;
    // #endregion

    // Halftime Music (relaxing during halftime break)
    async playHalftimeMusic() {
        // Track that halftime music should be playing (for resume on re-enable)
        this.desiredAmbientMusic = 'halftime';
        
        // Clear stopped flag - we're intentionally starting playback
        this.halftimeStopped = false;
        
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        // Don't restart if already playing OR loading (prevents race condition)
        if (this.halftimeSource || this.halftimeLoading) {
            return;
        }

        // Set loading flag BEFORE any async operations
        this.halftimeLoading = true;

        try {
            // Load buffer if not cached
            if (!this.halftimeBuffer) {
                const response = await fetch('/sounds/halftime-music.mp3');
                if (!response.ok) {
                    console.warn('[SoundEngine] Halftime music not found');
                    this.halftimeLoading = false;
                    return;
                }
                const arrayBuffer = await response.arrayBuffer();
                this.halftimeBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            }

            // Check if stop was called while loading - abort if so
            if (this.halftimeStopped) {
                this.halftimeLoading = false;
                return;
            }

            // Double-check we haven't started playing while loading
            if (this.halftimeSource) {
                this.halftimeLoading = false;
                return;
            }

            const source = this.ctx.createBufferSource();
            source.buffer = this.halftimeBuffer;
            source.loop = true; // Loop during halftime

            const gain = this.ctx.createGain();
            // Fade in over 2 seconds (more relaxed transition)
            gain.gain.setValueAtTime(0, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.3 * this.volume, this.ctx.currentTime + 2);

            source.connect(gain);
            gain.connect(this.ctx.destination);

            source.start(0);

            this.halftimeSource = source;
            this.halftimeGain = gain;
            this.halftimeLoading = false;

            source.onended = () => {
                if (this.halftimeSource === source) {
                    this.halftimeSource = null;
                    this.halftimeGain = null;
                }
            };
        } catch (_e) {
            console.error('[SoundEngine] Failed to play halftime music:', e);
            this.halftimeLoading = false;
        }
    }

    stopHalftimeMusic(fadeOutMs: number = 1500) {
        // Clear the desired ambient music tracker
        if (this.desiredAmbientMusic === 'halftime') {
            this.desiredAmbientMusic = null;
        }
        
        // Mark as stopped - prevents music from starting if still loading
        this.halftimeStopped = true;
        this.halftimeLoading = false;
        
        if (this.halftimeSource && this.halftimeGain && this.ctx) {
            const now = this.ctx.currentTime;
            const fadeOutSec = fadeOutMs / 1000;

            this.halftimeGain.gain.cancelScheduledValues(now);
            this.halftimeGain.gain.setValueAtTime(this.halftimeGain.gain.value, now);
            this.halftimeGain.gain.linearRampToValueAtTime(0, now + fadeOutSec);

            const sourceToStop = this.halftimeSource;
            setTimeout(() => {
                try {
                    sourceToStop.stop();
                } catch (_e) {
                    // Already stopped
                }
            }, fadeOutMs);

            this.halftimeSource = null;
            this.halftimeGain = null;
        }
    }

    // Stop all phase-based music (for cleanup)
    stopAllPhaseMusic(fadeOutMs: number = 0) {
        this.stopStrategyMusic(fadeOutMs);
        this.stopMatchMusic(fadeOutMs);
        this.stopHalftimeMusic(fadeOutMs);
        this.stopQueueMusic(fadeOutMs);
    }

    // Queue Music (relaxing guitar while waiting in queue)
    private queueSource: AudioBufferSourceNode | null = null;
    private queueGain: GainNode | null = null;
    private queueBuffer: AudioBuffer | null = null;

    // #region agent log - queue music loading/stopped flags for race condition protection
    private queueLoading: boolean = false;
    private queueStopped: boolean = false;
    // #endregion

    async playQueueMusic() {
        // Track that queue music should be playing (for resume on re-enable)
        this.desiredAmbientMusic = 'queue';
        
        // Clear stopped flag - we're intentionally starting playback
        this.queueStopped = false;
        
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        // Don't restart if already playing OR loading (prevents race condition)
        if (this.queueSource || this.queueLoading) {
            return;
        }

        // Set loading flag BEFORE any async operations
        this.queueLoading = true;

        try {
            // Load buffer if not cached - uses halftime music (relaxing guitar)
            if (!this.queueBuffer) {
                const response = await fetch('/sounds/halftime-music.mp3');
                const arrayBuffer = await response.arrayBuffer();
                this.queueBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            }

            // Check if stop was called while loading - abort if so
            if (this.queueStopped) {
                this.queueLoading = false;
                return;
            }

            // Double-check we haven't started playing while loading
            if (this.queueSource) {
                this.queueLoading = false;
                return;
            }

            const source = this.ctx.createBufferSource();
            source.buffer = this.queueBuffer;
            source.loop = true;

            const gain = this.ctx.createGain();
            // Fade in over 2 seconds
            gain.gain.setValueAtTime(0, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.25 * this.volume, this.ctx.currentTime + 2);

            source.connect(gain);
            gain.connect(this.ctx.destination);

            source.start(0);

            this.queueSource = source;
            this.queueGain = gain;
            this.queueLoading = false;

            source.onended = () => {
                if (this.queueSource === source) {
                    this.queueSource = null;
                    this.queueGain = null;
                }
            };
        } catch (_e) {
            console.error('[SoundEngine] Failed to play queue music:', e);
            this.queueLoading = false;
        }
    }

    stopQueueMusic(fadeOutMs: number = 1500) {
        // Clear the desired ambient music tracker
        if (this.desiredAmbientMusic === 'queue') {
            this.desiredAmbientMusic = null;
        }
        
        // Mark as stopped - prevents music from starting if still loading
        this.queueStopped = true;
        this.queueLoading = false;
        
        if (this.queueSource && this.queueGain && this.ctx) {
            const now = this.ctx.currentTime;
            const fadeOutSec = fadeOutMs / 1000;

            this.queueGain.gain.cancelScheduledValues(now);
            this.queueGain.gain.setValueAtTime(this.queueGain.gain.value, now);
            this.queueGain.gain.linearRampToValueAtTime(0, now + fadeOutSec);

            const sourceToStop = this.queueSource;
            setTimeout(() => {
                try {
                    sourceToStop.stop();
                } catch (_e) {
                    // Already stopped
                }
            }, fadeOutMs);

            this.queueSource = null;
            this.queueGain = null;
        }
    }

    // Lobby Music (tense build-up before match starts)
    // Uses the same track as strategy music (countdown tension)
    async playLobbyMusic() {
        // Reuse strategy music for the lobby countdown
        await this.playStrategyMusic();
    }

    stopLobbyMusic(fadeOutMs: number = 1500) {
        this.stopStrategyMusic(fadeOutMs);
    }

    // Arena Entrance Music (with audio analyser for visualization)
    private arenaEntranceSource: AudioBufferSourceNode | null = null;
    private arenaEntranceGain: GainNode | null = null;
    private arenaEntranceBuffer: AudioBuffer | null = null;
    private arenaEntranceAnalyser: AnalyserNode | null = null;
    private arenaEntranceLoading: boolean = false; // Prevent race condition with multiple calls
    private arenaEntranceFadingOut: boolean = false; // Prevent new starts during fade-out

    async playArenaEntranceMusic(): Promise<AnalyserNode | null> {
        // Track that arena entrance music should be playing (for resume on re-enable)
        this.desiredAmbientMusic = 'arenaEntrance';
        
        // Clear the stopped flag - we're intentionally starting playback
        this.arenaEntranceStopped = false;
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sound-engine.ts:playArenaEntranceMusic:entry',message:'Play entrance music called',data:{enabled:this.enabled,hasSource:!!this.arenaEntranceSource,isLoading:this.arenaEntranceLoading,isStopped:this.arenaEntranceStopped},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        if (!this.enabled) return null;
        this.init();
        if (!this.ctx) return null;

        // Don't restart if already playing, loading, OR fading out (prevents overlap during fade)
        if (this.arenaEntranceSource || this.arenaEntranceLoading || this.arenaEntranceFadingOut) {
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sound-engine.ts:playArenaEntranceMusic:skip',message:'Skipped - already playing, loading, or fading',data:{hasSource:!!this.arenaEntranceSource,isLoading:this.arenaEntranceLoading,isFadingOut:this.arenaEntranceFadingOut},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            return this.arenaEntranceAnalyser;
        }

        // Set loading flag BEFORE any async operations
        this.arenaEntranceLoading = true;

        try {
            // Load buffer if not cached
            if (!this.arenaEntranceBuffer) {
                const response = await fetch('/sounds/arena-entrance.mp3');
                const arrayBuffer = await response.arrayBuffer();
                this.arenaEntranceBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            }

            // Check if stop was called while we were loading - abort if so
            if (this.arenaEntranceStopped) {
                // #region agent log
                fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sound-engine.ts:playArenaEntranceMusic',message:'Aborted - stop was called during loading',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                this.arenaEntranceLoading = false;
                return null;
            }

            // Double-check we haven't started playing while loading (another caller might have)
            if (this.arenaEntranceSource) {
                this.arenaEntranceLoading = false;
                return this.arenaEntranceAnalyser;
            }

            const source = this.ctx.createBufferSource();
            source.buffer = this.arenaEntranceBuffer;
            source.loop = true;

            // Create analyser for visualization
            const analyser = this.ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;

            const gain = this.ctx.createGain();
            // Fade in over 1.5 seconds (louder for mode selection page)
            gain.gain.setValueAtTime(0, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.9 * this.volume, this.ctx.currentTime + 1.5);

            // Connect: source -> analyser -> gain -> destination
            source.connect(analyser);
            analyser.connect(gain);
            gain.connect(this.ctx.destination);

            source.start(0);

            this.arenaEntranceSource = source;
            this.arenaEntranceGain = gain;
            this.arenaEntranceAnalyser = analyser;
            this.arenaEntranceLoading = false;
            
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sound-engine.ts:playArenaEntranceMusic:started',message:'Arena entrance music started playing',data:{sourceId:Date.now()},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
            // #endregion

            // NOTE: For looped audio, onended should only fire when we explicitly stop() it.
            // We do NOT clear references in onended because:
            // 1. We already clear them in stopArenaEntranceMusic
            // 2. onended might fire unexpectedly due to audio errors or context issues
            // 3. Clearing here would allow duplicate music to start
            source.onended = () => {
                // #region agent log
                fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sound-engine.ts:playArenaEntranceMusic:onended',message:'Source onended fired (no-op for looped audio)',data:{isCurrentSource:this.arenaEntranceSource===source,arenaEntranceStopped:this.arenaEntranceStopped},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                // Only clear if this was an intentional stop (arenaEntranceStopped is true)
                // This prevents unexpected onended events from clearing the source
                if (this.arenaEntranceStopped && this.arenaEntranceSource === source) {
                    this.arenaEntranceSource = null;
                    this.arenaEntranceGain = null;
                    this.arenaEntranceAnalyser = null;
                }
            };

            return analyser;
        } catch (_e) {
            console.error('[SoundEngine] Failed to play arena entrance music:', e);
            this.arenaEntranceLoading = false;
            return null;
        }
    }

    getArenaEntranceAnalyser(): AnalyserNode | null {
        return this.arenaEntranceAnalyser;
    }

    // Flag to prevent music from starting after stop is called during loading
    private arenaEntranceStopped: boolean = false;

    stopArenaEntranceMusic(fadeOutMs: number = 1500) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sound-engine.ts:stopArenaEntranceMusic:entry',message:'Stop arena entrance music called',data:{hasSource:!!this.arenaEntranceSource,hasGain:!!this.arenaEntranceGain,fadeOutMs},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        // Clear the desired ambient music tracker (user/component explicitly stopped this)
        if (this.desiredAmbientMusic === 'arenaEntrance') {
            this.desiredAmbientMusic = null;
        }
        
        // Mark as stopped - this prevents music from starting if it's still loading
        this.arenaEntranceStopped = true;
        
        // Clear loading flag so music can be restarted after stopping
        this.arenaEntranceLoading = false;
        
        if (this.arenaEntranceSource && this.arenaEntranceGain && this.ctx) {
            const now = this.ctx.currentTime;
            const fadeOutSec = fadeOutMs / 1000;

            this.arenaEntranceGain.gain.cancelScheduledValues(now);
            this.arenaEntranceGain.gain.setValueAtTime(this.arenaEntranceGain.gain.value, now);
            this.arenaEntranceGain.gain.linearRampToValueAtTime(0, now + fadeOutSec);

            const sourceToStop = this.arenaEntranceSource;
            
            // Set fading flag - prevents new music from starting during fadeout
            this.arenaEntranceFadingOut = true;
            
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sound-engine.ts:stopArenaEntranceMusic:fading',message:'Starting fade out',data:{fadeOutMs,fadingOut:true},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            
            // Clear the source references now (for state tracking)
            this.arenaEntranceSource = null;
            this.arenaEntranceGain = null;
            this.arenaEntranceAnalyser = null;
            
            setTimeout(() => {
                // #region agent log
                fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sound-engine.ts:stopArenaEntranceMusic:stopped',message:'Fade complete, clearing fadingOut flag',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                // Clear fading flag - new music can start now
                this.arenaEntranceFadingOut = false;
                try {
                    sourceToStop.stop();
                } catch (_e) {
                    // Already stopped
                }
            }, fadeOutMs);
        }
    }

    // Background Music
    private bgmSource: AudioBufferSourceNode | null = null;
    private bgmGain: GainNode | null = null;
    private currentTrack: string | null = null;

    async playBGM(trackName: string) {
        if (!this.enabled || (this.currentTrack === trackName && this.bgmSource)) return;
        this.init();
        if (!this.ctx) return;

        // Stop current if playing
        this.stopBGM();

        this.currentTrack = trackName;

        try {
            const response = await fetch(`/music/${trackName}.mp3`);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

            const source = this.ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.loop = true;

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.3 * this.volume, this.ctx.currentTime + 2); // Fade in

            source.connect(gain);
            gain.connect(this.ctx.destination);

            source.start(0);

            this.bgmSource = source;
            this.bgmGain = gain;
        } catch (_e) {
            console.error('Failed to play BGM:', e);
        }
    }

    stopBGM() {
        if (this.bgmSource && this.bgmGain && this.ctx) {
            const now = this.ctx.currentTime;
            this.bgmGain.gain.cancelScheduledValues(now);
            this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now);
            this.bgmGain.gain.linearRampToValueAtTime(0, now + 1); // Fade out

            this.bgmSource.stop(now + 1);
            this.bgmSource = null;
            this.bgmGain = null;
            this.currentTrack = null;
        }
    }
}

export const soundEngine = typeof window !== 'undefined' ? new SoundEngine() : ({} as SoundEngine);
