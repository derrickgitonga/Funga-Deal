import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Funga Deal — Secure Escrow for Kenya",
    description: "M-Pesa powered escrow platform. Trade safely with Funga Deal.",
};

import { UserProvider } from '@auth0/nextjs-auth0/client';

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>
                <UserProvider>
                    {children}
                </UserProvider>
            </body>
        </html>
    );
}
