import { success, fail } from "@/lib/api-utils";
import { getWorkflow, getFormFills, getFormTemplates } from "@/lib/db/repositories";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const workflow = await getWorkflow(id);
        if (!workflow) return fail("not_found", "Workflow not found", 404);

        const [templates, fills] = await Promise.all([
            getFormTemplates(id),
            getFormFills(id),
        ]);

        return success({ workflowId: id, templates, fills });
    } catch (err) {
        console.error("[api]", err);
        return fail("internal", "An unexpected error occurred");
    }
}
