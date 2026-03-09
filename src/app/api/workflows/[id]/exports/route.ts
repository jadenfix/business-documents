import path from "node:path";
import { fail, success } from "@/lib/api-utils";
import { listBlobs } from "@/lib/blob";
import { getExports, getWorkflow } from "@/lib/db/repositories";

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

        const exports = await getExports(id);
        const hydrated = await Promise.all(
            exports.map(async (item) => {
                const prefix = path.posix.dirname(item.manifestPath);
                const files = await listBlobs(prefix);

                return {
                    ...item,
                    files,
                    downloadUrl:
                        files.find((file) => file.pathname === item.blobPath)?.downloadUrl ?? null,
                };
            })
        );

        return success({
            workflowId: id,
            exports: hydrated,
        });
    } catch (error) {
        console.error("[api]", error);
        return fail("internal", "An unexpected error occurred");
    }
}
