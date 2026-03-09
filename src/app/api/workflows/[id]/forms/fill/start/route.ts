import { success, fail } from "@/lib/api-utils";
import { getWorkflow } from "@/lib/db/repositories";
import { inngest } from "@/lib/inngest";
import { WORKFLOW_EVENTS } from "@/contracts";

export async function POST(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const workflow = await getWorkflow(id);
        if (!workflow) return fail("not_found", "Workflow not found", 404);

        await inngest.send({
            name: WORKFLOW_EVENTS.FORMS_FILL_STARTED,
            data: { workflowId: id },
        });

        return success({ workflowId: id, status: "forms.fill.started" });
    } catch (err) {
        console.error("[api]", err);
        return fail("internal", "An unexpected error occurred");
    }
}
