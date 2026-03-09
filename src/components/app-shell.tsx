"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "permit-agent-theme";

function getSystemTheme(): ThemeMode {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemeMode) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
}

export default function AppShell({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const pathname = usePathname();
    const [theme, setTheme] = useState<ThemeMode>(() => {
        if (typeof document !== "undefined") {
            const activeTheme = document.documentElement.dataset.theme;
            if (activeTheme === "light" || activeTheme === "dark") {
                return activeTheme;
            }
        }

        return "light";
    });

    useEffect(() => {
        const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
        const nextTheme =
            savedTheme === "light" || savedTheme === "dark" ? savedTheme : getSystemTheme();

        setTheme(nextTheme);
        applyTheme(nextTheme);

        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleThemeChange = () => {
            if (window.localStorage.getItem(THEME_STORAGE_KEY)) {
                return;
            }

            const systemTheme = mediaQuery.matches ? "dark" : "light";
            setTheme(systemTheme);
            applyTheme(systemTheme);
        };

        mediaQuery.addEventListener("change", handleThemeChange);

        return () => {
            mediaQuery.removeEventListener("change", handleThemeChange);
        };
    }, []);

    function setThemeMode(nextTheme: ThemeMode) {
        setTheme(nextTheme);
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        applyTheme(nextTheme);
    }

    function isActive(path: string) {
        if (path === "/") {
            return pathname === "/";
        }

        return pathname.startsWith(path);
    }

    return (
        <div className="shell">
            <div className="container shell-container">
                <header className="nav-shell">
                    <Link href="/" className="nav-brand">
                        <span className="nav-brand-mark" aria-hidden="true" />
                        <span className="nav-brand-copy">
                            <span className="nav-brand-name">Permit Agent</span>
                            <span className="nav-brand-subtitle">
                                Permit operations workspace
                            </span>
                        </span>
                    </Link>

                    <div className="nav-actions">
                        <nav aria-label="Primary">
                            <ul className="nav-links">
                                <li>
                                    <Link
                                        href="/"
                                        className={`nav-link ${isActive("/") ? "active" : ""}`}
                                    >
                                        Intake
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        href="/workflows"
                                        className={`nav-link ${
                                            isActive("/workflows") ? "active" : ""
                                        }`}
                                    >
                                        Workflows
                                    </Link>
                                </li>
                            </ul>
                        </nav>

                        <div
                            className="theme-switch"
                            data-theme-mode={theme}
                            role="group"
                            aria-label="Theme mode"
                            suppressHydrationWarning
                        >
                            <button
                                type="button"
                                className={`theme-switch-option ${
                                    theme === "light" ? "active" : ""
                                }`}
                                onClick={() => setThemeMode("light")}
                                aria-pressed={theme === "light"}
                            >
                                Light
                            </button>
                            <button
                                type="button"
                                className={`theme-switch-option ${
                                    theme === "dark" ? "active" : ""
                                }`}
                                onClick={() => setThemeMode("dark")}
                                aria-pressed={theme === "dark"}
                            >
                                Dark
                            </button>
                        </div>
                    </div>
                </header>

                <div className="shell-content">{children}</div>

                <div className="disclaimer">
                    <span className="disclaimer-label">Legal Notice</span>
                    <p>
                        This tool supports permit research and document preparation. It
                        does not constitute legal advice. Review all outputs with a
                        qualified professional before submitting materials to a governing
                        authority.
                    </p>
                </div>
            </div>
        </div>
    );
}
