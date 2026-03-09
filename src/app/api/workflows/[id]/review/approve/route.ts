import { success, fail, parseBody } from "@/lib/api-utils";
import { ReviewApprovalSchema } from "@/contracts";
import {
    getWorkflow,
    approveWorkflow,
    getGaps,
    getFormFills,
} from "@/lib/db/repositories";
import { inngest } from "@/lib/inngest";
import { WORKFLOW_EVENTS } from "@/contracts";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/forms";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const workflow = await getWorkflow(id);
        if (!workflow) return fail("not_found", "Workflow not found", 404);

        const body = await parseBody(req, ReviewApprovalSchema);

        // Check for blocking gaps
        const gaps = await getGaps(id);
        const blockingGaps = gaps.filter((g) => g.blocking && !g.resolvedAt);

        // Check for unapproved low-confidence fills
        if (!body.approveLowConfidence) {
            const fills = await getFormFills(id);
            const lowConfidence = fills.filter(
                (f) => f.confidence < LOW_CONFIDENCE_THRESHOLD && !f.approvedAt
            );
            if (lowConfidence.length > 0) {
                return fail(
                    "policy",
                    `${lowConfidence.length} low-confidence field(s) require explicit approval. Set approveLowConfidence to true or review each field.`,
                    422,
                    { fields: lowConfidence.map((f) => f.fieldName) }
                );
            }
        }

        if (blockingGaps.length > 0) {
            return fail(
                "policy",
                `${blockingGaps.length} blocking gap(s) must be resolved before approval`,
                422,
                { gaps: blockingGaps }
            );
        }

        await approveWorkflow(id);

        await inngest.send({
            name: WORKFLOW_EVENTS.REVIEW_APPROVED,
            data: { workflowId: id, approver: body.approver, note: body.note },
        });

        return success({ workflowId: id, status: "review.approved" });
    } catch (err) {
        console.error("[api]", err);
        return fail("internal", "An unexpected error occurred");
    }
}
