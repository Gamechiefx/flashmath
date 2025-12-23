"use client";

import { useEffect, useRef } from "react";

export function Starfield() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let width = window.innerWidth;
        let height = window.innerHeight;

        const setSize = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;
        };

        setSize();
        window.addEventListener("resize", setSize);

        // Star properties
        const seeds = Array.from({ length: 150 }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            size: Math.random() * 2 + 0.5,
            blinkSpeed: Math.random() * 0.05 + 0.01,
            blinkOffset: Math.random() * Math.PI * 2,
            type: Math.random() > 0.9 ? 'blue' : 'white'
        }));

        let time = 0;
        let animationFrame: number;

        const render = () => {
            time += 0.05;
            ctx.clearRect(0, 0, width, height);

            // Draw Stars
            seeds.forEach(star => {
                const blink = Math.sin(time * star.blinkSpeed + star.blinkOffset);
                const alpha = (blink + 1) / 2 * 0.8 + 0.2; // 0.2 to 1.0 opacity

                ctx.beginPath();
                ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);

                if (star.type === 'blue') {
                    ctx.fillStyle = `rgba(100, 149, 237, ${alpha})`;
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = `rgba(100, 149, 237, ${alpha})`;
                } else {
                    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                    ctx.shadowBlur = 4;
                    ctx.shadowColor = `rgba(255, 255, 255, ${alpha})`;
                }

                ctx.fill();
                ctx.shadowBlur = 0;
            });

            // Occasional Shooting Star
            if (Math.random() < 0.005) {
                // Implement later if needed taking up CPU?
            }

            animationFrame = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener("resize", setSize);
            cancelAnimationFrame(animationFrame);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-[-1]"
            style={{ background: 'transparent' }} // Let the CSS background color show through
        />
    );
}
