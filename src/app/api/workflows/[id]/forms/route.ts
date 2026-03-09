import { fail, success } from "@/lib/api-utils";
import {
    getFormFills,
    getFormTemplatesWithFields,
    getReviewDecisions,
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

        const [templates, fills, reviewDecisions] = await Promise.all([
            getFormTemplatesWithFields(id),
            getFormFills(id),
            getReviewDecisions(id),
        ]);

        return success({
            workflowId: id,
            templates: templates.map(({ template, fields }) => ({
                ...template,
                fields,
                fills: fills.filter((fill) => fill.templateId === template.id),
            })),
            fills,
            reviewDecisions,
        });
    } catch (error) {
        console.error("[api]", error);
        return fail("internal", "An unexpected error occurred");
    }
}
