import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Funga Deal — Secure Escrow for Kenya",
    description: "M-Pesa powered escrow platform. Trade safely with Funga Deal.",
};

import { ClerkProvider } from '@clerk/nextjs';

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <ClerkProvider>
            <html lang="en" suppressHydrationWarning>
                <body suppressHydrationWarning>
                    {children}
                </body>
            </html>
        </ClerkProvider>
    );
}
