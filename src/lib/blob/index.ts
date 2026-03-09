import { put, list, del } from "@vercel/blob";

export async function uploadBlob(path: string, data: Buffer | ReadableStream | string, contentType: string) {
    const blob = await put(path, data, {
        access: "public",
        contentType,
        addRandomSuffix: false,
    });
    return blob;
}

export async function listBlobs(prefix: string) {
    const result = await list({ prefix });
    return result.blobs;
}

export async function deleteBlob(url: string) {
    await del(url);
}
