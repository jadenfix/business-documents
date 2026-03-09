import { NextResponse } from "next/server";
import { ZodError } from "zod";

/* ---------- Error taxonomy ---------- */
export type ErrorCategory =
    | "validation"
    | "not_found"
    | "dependency"
    | "policy"
    | "processing"
    | "internal";

export class AppError extends Error {
    constructor(
        public category: ErrorCategory,
        message: string,
        public statusCode = 500
    ) {
        super(message);
        this.name = "AppError";
    }
}

/* ---------- Standardized envelope ---------- */
interface ApiEnvelope<T = unknown> {
    ok: boolean;
    data?: T;
    error?: { category: ErrorCategory; message: string; details?: unknown };
    meta?: { correlationId: string; timestamp: string };
}

export function success<T>(data: T, status = 200): NextResponse<ApiEnvelope<T>> {
    return NextResponse.json(
        {
            ok: true,
            data,
            meta: {
                correlationId: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
            },
        },
        { status }
    );
}

export function fail(
    category: ErrorCategory,
    message: string,
    status = 500,
    details?: unknown
): NextResponse<ApiEnvelope> {
    return NextResponse.json(
        {
            ok: false,
            error: { category, message, details },
            meta: {
                correlationId: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
            },
        },
        { status }
    );
}

/* ---------- Route handler wrapper ---------- */
type RouteContext = {
    params: Promise<Record<string, string | string[]>>;
};

export function handler(
    fn: (req: Request, ctx: RouteContext) => Promise<NextResponse>
) {
    return async (req: Request, ctx: RouteContext) => {
        try {
            return await fn(req, ctx);
        } catch (err) {
            if (err instanceof ZodError) {
                return fail("validation", "Invalid request body", 400, err.flatten());
            }
            if (err instanceof AppError) {
                return fail(err.category, err.message, err.statusCode);
            }
            console.error("[api]", err);
            return fail("internal", "An unexpected error occurred");
        }
    };
}

/* ---------- Body parser ---------- */
export async function parseBody<T>(req: Request, schema: { parse: (v: unknown) => T }): Promise<T> {
    const raw = await req.json().catch(() => {
        throw new AppError("validation", "Request body must be valid JSON", 400);
    });
    return schema.parse(raw);
}
