type DroppedFile = {
    name: string;
    size?: number;
    type?: string;
    url?: string; // optional publicly-accessible URL
    // other fields allowed
};

export type PreviewType = "pdf" | "image" | "unsupported";

export type PreviewHandle = {
    type: PreviewType;
    url: string;
    /**
     * Close the preview and release any resources (e.g. revoke object URL).
     */
    close: () => void;
};

function getExtension(name = "") {
    const m = String(name).match(/\.([^.]+)$/);
    return m && m[1] ? m[1].toLowerCase() : "";
}

function detectTypeByNameOrMime(item: DroppedFile): PreviewType {
    const ext = getExtension(item.name || "");
    const mime = (item.type || "").toLowerCase();

    if (ext === "pdf" || mime.includes("pdf")) return "pdf";
    // support JPG and PNG only
    if (ext === "jpg" || ext === "png" || mime.includes("image/")) return "image";

    return "unsupported";
}

/**
 * Open a preview for a dropped file.
 * - If `file.url` exists it will be used directly.
 * - If a browser File object is provided (client-side), it will create an object URL and return a closer to revoke it.
 * - On Node (server) without a url the preview will be unsupported.
 */
export function openFilePreview(file: File | DroppedFile): PreviewHandle {
    // If caller provided a pre-existing URL (e.g., stored file), use it.
    const asDropped: DroppedFile = (file as DroppedFile) || ({} as DroppedFile);

    if ((asDropped as any).url && typeof (asDropped as any).url === "string") {
        const type = detectTypeByNameOrMime(asDropped as DroppedFile);
        return { type, url: (asDropped as any).url, close: () => {} };
    }

    // Browser: actual File object -> createObjectURL
    if (typeof globalThis !== "undefined" && typeof (globalThis as any).window !== "undefined" && typeof URL !== "undefined" && (file as any) instanceof File) {
        const blobUrl = URL.createObjectURL(file as File);
        const df: DroppedFile = { name: (file as File).name, type: (file as File).type };
        const type = detectTypeByNameOrMime(df);
        return { type, url: blobUrl, close: () => { try { URL.revokeObjectURL(blobUrl); } catch {} } };
    }

    // Fallback: try to build URL from name if it looks like a path 
    const type = detectTypeByNameOrMime(asDropped as DroppedFile);
    return { type, url: "", close: () => {} };
}

export default { openFilePreview };
