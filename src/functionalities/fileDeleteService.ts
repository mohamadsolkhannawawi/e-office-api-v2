import { MinioService } from "../services/minio.service.ts";

export type FileDescriptor = {
	id?: string;
	name?: string;
	// storage key/object name used in MinIO
	storageKey?: string;
	objectName?: string;
	// category, e.g. 'lampiran' or 'signature'
	jenis?: string;
	[k: string]: any;
};

/**
 * Delete an attachment from storage.
 * Assumes frontend already confirmed deletion.
 * Returns true on success, false on failure.
 */
export async function deleteAttachment(file: FileDescriptor): Promise<boolean> {
	const objectName = file.storageKey || file.objectName || file.name;
	const jenis = file.jenis || "lampiran";

	if (!objectName) return false;

	try {
		await MinioService.deleteFile(jenis, objectName);
		return true;
	} catch (err) {
		console.error("Failed to delete file:", err);
		return false;
	}
}

export default { deleteAttachment };

