"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

interface ParticleEffectsProps {
    effectType: string; // 'particle_sparks', 'particle_glitch'
    previewRect?: DOMRect | null;
}

export function ParticleEffects({ effectType, previewRect }: ParticleEffectsProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particles = useRef<any[]>([]);
    const pathname = usePathname();

    const getTargetPosition = () => {
        let x = window.innerWidth / 2;
        let y = window.innerHeight / 2;
        let width = 0;
        let height = 0;

        if (previewRect) {
            x = previewRect.left + previewRect.width / 2;
            y = previewRect.top + previewRect.height / 2;
            width = previewRect.width;
            height = previewRect.height;
        } else {
            // Gameplay fallback: Active Input
            const active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
                const rect = active.getBoundingClientRect();
                x = rect.left + rect.width / 2;
                y = rect.top + rect.height / 2;
                width = rect.width;
                height = rect.height;
            }
        }
        return { x, y, width, height };
    };

    const spawnFragments = () => {
        const { x, y, width, height } = getTargetPosition();
        // Spread a bit based on width/height
        const spreadX = width ? width / 2 : 20;

        for (let i = 0; i < 5; i++) {
            const speed = 1 + Math.random() * 3;
            particles.current.push({
                type: 'fragment',
                x: x + (Math.random() - 0.5) * spreadX,
                y: y,
                vx: (Math.random() - 0.5) * speed,
                vy: (Math.random() - 0.5) * speed - 2, // Upward kick
                life: 0.8,
                color: `rgba(${100 + Math.random() * 155}, ${100 + Math.random() * 155}, 255, 0.8)`,
                size: 2 + Math.random() * 4
            });
        }
    };

    const spawnGlitch = () => {
        const { x: cx, y: cy, width, height } = getTargetPosition();

        // Spawn near target
        for (let i = 0; i < 3; i++) {
            const w = 50 + Math.random() * 100;
            const h = 5 + Math.random() * 20;
            particles.current.push({
                type: 'glitch',
                x: cx + (Math.random() - 0.5) * (width || 200),
                y: cy + (Math.random() - 0.5) * (height || 100),
                w, h,
                life: 0.2,
                color: `rgba(${Math.random() > 0.5 ? 255 : 0}, ${Math.random() * 255}, ${Math.random() > 0.5 ? 255 : 0}, 0.8)`
            });
        }
    };

    const spawnBinary = () => {
        const { x, y, width, height } = getTargetPosition();
        // console.log("Spawning binary", { x, y, height });
        const spreadX = width ? width / 2 : 50;

        for (let i = 0; i < 4; i++) {
            particles.current.push({
                type: 'binary',
                text: Math.random() > 0.5 ? '1' : '0',
                x: x + (Math.random() - 0.5) * spreadX,
                y: y - (height ? height / 2 : 0) - 40, // Spawn 40px above the TOP edge
                vy: 4 + Math.random() * 4, // Faster fall
                life: 1.2,
                color: '#22c55e', // Green-500
                size: 20 + Math.random() * 12 // Bigger text
            });
        }
    };

    const spawnExplosion = () => {
        const { x, y } = getTargetPosition();
        // Math symbols instead of BAM POW
        const symbols = ["+", "-", "×", "÷", "=", "√", "%"];
        const symbol = symbols[Math.floor(Math.random() * symbols.length)];

        // Get Theme Color
        let color = '#fbbf24'; // Fallback Amber
        if (typeof window !== 'undefined') {
            const style = getComputedStyle(document.documentElement);
            const primary = style.getPropertyValue('--primary').trim();
            if (primary) color = primary;
        }

        particles.current.push({
            type: 'text_boom',
            text: symbol,
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6 - 3,
            life: 1.0,
            angle: (Math.random() - 0.5) * 1, // Random rotation
            color: color,
            size: 32 + Math.random() * 16
        });
    };

    const spawnVortex = () => {
        const { x, y } = getTargetPosition();

        for (let i = 0; i < 6; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 60 + Math.random() * 40;
            particles.current.push({
                type: 'vortex',
                cx: x,
                cy: y,
                angle,
                dist,
                speed: 0.08 + Math.random() * 0.05,
                life: 1.0,
                color: '#a855f7', // Purple-500
                size: 3 + Math.random() * 3
            });
        }
    };

    // 1. INPUT LISTENER EFFECT
    useEffect(() => {
        const allowedPaths = ['/practice', '/placement', '/shop', '/locker'];
        if (effectType === 'default' || !allowedPaths.some(p => pathname.includes(p))) return;

        const handleInput = (e: KeyboardEvent) => {
            // Check keydown event for actual typing
            if (effectType.includes('sparks')) spawnFragments();
            if (effectType.includes('glitch')) spawnGlitch();

            // Only spawn binary numbers if typing numbers
            if (effectType.includes('binary') && /^[0-9]$/.test(e.key)) {
                spawnBinary();
            }

            if (effectType.includes('explosion')) spawnExplosion();
            if (effectType.includes('vortex')) spawnVortex();
        };

        window.addEventListener('keydown', handleInput as any);
        return () => window.removeEventListener('keydown', handleInput as any);
    }, [effectType, pathname, previewRect]);

    // 2. ANIMATION LOOP
    useEffect(() => {
        let animationId: number;

        const render = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (particles.current.length > 0) {
                particles.current.forEach((p) => {
                    // --- FRAGMENTS ---
                    if (p.type === 'fragment') {
                        p.x += p.vx;
                        p.y += p.vy;
                        p.life -= 0.03;
                        p.vy += 0.2; // Gravity

                        ctx.fillStyle = p.color;
                        ctx.globalAlpha = p.life;
                        ctx.fillRect(p.x, p.y, p.size, p.size);
                    }
                    // --- GLITCH ---
                    else if (p.type === 'glitch') {
                        p.life -= 0.08;
                        ctx.fillStyle = p.color;
                        ctx.globalAlpha = p.life;
                        ctx.fillRect(p.x, p.y, p.w, p.h);
                    }
                    // --- BINARY ---
                    else if (p.type === 'binary') {
                        p.y += p.vy;
                        p.life -= 0.02;

                        ctx.fillStyle = p.color;
                        ctx.font = `bold ${p.size}px monospace`;
                        ctx.globalAlpha = p.life;
                        ctx.fillText(p.text, p.x, p.y);
                    }
                    // --- TEXT BOOM / MATH ---
                    else if (p.type === 'text_boom') {
                        p.x += p.vx;
                        p.y += p.vy;
                        p.vy += 0.1; // Slight gravity
                        p.life -= 0.02;
                        p.angle += 0.02;
                        const scale = 1 + (1 - p.life) * 0.5;

                        ctx.save();
                        ctx.translate(p.x, p.y);
                        ctx.rotate(p.angle);
                        ctx.fillStyle = p.color;
                        ctx.font = `800 ${p.size * scale}px "Inter", sans-serif`;

                        ctx.globalAlpha = p.life;
                        ctx.fillText(p.text, -p.size / 2, p.size / 2);
                        ctx.restore();
                    }
                    // --- VORTEX ---
                    else if (p.type === 'vortex') {
                        p.angle += p.speed;
                        p.dist -= 1.5; // Suck in
                        p.life -= 0.02;

                        const px = p.cx + Math.cos(p.angle) * p.dist;
                        const py = p.cy + Math.sin(p.angle) * p.dist;

                        ctx.fillStyle = p.color;
                        ctx.globalAlpha = p.life;
                        ctx.beginPath();
                        ctx.arc(px, py, p.size, 0, Math.PI * 2);
                        ctx.fill();
                    }
                });

                // Cleanup
                particles.current = particles.current.filter(p => p.life > 0);
            }

            animationId = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(animationId);
    }, []);

    // Handle resize
    useEffect(() => {
        const resize = () => {
            if (canvasRef.current) {
                canvasRef.current.width = window.innerWidth;
                canvasRef.current.height = window.innerHeight;
            }
        };
        window.addEventListener('resize', resize);
        resize();
        return () => window.removeEventListener('resize', resize);
    }, []);

    // Auto-spawn on effect change (Preview)
    useEffect(() => {
        const isPreviewPage = ['/shop', '/locker'].some(p => pathname.includes(p));
        if (isPreviewPage && effectType !== 'default' && previewRect) {
            if (effectType.includes('sparks')) spawnFragments();
            if (effectType.includes('glitch')) spawnGlitch();
            if (effectType.includes('binary')) spawnBinary();
            if (effectType.includes('explosion')) spawnExplosion();
            if (effectType.includes('vortex')) spawnVortex();
        }
    }, [effectType, pathname, previewRect]);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-50"
        />
    );
}
