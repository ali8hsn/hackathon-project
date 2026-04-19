import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "./_components/Sidebar";
import TopNav from "./_components/TopNav";
import DemoHost from "./_components/DemoHost";
import { AppProvider } from "./_lib/store";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Siren AI — dispatch console",
  description:
    "Siren AI is an operator-facing 911 console. Live voice intake, AI triage, and situational awareness for dispatchers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} dark h-full antialiased`}
    >
      <head>
        {/* Material Symbols */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
        {/* Instrument Serif — editorial headline font */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
        {/* MapLibre GL (CDN, no API key) */}
        <link
          href="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex overflow-hidden bg-bg text-on-surface font-sans">
        <AppProvider>
          <DemoHost>
            <Sidebar />
            <div className="ml-64 flex-1 flex flex-col h-screen overflow-hidden relative z-10">
              <TopNav />
              <main className="flex-1 overflow-hidden">{children}</main>
            </div>
          </DemoHost>
        </AppProvider>
      </body>
    </html>
  );
}
