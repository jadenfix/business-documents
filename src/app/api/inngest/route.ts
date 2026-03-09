import { serve } from "inngest/next";
import { inngest, allFunctions } from "@/lib/inngest";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: allFunctions,
});
