import type { Metadata } from "next";
import Link from "next/link";
import { Space_Grotesk } from "next/font/google";
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
    return (
        <html lang="en" className={spaceGrotesk.variable}>
            <body>
                <div className="container">
                    <nav className="nav">
                        <Link href="/" className="nav-brand">
                            Permit Agent
                        </Link>
                        <ul className="nav-links">
                            <li>
                                <Link href="/">Intake</Link>
                            </li>
                            <li>
                                <Link href="/workflows">Workflows</Link>
                            </li>
                            <li>
                                <Link href="/">New Chat</Link>
                            </li>
                        </ul>
                    </nav>
                    {children}
                    <div className="disclaimer">
                        <strong>Legal Disclaimer:</strong> This tool provides automation
                        support for permit research and document processing. It does not
                        constitute legal advice. All outputs should be reviewed by qualified
                        professionals before submission to governing authorities.
                    </div>
                </div>
            </body>
        </html>
    );
}
