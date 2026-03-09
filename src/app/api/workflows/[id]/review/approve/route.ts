import { WORKFLOW_EVENTS, ReviewApprovalSchema } from "@/contracts";
import { fail, parseBody, success } from "@/lib/api-utils";
import {
    addWorkflowReviewDecision,
    approveFormFills,
    approveWorkflow,
    getFormFills,
    getWorkflow,
} from "@/lib/db/repositories";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/forms";
import { isInngestConfigured, sendEvent } from "@/lib/inngest/client";
import { recomputeWorkflowGaps } from "@/lib/workflows";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const workflow = await getWorkflow(id);
        if (!workflow) {
            return fail("not_found", "Workflow not found", 404);
        }

        const body = await parseBody(req, ReviewApprovalSchema);
        const fills = await getFormFills(id);
        const lowConfidence = fills.filter(
            (fill) => fill.confidence < LOW_CONFIDENCE_THRESHOLD && !fill.approvedAt
        );

        if (lowConfidence.length > 0 && !body.approveLowConfidence) {
            return fail(
                "policy",
                `${lowConfidence.length} low-confidence field(s) require explicit approval.`,
                422,
                { fields: lowConfidence.map((fill) => fill.fieldName) }
            );
        }

        if (body.approveLowConfidence && lowConfidence.length > 0) {
            await approveFormFills(
                id,
                lowConfidence.map((fill) => fill.id),
                body.approver,
                body.note
            );
        }

        const gaps = await recomputeWorkflowGaps(id);
        const blockingGaps = gaps.filter((gap) => gap.blocking);

        if (blockingGaps.length > 0) {
            return fail(
                "policy",
                `${blockingGaps.length} blocking gap(s) must be resolved before approval`,
                422,
                { gaps: blockingGaps }
            );
        }

        await approveWorkflow(id);
        await addWorkflowReviewDecision(id, body.approver, body.note);

        if (isInngestConfigured()) {
            await sendEvent({
                name: WORKFLOW_EVENTS.REVIEW_APPROVED,
                data: {
                    workflowId: id,
                    approver: body.approver,
                    note: body.note,
                },
            });
        }

        return success({
            workflowId: id,
            status: "review.approved",
        });
    } catch (error) {
        console.error("[api]", error);
        return fail("internal", "An unexpected error occurred");
    }
}
