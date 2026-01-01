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
import { SessionGuard } from "@/components/session-guard";
import { DevFooter } from "@/components/dev-footer";
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
    const user = queryOne("SELECT * FROM users WHERE id = ?", [(session.user as any).id]) as any;
    if (user) {
      equippedItems = user.equipped_items || {};
    }
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${pressStart2P.variable} antialiased`}>
        <AuthProvider session={session}>
          <AudioSettingsProvider>
            <ItemPreviewProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="dark"
                enableSystem
                disableTransitionOnChange
              >
                <GlobalThemeManager equippedItems={equippedItems} availableItems={availableItems} />
                {children}
              </ThemeProvider>
            </ItemPreviewProvider>
          </AudioSettingsProvider>
        </AuthProvider>
        <DevFooter />
      </body>
    </html>
  );
}


