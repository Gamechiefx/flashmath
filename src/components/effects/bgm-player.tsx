"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

interface BGMPlayerProps {
    src: string; // The asset path
    enabled: boolean;
}

export function BGMPlayer({ src, enabled }: BGMPlayerProps) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [userMuted, setUserMuted] = useState(false); // Local toggle for BGM specifically if desired


    useEffect(() => {
        if (!enabled || src === 'default' || !src) return;

        // CHECK IF IT IS A FILE PATH
        // If it looks like a file path (starts with / or has an extension), use HTML Audio
        if (src.startsWith('/') || src.includes('.')) {
            // Standard Audio Playback
            const audio = new Audio(src);
            audio.loop = true;
            audio.volume = 0.4; // Reasonable background level

            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.log("Audio play blocked:", error);
                });
            }

            audioRef.current = audio;

            return () => {
                audio.pause();
                audio.src = "";
                audioRef.current = null;
            };
        }

        // ... OTHERWISE USE PROCEDURAL ENGINE ...

        // Web Audio Context for Procedural BGM
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContext();

        let oscillators: OscillatorNode[] = [];
        let gainNodes: GainNode[] = [];
        let isCleanedUp = false;

        const cleanup = () => {
            isCleanedUp = true;
            oscillators.forEach(o => {
                try { o.stop(); o.disconnect(); } catch (e) { }
            });
            gainNodes.forEach(g => {
                try { g.disconnect(); } catch (e) { }
            });
            if (ctx.state !== 'closed') ctx.close();
        };

        const playDrone = (freqs: number[], type: OscillatorType, volume: number) => {
            if (isCleanedUp) return;
            const masterGain = ctx.createGain();
            masterGain.gain.value = 0.1; // Low volume background
            masterGain.connect(ctx.destination);
            gainNodes.push(masterGain);

            freqs.forEach(f => {
                const osc = ctx.createOscillator();
                osc.type = type;
                osc.frequency.value = f;

                const oscGain = ctx.createGain();
                oscGain.gain.value = volume / freqs.length;

                osc.connect(oscGain);
                oscGain.connect(masterGain);

                osc.start();
                oscillators.push(osc);
                gainNodes.push(oscGain);

                // LFO for movement
                const lfo = ctx.createOscillator();
                lfo.frequency.value = 0.1 + Math.random() * 0.2;
                const lfoGain = ctx.createGain();
                lfoGain.gain.value = 10; // Hz modulation depth
                lfo.connect(lfoGain);
                lfoGain.connect(osc.frequency);
                lfo.start();
                oscillators.push(lfo);
                gainNodes.push(lfoGain);
            });
        };

        const playLofi = () => {
            // Jazzy 7th chord drone
            playDrone([261.63, 311.13, 392.00, 493.88], 'sine', 0.15); // Cm7ish
        };

        const playDarksynth = () => {
            // Low Sawtooth Logic
            playDrone([65.41, 130.81], 'sawtooth', 0.08); // Low C
        };

        const playSynthwave = () => {
            // FULL SYNTHWAVE ENGINE (Lo-Fi Edition)
            const bpm = 85;
            const beatDur = 60 / bpm; // Seconds per beat
            const sixteenth = beatDur / 4;

            // --- INSTRUMENTS ---
            const playKick = (time: number) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.frequency.setValueAtTime(120, time); // Softer kick
                osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
                gain.gain.setValueAtTime(0.5, time); // Quieter
                gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(time);
                osc.stop(time + 0.5);
            };

            const playSnare = (time: number) => {
                // Noise buffer
                const bufferSize = ctx.sampleRate * 0.5;
                const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = Math.random() * 2 - 1;
                }
                const noise = ctx.createBufferSource();
                noise.buffer = buffer;
                const gain = ctx.createGain();
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 800;

                gain.gain.setValueAtTime(0.2, time);
                gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

                noise.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);
                noise.start(time);
                noise.stop(time + 0.5);
            };

            const playBass = (time: number, freq: number) => {
                const osc = ctx.createOscillator();
                osc.type = 'sawtooth';
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                const gain = ctx.createGain();

                osc.frequency.value = freq;
                filter.frequency.setValueAtTime(500, time);
                filter.frequency.linearRampToValueAtTime(100, time + sixteenth * 3);

                gain.gain.setValueAtTime(0.3, time);
                gain.gain.linearRampToValueAtTime(0, time + sixteenth * 3);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);
                osc.start(time);
                osc.stop(time + sixteenth * 3);
            };

            const playArp = (time: number, freq: number) => {
                const osc = ctx.createOscillator();
                osc.type = 'square';
                const gain = ctx.createGain();
                osc.frequency.setValueAtTime(freq, time);

                gain.gain.setValueAtTime(0.05, time);
                gain.gain.exponentialRampToValueAtTime(0.01, time + sixteenth);

                // Delay effect! (Simulated via simple extra notes? No, keep it simple)
                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(time);
                osc.stop(time + sixteenth);
            };

            // --- SEQUENCER ---
            let nextNoteTime = ctx.currentTime;
            let step = 0; // 0-15 (16 steps per bar)

            // Chord Prog: Dm (0-3), F (4-7), C (8-11), G (12-15) - simplified measure count
            // Actually let's do 4 bars.
            // Bar 1: Dm
            // Bar 2: F
            // Bar 3: C
            // Bar 4: G

            // Bassline Notes
            const rootNotes = [73.42, 87.31, 65.41, 98.00]; // D2, F2, C2, G2

            // Arp Notes
            const arpChords = [
                [293, 349, 440], // Dm
                [349, 440, 523], // F
                [261, 329, 392], // C
                [392, 493, 587]  // G
            ];

            let isPlayingSeq = true;

            const scheduler = () => {
                if (!isPlayingSeq || ctx.state === 'closed') return;

                while (nextNoteTime < ctx.currentTime + 0.1) {
                    // Schedule Sound
                    const bar = Math.floor(step / 16) % 4;
                    const beat = Math.floor(step / 4) % 4; // 0, 1, 2, 3
                    const subStep = step % 4; // 0, 1, 2, 3

                    // Kick on 1 and 3 (some syncopation?) -> Standard driving beat: Kick on every beat
                    if (subStep === 0) playKick(nextNoteTime);

                    // Snare on 2 and 4
                    if (beat === 1 && subStep === 0) playSnare(nextNoteTime);
                    if (beat === 3 && subStep === 0) playSnare(nextNoteTime);

                    // Bass: Running 8th notes (0 and 2 of 16ths)
                    if (subStep % 2 === 0) {
                        playBass(nextNoteTime, rootNotes[bar]);
                    }

                    // Arp: Fast 16ths
                    const chord = arpChords[bar];
                    const note = chord[step % 3];
                    playArp(nextNoteTime, note * 2); // An octave up

                    // Advance
                    nextNoteTime += sixteenth;
                    step++;
                }

                setTimeout(scheduler, 25);
            };

            scheduler();

            // Register stopper
            oscillators.push({ stop: () => { isPlayingSeq = false; }, disconnect: () => { } } as any);
        };

        if (src.includes('lofi')) playLofi();
        else if (src.includes('darksynth')) playDarksynth();
        else if (src.includes('neon-horizon') || src.includes('binaural')) playSynthwave(); // Support new and legacy
        else playLofi();

        return cleanup;
    }, [src, enabled]);


    // Icon to show it's "playing" (optional, but requested feedback)
    return null;
}
