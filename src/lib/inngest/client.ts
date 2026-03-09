import { Inngest } from "inngest";

export const inngest = new Inngest({
    id: "business-documents",
    eventKey: process.env.INNGEST_EVENT_KEY,
});

export function isInngestConfigured() {
    return Boolean(process.env.INNGEST_EVENT_KEY);
}

export async function sendEvent<T extends Record<string, unknown>>(event: {
    name: string;
    data: T;
}) {
    if (!isInngestConfigured()) {
        return null;
    }

    return inngest.send(event);
}
