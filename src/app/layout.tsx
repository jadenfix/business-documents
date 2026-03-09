import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
    title: "Permit Agent – Business Document Automation",
    description:
        "AI-powered permit research, form filling, and compliance automation. Not legal advice.",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body>
                <div className="container">
                    <nav className="nav">
                        <a href="/" className="nav-brand">
                            ⚡ Permit Agent
                        </a>
                        <ul className="nav-links">
                            <li>
                                <a href="/">Intake</a>
                            </li>
                            <li>
                                <a href="/workflows">Workflows</a>
                            </li>
                        </ul>
                    </nav>
                    {children}
                    <div className="disclaimer">
                        ⚠️ <strong>Legal Disclaimer:</strong> This tool provides automation
                        support for permit research and document processing. It does not
                        constitute legal advice. All outputs should be reviewed by qualified
                        professionals before submission to governing authorities.
                    </div>
                </div>
            </body>
        </html>
    );
}
