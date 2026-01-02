
"use client";

import React, { useEffect, useRef } from 'react';

interface Particle {
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    char: string;
    size: number;
    speed: number;
    opacity: number;
}

export const BridgeAnimation: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let particles: Particle[] = [];
        let width = 120;
        let height = 60;

        const setup = () => {
            canvas.width = width;
            canvas.height = height;
            particles = [];

            // Define bridge shape points
            const points: { x: number, y: number }[] = [];

            // Towers
            for (let y = 10; y < 50; y += 4) {
                points.push({ x: 30, y });
                points.push({ x: 90, y });
            }

            // Deck
            for (let x = 10; x < 110; x += 4) {
                points.push({ x, y: 40 });
            }

            // Main Cable (Hanging)
            for (let x = 30; x <= 90; x += 3) {
                const normalizedX = (x - 60) / 30; // -1 to 1
                // Hanging: High at towers, dips in center
                const y = 15 + (1 - (normalizedX * normalizedX)) * 25;
                points.push({ x, y });
            }

            // Create particles
            points.forEach(p => {
                particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    targetX: p.x,
                    targetY: p.y,
                    char: Math.random() > 0.5 ? '0' : '1',
                    size: 8,
                    speed: 0.02 + Math.random() * 0.03,
                    opacity: 0
                });
            });
        };

        const draw = () => {
            ctx.clearRect(0, 0, width, height);
            ctx.font = 'bold 8px monospace';

            particles.forEach(p => {
                // Coalesce effect
                p.x += (p.targetX - p.x) * p.speed;
                p.y += (p.targetY - p.y) * p.speed;

                if (p.opacity < 0.8) p.opacity += 0.01;

                ctx.fillStyle = `rgba(0, 0, 0, ${p.opacity})`; // Black
                ctx.fillText(p.char, p.x, p.y);
            });

            animationFrameId = requestAnimationFrame(draw);
        };

        setup();
        draw();

        return () => cancelAnimationFrame(animationFrameId);
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="h-[60px] w-[120px]"
            title="Enholm Heuristics Bridge"
        />
    );
};
