/**
 * Dev Tools Layout
 * 
 * Guards access to all /dev/* routes, ensuring they are only available
 * when ENABLE_DEV_TOOLS=true (set in docker-compose.dev.yml).
 */

import Link from 'next/link';

export default function DevLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const devToolsEnabled = process.env.ENABLE_DEV_TOOLS === 'true';
  
  if (!devToolsEnabled) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto bg-red-500/20 rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m10-6a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Dev Tools Unavailable</h1>
            <p className="text-slate-400 mb-6">Development tools are only available in the dev environment.</p>
          </div>
          <Link href="/" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900">
      <div className="bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 text-white px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-black/20 rounded font-mono text-xs">🛠️ DEV MODE</span>
            <span className="hidden sm:inline">Component Playground</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dev/teams" className="hover:underline font-medium">Teams</Link>
            <span className="text-white/50">|</span>
            <Link href="/arena/teams/match/demo?demo=true" className="hover:underline font-medium">Mock Match</Link>
            <span className="text-white/50">|</span>
            <Link href="/" className="hover:underline opacity-75">Exit</Link>
          </div>
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
