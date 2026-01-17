import { MinioService } from "../services/minio.service.ts";

export type FileDescriptor = {
    id?: string;
    name?: string;
    // kunci penyimpanan/nama objek yang digunakan di MinIO
    storageKey?: string;
    objectName?: string;
    // kategori, misal: 'lampiran' atau 'tandatangan'
    jenis?: string;
    [k: string]: any;
};

/**
 * Menghapus lampiran dari penyimpanan.
 * Mengasumsikan frontend telah mengonfirmasi penghapusan.
 * Mengembalikan true jika berhasil, false jika gagal.
 */
export async function deleteAttachment(file: FileDescriptor): Promise<boolean> {
    const objectName = file.storageKey || file.objectName || file.name;
    const jenis = file.jenis || "lampiran";

    if (!objectName) return false;

    try {
        await MinioService.deleteFile(jenis, objectName);
        return true;
    } catch (err) {
        console.error("Gagal menghapus file:", err);
        return false;
    }
}

export default { deleteAttachment };
