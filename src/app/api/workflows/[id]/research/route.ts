import { fail, success } from "@/lib/api-utils";
import {
    getCitationsForWorkflow,
    getRequirements,
    getWorkflow,
} from "@/lib/db/repositories";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const workflow = await getWorkflow(id);
        if (!workflow) {
            return fail("not_found", "Workflow not found", 404);
        }

        const [requirements, citations] = await Promise.all([
            getRequirements(id),
            getCitationsForWorkflow(id),
        ]);

        return success({
            workflowId: id,
            requirements,
            citations,
        });
    } catch (error) {
        console.error("[api]", error);
        return fail("internal", "An unexpected error occurred");
    }
}
