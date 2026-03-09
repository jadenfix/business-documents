import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import AppShell from "@/components/app-shell";
import "@/styles/globals.css";

const spaceGrotesk = Space_Grotesk({
    subsets: ["latin"],
    variable: "--font-ui",
});

export const metadata: Metadata = {
    title: "Permit Agent – Business Document Automation",
    description:
        "AI-powered permit research, form filling, and compliance automation. Not legal advice.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const themeInitScript = `
        (() => {
            try {
                const storedTheme = window.localStorage.getItem("permit-agent-theme");
                const theme =
                    storedTheme === "light" || storedTheme === "dark"
                        ? storedTheme
                        : window.matchMedia("(prefers-color-scheme: dark)").matches
                          ? "dark"
                          : "light";
                document.documentElement.dataset.theme = theme;
                document.documentElement.style.colorScheme = theme;
            } catch {}
        })();
    `;

    return (
        <html lang="en" className={spaceGrotesk.variable} suppressHydrationWarning>
            <body>
                <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
                <AppShell>{children}</AppShell>
            </body>
        </html>
    );
}
