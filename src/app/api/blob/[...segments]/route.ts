import { NextResponse } from "next/server";
import { readBlob } from "@/lib/blob";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ segments: string[] }> }
) {
    const { segments } = await params;
    const pathname = segments.join("/");

    try {
        const blob = await readBlob(pathname);
        return new NextResponse(blob.data, {
            status: 200,
            headers: {
                "Content-Type": blob.contentType,
                "Cache-Control": "no-store",
            },
        });
    } catch {
        return NextResponse.json(
            {
                ok: false,
                error: {
                    category: "not_found",
                    message: "Blob not found",
                },
            },
            { status: 404 }
        );
    }
}
