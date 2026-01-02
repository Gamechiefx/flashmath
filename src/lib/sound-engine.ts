"use client";

class SoundEngine {
    private ctx: AudioContext | null = null;
    private enabled: boolean = true;

    constructor() {
        if (typeof window !== 'undefined') {
            this.enabled = localStorage.getItem('sound_enabled') !== 'false';
        }
    }

    private init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    setEnabled(enabled: boolean) {
        this.enabled = enabled;
        localStorage.setItem('sound_enabled', enabled ? 'true' : 'false');
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
    }

    playCorrect(streak: number = 0) {
        if (!this.enabled) return;
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
        } catch (e) {
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
