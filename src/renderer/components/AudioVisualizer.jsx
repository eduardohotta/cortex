import React, { useEffect, useRef } from 'react';
import { Speaker, Mic } from 'lucide-react';
import clsx from 'clsx';

export function AudioVisualizer({ level, className, width = 60, height = 24, type = 'input' }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, width, height);

        const bars = 10;
        const spacing = 3;
        const barWidth = (width - (bars - 1) * spacing) / bars;

        // Colors: Vibrant blue for activity, dim gray for silence
        const activeColor = type === 'output' ? '#a855f7' : '#3b82f6'; // Purple for system, Blue for mic
        ctx.fillStyle = level > 5 ? activeColor : '#27272a';

        for (let i = 0; i < bars; i++) {
            const centerOffset = Math.abs(i - (bars / 2)) / (bars / 2);
            const waveFactor = 1 - centerOffset;

            let h = 2;
            if (level > 2) {
                // Living wave logic
                const jitter = level > 10 ? (Math.sin(Date.now() / 100 + i) * 3) : 0;
                h = Math.min(height, Math.max(2, (level / 50) * height * waveFactor + jitter));
            }

            const x = i * (barWidth + spacing);
            const y = (height - h) / 2;

            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(x, y, barWidth, h, 2);
            } else {
                ctx.rect(x, y, barWidth, h);
            }
            ctx.fill();
        }
    }, [level, width, height, type]);

    return (
        <div className={clsx("flex items-center gap-2", className)}>
            <div className="flex flex-col items-center">
                <canvas
                    ref={canvasRef}
                    style={{ width: `${width}px`, height: `${height}px` }}
                />
            </div>
            {level > 10 && (
                <div className="animate-in fade-in zoom-in duration-300">
                    {type === 'output' ? (
                        <Speaker size={12} className="text-purple-400" />
                    ) : (
                        <Mic size={12} className="text-blue-400" />
                    )}
                </div>
            )}
        </div>
    );
}
