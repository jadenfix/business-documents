import { del, list, put } from "@vercel/blob";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface BlobObject {
    url: string;
    pathname: string;
    downloadUrl: string;
    size: number;
    contentType?: string;
}

const localBlobRoot = path.join(process.cwd(), ".local", "blob");

function useLocalBlobStorage() {
    return !process.env.BLOB_READ_WRITE_TOKEN;
}

function getLocalBlobPath(pathname: string) {
    return path.join(localBlobRoot, pathname);
}

function inferContentType(pathname: string) {
    if (pathname.endsWith(".json")) return "application/json";
    if (pathname.endsWith(".md")) return "text/markdown";
    if (pathname.endsWith(".pdf")) return "application/pdf";
    if (pathname.endsWith(".zip")) return "application/zip";
    return "application/octet-stream";
}

async function toBuffer(data: Buffer | ReadableStream | string) {
    if (typeof data === "string") return Buffer.from(data);
    if (Buffer.isBuffer(data)) return data;

    const arrayBuffer = await new Response(data).arrayBuffer();
    return Buffer.from(arrayBuffer);
}

async function walkLocalBlobs(dir: string, prefix = ""): Promise<BlobObject[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const results: BlobObject[] = [];

    for (const entry of entries) {
        const relativePath = path.posix.join(prefix, entry.name);
        const absolutePath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            results.push(...(await walkLocalBlobs(absolutePath, relativePath)));
            continue;
        }

        const stats = await fs.stat(absolutePath);
        const downloadUrl = `/api/blob/${relativePath}`;

        results.push({
            url: downloadUrl,
            pathname: relativePath,
            downloadUrl,
            size: stats.size,
            contentType: inferContentType(relativePath),
        });
    }

    return results;
}

export async function uploadBlob(
    pathname: string,
    data: Buffer | ReadableStream | string,
    contentType: string
) {
    if (useLocalBlobStorage()) {
        const buffer = await toBuffer(data);
        const absolutePath = getLocalBlobPath(pathname);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, buffer);

        return {
            url: `/api/blob/${pathname}`,
            pathname,
            downloadUrl: `/api/blob/${pathname}`,
            size: buffer.length,
            contentType,
        };
    }

    const blob = await put(pathname, data, {
        access: "public",
        contentType,
        addRandomSuffix: false,
    });

    return {
        url: blob.url,
        pathname: blob.pathname,
        downloadUrl: blob.downloadUrl ?? blob.url,
        size: blob.size,
        contentType,
    };
}

export async function listBlobs(prefix: string) {
    if (useLocalBlobStorage()) {
        const blobs = await walkLocalBlobs(localBlobRoot);
        return blobs.filter((blob) => blob.pathname.startsWith(prefix));
    }

    const result = await list({ prefix });
    return result.blobs.map((blob) => ({
        url: blob.url,
        pathname: blob.pathname,
        downloadUrl: blob.downloadUrl ?? blob.url,
        size: blob.size,
        contentType: blob.contentType,
    }));
}

export async function readBlob(pathname: string) {
    if (useLocalBlobStorage()) {
        const absolutePath = getLocalBlobPath(pathname);
        const data = await fs.readFile(absolutePath);
        return {
            data,
            contentType: inferContentType(pathname),
        };
    }

    const blobs = await listBlobs(pathname);
    const match = blobs.find((blob) => blob.pathname === pathname);
    if (!match) {
        throw new Error(`Blob not found: ${pathname}`);
    }

    const response = await fetch(match.downloadUrl);
    if (!response.ok) {
        throw new Error(`Failed to read blob: ${pathname}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
        data: Buffer.from(arrayBuffer),
        contentType: response.headers.get("content-type") ?? inferContentType(pathname),
    };
}

export async function deleteBlob(target: string) {
    if (useLocalBlobStorage()) {
        const pathname = target.startsWith("/api/blob/") ? target.replace("/api/blob/", "") : target;
        await fs.rm(getLocalBlobPath(pathname), { force: true });
        return;
    }

    await del(target);
}
