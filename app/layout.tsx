import localFont from 'next/font/local';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import DebugTimeWidget from '@/components/debug/DebugTimeWidget';
import { AuthProvider } from '@/components/AuthProvider';
import { InstantFamilySessionProvider } from '@/components/InstantFamilySessionProvider';
import { UserMenu } from '@/components/auth/UserMenu';
import { FamilyAppGate } from '@/components/auth/FamilyAppGate';
import { MessageNotificationBridge } from '@/components/messages/MessageNotificationBridge';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { PwaServiceWorkerRegistration } from '@/components/PwaServiceWorkerRegistration';
import Link from 'next/link';
import DashboardRouteViewPill from '@/components/dashboard/DashboardRouteViewPill';
import DashboardEditButton from '@/components/freeform-dashboard/DashboardEditButton';
import NavbarDate from '@/components/NavbarDate';
import { MainNav } from '@/components/MainNav';
import CalendarHeaderControls from '@/components/CalendarHeaderControls';
import { DashboardThemeProvider } from '@/lib/freeform-dashboard/DashboardThemeContext';
import { ThemedSidebar, ThemedMain } from '@/components/ThemedAppShell';

const inter = localFont({
    src: '../public/fonts/Inter_18pt-Regular.ttf',
    variable: '--font-inter',
    weight: '400',
    display: 'swap',
});

const interBold = localFont({
    src: '../public/fonts/Inter_18pt-Bold.ttf',
    variable: '--font-inter-bold',
    weight: '700',
    display: 'swap',
});

const interItalic = localFont({
    src: '../public/fonts/Inter_18pt-Italic.ttf',
    variable: '--font-inter-italic',
    weight: '400',
    display: 'swap',
});

const interBoldItalic = localFont({
    src: '../public/fonts/Inter_18pt-BoldItalic.ttf',
    variable: '--font-inter-bold-italic',
    weight: '700',
    display: 'swap',
});

const ebGaramond = localFont({
    src: '../public/fonts/EBGaramond-Regular.ttf',
    variable: '--font-garamond',
    weight: '400',
    display: 'swap',
});

// Inline script to patch Date before hydration starts (Time Machine dev utility)
const timeMachineScript = `
  (function() {
    try {
      var key = 'debug_time_offset';
      var stored = localStorage.getItem(key);
      var offset = stored ? parseInt(stored, 10) : 0;
      if (offset === 0 || isNaN(offset)) return;
      var RealDate = window.Date;
      window.__RealDate = RealDate;
      class MockDate extends RealDate {
        constructor(...args) {
          if (args.length === 0) { super(RealDate.now() + offset); }
          else { super(...args); }
        }
        static now() { return RealDate.now() + offset; }
      }
      window.Date = MockDate;
      console.log('[TimeMachine] ⚡ Early patch applied. Offset:', offset);
    } catch(e) {
      console.error('[TimeMachine] Failed to apply early patch:', e);
    }
  })();
`;

export const viewport: Viewport = {
    themeColor: '#ffffff',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
};

export const metadata: Metadata = {
    title: 'Family Organizer',
    description: 'Family Organizer App',
    manifest: '/manifest.json',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: 'Family Org',
    },
    formatDetection: {
        telephone: false,
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const fontVars = [
        inter.variable,
        interBold.variable,
        interItalic.variable,
        interBoldItalic.variable,
        ebGaramond.variable,
    ].join(' ');

    return (
        <html lang="en" className={fontVars}>
            <head>
                <script dangerouslySetInnerHTML={{ __html: timeMachineScript }} />
            </head>
            <body className={`${inter.className} h-screen flex overflow-hidden bg-background text-foreground overscroll-none`}>
                <InstantFamilySessionProvider>
                    <AuthProvider>
                        <DashboardThemeProvider>
                            {/* Sidebar */}
                            <ThemedSidebar>
                                {/* Logo */}
                                <div className="flex h-16 shrink-0 items-end border-b border-border/40 px-5 pb-4">
                                    <Link href="/" className="group block">
                                        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 leading-none mb-1 transition-opacity group-hover:opacity-40">
                                            Family
                                        </p>
                                        <p
                                            className="text-[17px] leading-none text-foreground tracking-tight transition-opacity group-hover:opacity-60"
                                            style={{ fontFamily: 'var(--font-garamond, Georgia, serif)', fontWeight: 500, letterSpacing: '-0.01em' }}
                                        >
                                            Organizer
                                        </p>
                                    </Link>
                                </div>

                                {/* Nav links (scrollable) */}
                                <div className="flex-1 overflow-y-auto py-6">
                                    <MainNav />
                                </div>

                                {/* Bottom: user + date */}
                                <div className="shrink-0 border-t border-border/40 px-5 py-4 flex flex-col gap-3">
                                    <NavbarDate />
                                    <div className="flex items-center justify-between gap-1">
                                        <SyncStatusBadge />
                                        <UserMenu />
                                    </div>
                                </div>
                            </ThemedSidebar>

                            {/* Right column: topbar + content */}
                            <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
                                {/* Slim topbar for page-specific controls */}
                                <div className="flex h-14 shrink-0 items-center justify-end gap-2 border-b border-border/40 bg-background px-6">
                                    <CalendarHeaderControls />
                                    <DashboardRouteViewPill />
                                    <DashboardEditButton />
                                </div>

                                <ThemedMain>
                                    <FamilyAppGate>{children}</FamilyAppGate>
                                </ThemedMain>
                            </div>

                            <Toaster />
                            <DebugTimeWidget />
                            <MessageNotificationBridge />
                            <PwaServiceWorkerRegistration />
                        </DashboardThemeProvider>
                    </AuthProvider>
                </InstantFamilySessionProvider>
            </body>
        </html>
    );
}
