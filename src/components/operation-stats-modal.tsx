"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- Database query results use any types */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { getOperationStats } from "@/lib/actions/user";

interface OperationStatsModalProps {
    operation: string;
    isOpen: boolean;
    onClose: () => void;
}

type TabType = "sessions" | "daily" | "monthly" | "topSpeeds";

export function OperationStatsModal({ operation, isOpen, onClose }: OperationStatsModalProps) {
    const [activeTab, setActiveTab] = useState<TabType>("sessions");
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; data: any } | null>(null);

    useEffect(() => {
        if (isOpen && operation) {
            // Defer to avoid setState in effect warning
            setTimeout(() => {
                setLoading(true);
                getOperationStats(operation).then((result) => {
                    setData(result);
                    setLoading(false);
                });
            }, 0);
        }
    }, [isOpen, operation]);

    const tabs: { id: TabType; label: string }[] = [
        { id: "sessions", label: "Session Logs" },
        { id: "daily", label: "Daily Activity" },
        { id: "monthly", label: "Monthly Activity" },
        { id: "topSpeeds", label: "Top Speeds" },
    ];

    const getChartData = () => {
        if (!data) return [];
        switch (activeTab) {
            case "sessions":
                return data.sessionLogs.map((s: any) => ({
                    label: `#${s.index}`,
                    value: s.accuracy,
                    speed: s.speed,
                    date: s.date
                }));
            case "daily":
                return data.dailyActivity.map((d: any) => ({
                    label: formatDate(d.date),
                    value: d.accuracy,
                    speed: d.avgSpeed,
                    date: d.date,
                    sessions: d.sessions
                }));
            case "monthly":
                return data.monthlyActivity.map((m: any) => ({
                    label: formatMonth(m.month),
                    value: m.accuracy,
                    speed: m.avgSpeed,
                    sessions: m.sessions
                }));
            case "topSpeeds":
                return data.topSpeeds.map((t: any) => ({
                    label: `#${t.rank}`,
                    value: Math.min(100, t.speed * 20),
                    speed: t.speed,
                    accuracy: t.accuracy,
                    date: t.date,
                    isSpeedView: true
                }));
            default:
                return [];
        }
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const formatMonth = (monthStr: string) => {
        const [year, month] = monthStr.split('-');
        return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    };

    const formatTooltipDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }).replace(',', '');
    };

    if (!isOpen) return null;

    const chartData = getChartData();
    const chartHeight = 180;
    const viewBoxWidth = 1000;
    // Increased top padding (40px) to give more room for the "100" line
    const topPadding = 40;
    const drawingHeight = chartHeight - topPadding - 10;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

                {/* TOOLTIP MOVED TO ROOT - BYPASSING ANY MODAL TRANSFORMS */}
                {hoveredPoint && (
                    <div
                        className="fixed z-[100] bg-[#0f172a]/95 border border-cyan-500/30 rounded-lg p-3 shadow-2xl pointer-events-none transform -translate-x-1/2 -translate-y-full mb-6"
                        style={{
                            left: hoveredPoint.x,
                            top: hoveredPoint.y,
                            width: '140px'
                        }}
                    >
                        <div className="text-cyan-400 font-bold mb-2 text-sm border-b border-white/10 pb-1">
                            {hoveredPoint.data.date ? formatTooltipDate(hoveredPoint.data.date) : hoveredPoint.data.label}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                                <div className="text-slate-400 uppercase tracking-wider text-[10px]">Speed</div>
                                <div className="text-white font-mono">{hoveredPoint.data.speed?.toFixed(2)}s</div>
                            </div>
                            <div>
                                <div className="text-slate-400 uppercase tracking-wider text-[10px]">Acc</div>
                                <div className="text-white font-mono">
                                    {(hoveredPoint.data.accuracy ?? hoveredPoint.data.value)?.toFixed(0)}%
                                </div>
                            </div>
                        </div>
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-[#0f172a] border-r border-b border-cyan-500/30"></div>
                    </div>
                )}

                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="relative w-full max-w-4xl z-10"
                    onClick={(e) => e.stopPropagation()}
                >
                    <GlassCard className="p-6 space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-black uppercase tracking-tighter">{operation} Details</h2>
                                <p className="text-sm text-muted-foreground">
                                    {data?.totalSessions || 0} total sessions
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mr-2">VIEW BY</span>
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`px-4 py-2 text-sm font-bold transition-colors rounded-lg ${activeTab === tab.id
                                        ? "bg-cyan-500/20 text-cyan-400"
                                        : "text-muted-foreground hover:text-white hover:bg-white/5"
                                        }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="relative h-[220px] rounded-xl border border-cyan-500/10 bg-[#0f172a]/50 overflow-hidden">
                            {/* SVG COVERS ENTIRE AREA FOR PERFECT ALIGNMENT */}
                            <div className="absolute inset-0 top-6 bottom-10 left-4 right-4">
                                <svg
                                    width="100%"
                                    height="100%"
                                    viewBox={`0 0 ${viewBoxWidth} ${chartHeight}`}
                                    preserveAspectRatio="none"
                                    className="block overflow-visible"
                                >
                                    {/* Y-Axis Labels inside SVG */}
                                    {[0, 25, 50, 75, 100].map((val) => {
                                        const y = chartHeight - 10 - ((val / 100) * drawingHeight);
                                        return (
                                            <g key={val}>
                                                <text
                                                    x="0"
                                                    y={y}
                                                    dominantBaseline="middle"
                                                    className="fill-slate-500 text-[24px] font-black select-none"
                                                    style={{ fontSize: '24px' }}
                                                >
                                                    {val}
                                                </text>
                                                {/* Grid Line matching exact Y */}
                                                <line
                                                    x1="60"
                                                    y1={y}
                                                    x2={viewBoxWidth}
                                                    y2={y}
                                                    stroke="rgba(148, 163, 184, 0.1)"
                                                    strokeDasharray="4"
                                                />
                                            </g>
                                        );
                                    })}

                                    <defs>
                                        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="rgb(34, 211, 238)" stopOpacity="0.2" />
                                            <stop offset="100%" stopColor="rgb(34, 211, 238)" stopOpacity="0" />
                                        </linearGradient>
                                        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                            <feGaussianBlur stdDeviation="3" result="blur" />
                                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                        </filter>
                                    </defs>

                                    {/* Graph starts at x=60 to not overlap labels */}
                                    {chartData.length > 1 ? (
                                        <>
                                            <path
                                                d={`
                                                    M 60 ${chartHeight - 10 - (Math.min(100, Math.max(0, chartData[0]?.value || 0)) / 100) * drawingHeight}
                                                    ${chartData.map((d: any, i: number) => {
                                                    const x = 60 + (i / (chartData.length - 1)) * (viewBoxWidth - 60);
                                                    const y = chartHeight - 10 - (Math.min(100, Math.max(0, d.value)) / 100) * drawingHeight;
                                                    return `L ${x} ${y}`;
                                                }).join(' ')}
                                                    L ${viewBoxWidth} ${chartHeight}
                                                    L 60 ${chartHeight}
                                                    Z
                                                `}
                                                fill="url(#chartGradient)"
                                            />
                                            <path
                                                d={`M 60 ${chartHeight - 10 - (Math.min(100, Math.max(0, chartData[0]?.value || 0)) / 100) * drawingHeight} ${chartData.map((d: any, i: number) => {
                                                    const x = 60 + (i / (chartData.length - 1)) * (viewBoxWidth - 60);
                                                    const y = chartHeight - 10 - (Math.min(100, Math.max(0, d.value)) / 100) * drawingHeight;
                                                    return `L ${x} ${y}`;
                                                }).join(' ')}`}
                                                fill="none"
                                                stroke="rgb(34, 211, 238)"
                                                strokeWidth="2"
                                                filter="url(#glow)"
                                            />
                                        </>
                                    ) : null}

                                    {chartData.map((d: any, i: number) => {
                                        const x = chartData.length > 1 ? 60 + (i / (chartData.length - 1)) * (viewBoxWidth - 60) : 60 + (viewBoxWidth - 60) / 2;
                                        const y = chartHeight - 10 - (Math.min(100, Math.max(0, d.value)) / 100) * drawingHeight;
                                        return (
                                            <g key={i}>
                                                <circle
                                                    cx={x}
                                                    cy={y}
                                                    r="25"
                                                    fill="transparent"
                                                    className="cursor-pointer"
                                                    onMouseEnter={(e) => {
                                                        setHoveredPoint({ x: e.clientX, y: e.clientY, data: d });
                                                    }}
                                                    onMouseMove={(e) => {
                                                        setHoveredPoint({ x: e.clientX, y: e.clientY, data: d });
                                                    }}
                                                    onMouseLeave={() => setHoveredPoint(null)}
                                                />
                                                <circle
                                                    cx={x}
                                                    cy={y}
                                                    r="4"
                                                    fill="#0f172a"
                                                    stroke="rgb(34, 211, 238)"
                                                    strokeWidth="2"
                                                    className="pointer-events-none"
                                                />
                                            </g>
                                        );
                                    })}
                                </svg>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button className="text-xs font-bold uppercase tracking-widest text-cyan-400 hover:text-cyan-300 transition-colors">
                                View More Details
                            </button>
                        </div>
                    </GlassCard>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
