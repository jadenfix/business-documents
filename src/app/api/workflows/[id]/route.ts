import { NextResponse } from "next/server";
import { success, fail } from "@/lib/api-utils";
import { getWorkflow, getWorkflowTimeline } from "@/lib/db/repositories";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const workflow = await getWorkflow(id);
        if (!workflow) return fail("not_found", "Workflow not found", 404);
        const timeline = await getWorkflowTimeline(id);
        return success({ workflow, timeline });
    } catch (err) {
        console.error("[api]", err);
        return fail("internal", "An unexpected error occurred");
    }
}
