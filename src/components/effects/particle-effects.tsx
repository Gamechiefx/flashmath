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

    const spawnFragments = () => {
        // 1. Determine spawn source
        let baseRect: { left: number, top: number, width: number, height: number } | null = null;

        if (previewRect) {
            baseRect = previewRect;
        } else {
            // Gameplay fallback: Active Input
            const active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
                baseRect = active.getBoundingClientRect();
            }
        }

        let x = window.innerWidth / 2;
        let y = window.innerHeight / 2;

        if (baseRect) {
            x = baseRect.left + baseRect.width / 2 + (Math.random() - 0.5) * baseRect.width;
            y = baseRect.top + baseRect.height / 2;
        }

        for (let i = 0; i < 4; i++) { // Reduced from 6 to 4 for performance
            const speed = 1 + Math.random() * 3;
            particles.current.push({
                type: 'fragment',
                x, y,
                vx: (Math.random() - 0.5) * speed,
                vy: (Math.random() - 0.5) * speed - 1,
                life: 0.8, // Reduced life from 1.0 to 0.8
                color: `rgba(${100 + Math.random() * 155}, ${100 + Math.random() * 155}, 255, 0.8)`,
                size: 2 + Math.random() * 4
            });
        }
    };

    const spawnGlitch = () => {
        // Spawn a few large graphical glitches
        let x = Math.random() * window.innerWidth;
        let y = Math.random() * window.innerHeight;

        if (previewRect) {
            x = previewRect.left + (Math.random() * previewRect.width);
            y = previewRect.top + (Math.random() * previewRect.height);
        }

        for (let i = 0; i < 3; i++) {
            particles.current.push({
                type: 'glitch',
                x: previewRect ? x : Math.random() * window.innerWidth,
                y: previewRect ? y : Math.random() * window.innerHeight,
                w: 50 + Math.random() * 200,
                h: 5 + Math.random() * 30,
                life: 0.2, // very short life
                color: `rgba(${Math.random() > 0.5 ? 255 : 0}, ${Math.random() * 255}, ${Math.random() > 0.5 ? 255 : 0}, 0.8)`
            });
        }
    };

    useEffect(() => {
        // Only active on gameplay pages OR shop/locker for preview
        const allowedPaths = ['/practice', '/placement', '/shop', '/locker'];
        if (effectType === 'default' || !allowedPaths.some(p => pathname.includes(p))) return;

        const handleInput = (e: Event) => {
            if (effectType.includes('sparks')) {
                spawnFragments();
            }
            if (effectType.includes('glitch')) {
                spawnGlitch();
            }
        };

        window.addEventListener('keydown', handleInput);

        let animationId: number;
        const render = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Update particles
            particles.current.forEach((p) => {
                if (p.type === 'spark') {
                    p.x += p.vx;
                    p.y += p.vy;
                    p.life -= 0.03;
                    p.vy += 0.2; // gravity

                    ctx.fillStyle = p.color;
                    ctx.globalAlpha = p.life;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                } else if (p.type === 'fragment') {
                    p.x += p.vx;
                    p.y += p.vy;
                    p.life -= 0.03;

                    ctx.fillStyle = p.color;
                    ctx.globalAlpha = p.life;
                    ctx.fillRect(p.x, p.y, p.size, p.size); // Square particles
                } else if (p.type === 'glitch') {
                    p.life -= 0.05;
                    ctx.fillStyle = p.color;
                    ctx.globalAlpha = p.life;
                    ctx.fillRect(p.x, p.y, p.w, p.h);
                }
            });

            // Hard limit on particles for performance
            if (particles.current.length > 50) {
                particles.current = particles.current.slice(particles.current.length - 50);
            }

            particles.current = particles.current.filter(p => p.life > 0);
            animationId = requestAnimationFrame(render);
        };
        render();

        return () => {
            window.removeEventListener('keydown', handleInput);
            cancelAnimationFrame(animationId);
        };
    }, [effectType, pathname, previewRect]); // Added previewRect dependency

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

    // Auto-spawn on effect change for preview (Shop/Locker)
    useEffect(() => {
        const isPreviewPage = ['/shop', '/locker'].some(p => pathname.includes(p));
        // ONLY spawn for previews if we have a valid rect (meaning an item is actually being hovered)
        if (isPreviewPage && effectType !== 'default' && previewRect) {
            if (effectType.includes('sparks')) spawnFragments();
            if (effectType.includes('glitch')) spawnGlitch();
        }
    }, [effectType, pathname, previewRect]);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-50"
        />
    );
}
