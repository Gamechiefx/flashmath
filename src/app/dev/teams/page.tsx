"use client";

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { 
  Play, Users, Timer, Target, Zap, Trophy, Settings, RotateCcw, ExternalLink, X, Crown, Anchor
} from 'lucide-react';

// Utility Components
const Button = ({ children, onClick, variant = 'default', size = 'md', className = '' }: { 
  children: React.ReactNode; onClick?: () => void; variant?: string; size?: string; className?: string;
}) => {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none';
  const variants: Record<string, string> = {
    default: 'bg-blue-600 hover:bg-blue-700 text-white',
    outline: 'border border-slate-600 hover:bg-slate-700 text-slate-200',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-white',
  };
  const sizes: Record<string, string> = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2', lg: 'px-6 py-3 text-lg' };
  return <button onClick={onClick} className={`${base} ${variants[variant] || variants.default} ${sizes[size] || sizes.md} ${className}`}>{children}</button>;
};

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string; }) => (
  <div className={`rounded-xl border border-slate-700 bg-slate-800/50 ${className}`}>{children}</div>
);

const Badge = ({ children, className = '' }: { children: React.ReactNode; className?: string; }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-200 ${className}`}>{children}</span>
);

const Progress = ({ value, className = '' }: { value: number; className?: string; }) => (
  <div className={`w-full bg-slate-700 rounded-full overflow-hidden h-2 ${className}`}>
    <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }}/>
  </div>
);

// Demo Components
const TeamModeEntryModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  if (!isOpen) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
        <Card className="p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">Select Team Mode</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
          <div className="space-y-3">
            <Button className="w-full justify-start gap-3" variant="outline"><Users className="h-5 w-5 text-blue-400" /><div className="text-left"><div className="font-semibold">5v5 Ranked Arena</div><div className="text-xs text-slate-400">Compete for ELO ranking</div></div></Button>
            <Button className="w-full justify-start gap-3" variant="outline"><Target className="h-5 w-5 text-green-400" /><div className="text-left"><div className="font-semibold">VS AI Practice</div><div className="text-xs text-slate-400">No ELO at stake</div></div></Button>
            <Button className="w-full justify-start gap-3" variant="outline"><Zap className="h-5 w-5 text-yellow-400" /><div className="text-left"><div className="font-semibold">Quick Match</div><div className="text-xs text-slate-400">Casual unranked</div></div></Button>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
};

const RoleVotePanel = () => (
  <Card className="p-6">
    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Crown className="h-5 w-5 text-yellow-400" />Vote for Team Leader (IGL)</h3>
    <div className="space-y-3">
      {['MathWizard42', 'NumberNinja', 'CalcKing', 'AlgebraAce', 'GeometryGuru'].map((player, i) => (
        <motion.div key={player} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white font-bold shadow-lg">{player[0]}</div>
            <div><span className="text-white font-medium">{player}</span><Badge className="ml-2">{1200 + i * 50} ELO</Badge></div>
          </div>
          <Button size="sm" variant={i === 0 ? "default" : "outline"}>{i === 0 ? "✓ Voted" : "Vote"}</Button>
        </motion.div>
      ))}
    </div>
  </Card>
);

const StrategyTimer = () => (
  <Card className="p-6">
    <div className="text-center">
      <h3 className="text-lg font-semibold text-white mb-4">Strategy Phase</h3>
      <motion.div className="text-6xl font-bold text-yellow-400 mb-4 font-mono" animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1, repeat: Infinity }}>0:45</motion.div>
      <Progress value={75} className="mb-4" />
      <p className="text-slate-300 text-sm">Discuss tactics and assign slots</p>
    </div>
  </Card>
);

const TeamFormationProgress = () => (
  <Card className="p-6">
    <h3 className="text-lg font-semibold text-white mb-4">Team Formation</h3>
    <div className="grid grid-cols-5 gap-2 mb-4">
      {[1, 2, 3, 4, 5].map((slot, i) => (
        <motion.div key={slot} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.1, type: 'spring' }} className={`aspect-square rounded-lg flex items-center justify-center font-bold text-lg ${i < 4 ? 'bg-gradient-to-br from-green-500/30 to-green-600/30 border-2 border-green-500 text-green-400' : 'bg-slate-700 border-2 border-dashed border-slate-600 text-slate-400'}`}>
          {i < 4 ? '✓' : slot}
        </motion.div>
      ))}
    </div>
    <div className="flex justify-between text-sm text-slate-300">
      <span>Players Ready: <span className="text-green-400 font-semibold">4/5</span></span>
      <span>Formation: <span className="text-blue-400 font-semibold">Standard</span></span>
    </div>
  </Card>
);

const ScoutingDashboard = () => (
  <Card className="p-6">
    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Target className="h-5 w-5 text-red-400" />Enemy Team Intel</h3>
    <div className="space-y-3">
      <div className="flex justify-between p-2 bg-slate-700/30 rounded"><span className="text-slate-400">Average ELO:</span><span className="text-white font-semibold">1,347</span></div>
      <div className="flex justify-between p-2 bg-slate-700/30 rounded"><span className="text-slate-400">Win Rate:</span><span className="text-green-400 font-semibold">73%</span></div>
      <div className="flex justify-between p-2 bg-slate-700/30 rounded"><span className="text-slate-400">Preferred Formation:</span><span className="text-white font-semibold">Aggressive</span></div>
      <div className="flex justify-between p-2 bg-red-900/20 rounded border border-red-500/30"><span className="text-slate-400">Weakness:</span><span className="text-red-400 font-semibold">Division</span></div>
    </div>
  </Card>
);

const RelayProgressBar = () => (
  <Card className="p-6">
    <h3 className="text-lg font-semibold text-white mb-4">Match Progress</h3>
    <div className="space-y-4">
      <div>
        <div className="flex justify-between text-sm text-slate-300 mb-2"><span>Round <span className="text-blue-400">2</span> of 5</span><span>Slot <span className="text-purple-400">3</span>/5</span></div>
        <Progress value={60} className="h-3" />
      </div>
      <div className="grid grid-cols-2 gap-4 text-center">
        <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/30"><div className="text-3xl font-bold text-blue-400">847</div><div className="text-xs text-slate-400">Our Score</div></div>
        <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/30"><div className="text-3xl font-bold text-red-400">723</div><div className="text-xs text-slate-400">Enemy Score</div></div>
      </div>
    </div>
  </Card>
);

const HandoffCountdown = () => (
  <Card className="p-6 text-center bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/30">
    <h3 className="text-lg font-semibold text-white mb-2">Handoff in</h3>
    <motion.div className="text-7xl font-bold text-yellow-400 mb-2" animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1, repeat: Infinity }}>3</motion.div>
    <p className="text-slate-300 text-sm">Get ready for your turn!</p>
  </Card>
);

const IGLControls = () => (
  <Card className="p-6">
    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Crown className="h-5 w-5 text-yellow-400" />IGL Controls</h3>
    <div className="grid grid-cols-2 gap-3">
      <Button variant="outline" className="flex items-center gap-2"><Timer className="h-4 w-4 text-blue-400" />Call Timeout</Button>
      <Button variant="outline" className="flex items-center gap-2"><Zap className="h-4 w-4 text-yellow-400" />Double Call-In</Button>
      <Button variant="outline" className="flex items-center gap-2"><Users className="h-4 w-4 text-green-400" />Reassign Slots</Button>
      <Button variant="outline" className="flex items-center gap-2"><Settings className="h-4 w-4 text-purple-400" />Strategy</Button>
    </div>
  </Card>
);

const AnchorAbilities = () => (
  <Card className="p-6">
    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Anchor className="h-5 w-5 text-cyan-400" />Anchor Abilities</h3>
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg"><div><div className="text-white font-semibold">Speed Boost</div><div className="text-xs text-slate-400">+2s per question</div></div><Badge className="bg-green-600/30 text-green-400">Ready</Badge></div>
      <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg"><div><div className="text-white font-semibold">Accuracy Shield</div><div className="text-xs text-slate-400">Protect from 1 wrong answer</div></div><Badge className="bg-yellow-600/30 text-yellow-400">Cooldown: 2:30</Badge></div>
    </div>
  </Card>
);

const HalftimePanel = () => (
  <Card className="p-6">
    <h3 className="text-lg font-semibold text-white mb-4">Halftime Stats</h3>
    <div className="space-y-4">
      <div className="text-center"><div className="text-3xl font-bold text-white mb-1"><span className="text-blue-400">1,247</span><span className="text-slate-500 mx-2">-</span><span className="text-red-400">1,089</span></div><div className="text-green-400 text-sm">Leading by 158 points</div></div>
      <div className="grid grid-cols-2 gap-4"><div className="text-center p-3 bg-slate-700/30 rounded-lg"><div className="text-2xl font-bold text-blue-400">87%</div><div className="text-xs text-slate-400">Team Accuracy</div></div><div className="text-center p-3 bg-slate-700/30 rounded-lg"><div className="text-2xl font-bold text-green-400">4.2s</div><div className="text-xs text-slate-400">Avg Response</div></div></div>
      <div className="text-center"><Badge className="bg-yellow-600 text-white px-3 py-1"><Trophy className="h-3 w-3 mr-1 inline" />MVP: MathWizard42</Badge></div>
    </div>
  </Card>
);

const TacticalBreakPanel = () => (
  <Card className="p-6">
    <h3 className="text-lg font-semibold text-white mb-4">Tactical Break</h3>
    <div className="space-y-4">
      <div className="text-center"><motion.div className="text-4xl font-bold text-yellow-400 mb-2" animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1, repeat: Infinity }}>0:30</motion.div><div className="text-slate-400 text-sm">Regroup and strategize</div></div>
      <div className="space-y-2"><div className="text-sm text-slate-400">Next Round Focus:</div><div className="flex gap-2 flex-wrap"><Badge className="bg-purple-600/30 text-purple-300">Multiplication</Badge><Badge className="bg-orange-600/30 text-orange-300">Speed Focus</Badge></div></div>
    </div>
  </Card>
);

const RoundByRoundChart = () => (
  <Card className="p-6">
    <h3 className="text-lg font-semibold text-white mb-4">Round Performance</h3>
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((round, i) => {
        const scores = [245, 312, 189, 278, 156];
        return (
          <motion.div key={round} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${i < 3 ? 'bg-gradient-to-br from-green-500 to-green-600 text-white' : 'bg-slate-700 text-slate-400'}`}>{round}</div>
            <div className="flex-1"><div className="flex justify-between text-sm mb-1"><span className="text-slate-400">Round {round}</span><span className={i < 3 ? 'text-green-400' : 'text-slate-500'}>{i < 3 ? `+${scores[i]}` : '—'}</span></div><div className="h-2 bg-slate-700 rounded-full overflow-hidden"><motion.div className="h-full bg-gradient-to-r from-green-500 to-emerald-400" initial={{ width: 0 }} animate={{ width: i < 3 ? `${(scores[i] / 350) * 100}%` : '0%' }} transition={{ delay: i * 0.1 + 0.2, duration: 0.5 }}/></div></div>
          </motion.div>
        );
      })}
    </div>
  </Card>
);

const RoundSummaryCard = () => (
  <Card className="p-6 bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/30">
    <h3 className="text-lg font-semibold text-white mb-4">Final Summary</h3>
    <div className="space-y-4">
      <div className="text-center"><motion.div className="text-5xl font-bold text-green-400 mb-2" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>VICTORY</motion.div><div className="text-slate-300 text-lg"><span className="text-blue-400">2,847</span><span className="mx-2">-</span><span className="text-red-400">2,156</span></div></div>
      <div className="grid grid-cols-3 gap-3 text-center"><div className="p-3 bg-slate-800/50 rounded-lg"><div className="text-xl font-bold text-white">92%</div><div className="text-xs text-slate-400">Accuracy</div></div><div className="p-3 bg-slate-800/50 rounded-lg"><div className="text-xl font-bold text-white">3.8s</div><div className="text-xs text-slate-400">Avg Time</div></div><div className="p-3 bg-green-500/20 rounded-lg border border-green-500/30"><div className="text-xl font-bold text-green-400">+47</div><div className="text-xs text-slate-400">ELO Gained</div></div></div>
    </div>
  </Card>
);

// Main Page
export default function DevTeamsPage() {
  const [activeTab, setActiveTab] = useState('mode-selection');
  const [showModeModal, setShowModeModal] = useState(false);

  const tabs = [
    { id: 'mode-selection', label: 'Mode Selection', icon: Play },
    { id: 'role-voting', label: 'Role Voting', icon: Users },
    { id: 'queue-formation', label: 'Queue & Formation', icon: Timer },
    { id: 'scouting', label: 'Scouting', icon: Target },
    { id: 'active-match', label: 'Active Match', icon: Zap },
    { id: 'match-phases', label: 'Match Phases', icon: Trophy },
    { id: 'post-match', label: 'Post-Match', icon: Settings }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'mode-selection':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-6"><h3 className="text-lg font-semibold text-white mb-4">Team Mode Entry</h3><Button onClick={() => setShowModeModal(true)} className="w-full mb-4"><Play className="mr-2 h-4 w-4" />Open Mode Selection</Button><p className="text-slate-400 text-sm">Click to see the team mode selection modal.</p></Card>
              <Card className="p-6"><h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3><div className="space-y-2"><Button variant="outline" className="w-full justify-start gap-2"><Users className="h-4 w-4 text-blue-400" />Find Team</Button><Button variant="outline" className="w-full justify-start gap-2"><Target className="h-4 w-4 text-green-400" />Practice Mode</Button><Button variant="outline" className="w-full justify-start gap-2"><Trophy className="h-4 w-4 text-yellow-400" />Ranked Queue</Button></div></Card>
            </div>
            <TeamModeEntryModal isOpen={showModeModal} onClose={() => setShowModeModal(false)} />
          </div>
        );
      case 'role-voting': return <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><RoleVotePanel /><StrategyTimer /></div>;
      case 'queue-formation': return <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><TeamFormationProgress /><ScoutingDashboard /></div>;
      case 'scouting': return <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><ScoutingDashboard /><Card className="p-6"><h3 className="text-lg font-semibold text-white mb-4">Team Comparison</h3><div className="space-y-4"><div className="flex justify-between items-center p-3 bg-blue-500/10 rounded-lg"><span className="text-slate-300">Our Team ELO:</span><span className="text-blue-400 font-bold text-xl">1,423</span></div><div className="flex justify-between items-center p-3 bg-red-500/10 rounded-lg"><span className="text-slate-300">Enemy Team ELO:</span><span className="text-red-400 font-bold text-xl">1,347</span></div><div className="text-center pt-2"><Badge className="bg-green-600 text-white px-4 py-1">Advantage: +76 ELO</Badge></div></div></Card></div>;
      case 'active-match': return <div className="space-y-6"><div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><RelayProgressBar /><HandoffCountdown /><Card className="p-6 text-center"><h3 className="text-lg font-semibold text-white mb-2">Current Question</h3><div className="text-4xl font-bold text-white mb-4 font-mono">47 × 23</div><div className="text-slate-400 text-sm">Time: <span className="text-yellow-400">12.3s</span> remaining</div></Card></div><div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><IGLControls /><AnchorAbilities /></div></div>;
      case 'match-phases': return <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><HalftimePanel /><TacticalBreakPanel /><Card className="p-6"><h3 className="text-lg font-semibold text-white mb-4">Phase Controls</h3><div className="space-y-3"><Button variant="outline" className="w-full">Skip to Halftime</Button><Button variant="outline" className="w-full">Trigger Break</Button><Button variant="outline" className="w-full">End Match</Button></div></Card></div>;
      case 'post-match': return <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><RoundByRoundChart /><RoundSummaryCard /></div>;
      default: return <div>Select a tab</div>;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h1 className="text-3xl font-bold text-white mb-2">🧪 Component Playground</h1><p className="text-slate-400">Interactive showcase of 5v5 arena components</p></div>
        <Link href="/arena/teams/match/demo?demo=true"><Button className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"><ExternalLink className="mr-2 h-4 w-4" />Launch Mock Match</Button></Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return <Button key={tab.id} onClick={() => setActiveTab(tab.id)} variant={activeTab === tab.id ? "default" : "outline"} size="sm" className="flex items-center gap-2"><Icon className="h-4 w-4" />{tab.label}</Button>;
        })}
      </div>
      <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="min-h-[500px]">{renderTabContent()}</motion.div>
      <Card className="p-4"><div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-sm"><div className="text-slate-400"><strong className="text-slate-300">Current Tab:</strong> {tabs.find(t => t.id === activeTab)?.label}</div><div className="text-slate-400"><strong className="text-slate-300">Status:</strong> All components interactive</div></div></Card>
    </div>
  );
}
