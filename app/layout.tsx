import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "./_components/Sidebar";
import TopNav from "./_components/TopNav";
import { AppProvider } from "./_lib/store";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Siren — Voice intake & dispatch intelligence",
  description:
    "Siren unifies live 911 voice intake with AI dispatch monitoring, triage, and situational awareness.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} dark h-full antialiased`}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex overflow-hidden bg-bg text-on-surface font-sans">
        <AppProvider>
          <Sidebar />
          <div className="ml-64 flex-1 flex flex-col h-screen overflow-hidden">
            <TopNav />
            <main className="flex-1 overflow-hidden">{children}</main>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
