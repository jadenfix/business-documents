import { Inngest } from "inngest";

export const inngest = new Inngest({
    id: "business-documents",
    eventKey: process.env.INNGEST_EVENT_KEY,
});
