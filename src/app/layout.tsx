import type { Metadata } from "next";
import { Geist, Geist_Mono, Press_Start_2P } from "next/font/google"; // Added Press Start 2P
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const pressStart2P = Press_Start_2P({
  weight: "400",
  variable: "--font-press-start",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FlashMath | Speed Math Mastery",
  description: "Master math at lightning speed with futuristic game-like practice.",
};

import { auth } from "@/auth";
import { loadData, queryOne } from "@/lib/db";
import { ITEMS } from "@/lib/items";
import { GlobalThemeManager } from "@/components/global-theme-manager";
import { AuthProvider } from "@/components/auth-provider";
import { ItemPreviewProvider } from "@/components/item-preview-provider";
import { AudioSettingsProvider } from "@/components/audio-settings-provider";
import { DevFooter } from "@/components/dev-footer";
import { SocialProvider, SocialFAB, SocialPanel } from "@/components/social";
import { AuditorProvider, AuditorPanel, AuditorFab } from "@/components/auditor";
import { Toaster } from "sonner";
import { MatchAlertProvider } from "@/components/arena/match-alert-provider";
import { PartyProvider } from "@/lib/socket/party-context";
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  let equippedItems = {};

  const db = loadData();
  const availableItems = (db.shop_items && db.shop_items.length > 0) ? db.shop_items : ITEMS;

  if (session?.user) {
    const user = queryOne("SELECT * FROM users WHERE id = ?", [(session.user as { id: string }).id]) as UserRow | null;
    if (user) {
      equippedItems = user.equipped_items || {};
    }
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${pressStart2P.variable} antialiased`} suppressHydrationWarning>
        <AuthProvider session={session}>
          <AudioSettingsProvider>
            <ItemPreviewProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="dark"
                enableSystem
                disableTransitionOnChange
              >
                <SocialProvider>
                  <PartyProvider>
                  <AuditorProvider>
                    <MatchAlertProvider>
                      <GlobalThemeManager equippedItems={equippedItems} availableItems={availableItems} />
                      {children}
                    </MatchAlertProvider>
                    {/* Social Panel - Right side */}
                    <SocialFAB />
                    <SocialPanel />
                    {/* FlashAuditor Panel - Left side */}
                    <AuditorFab />
                    <AuditorPanel />
                    <Toaster 
                    position="top-center" 
                    closeButton
                    theme="dark"
                    toastOptions={{
                      className: 'font-sans',
                      style: {
                        background: 'rgba(15, 23, 42, 0.95)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#f8fafc',
                      },
                      classNames: {
                        success: '!border-green-500/30 !text-green-400',
                        error: '!border-red-500/30 !text-red-400',
                        info: '!border-primary/30 !text-primary',
                      },
                    }}
                  />
                  </AuditorProvider>
                  </PartyProvider>
                </SocialProvider>
              </ThemeProvider>
            </ItemPreviewProvider>
          </AudioSettingsProvider>
        </AuthProvider>
        <DevFooter />
      </body>
    </html>
  );
}


