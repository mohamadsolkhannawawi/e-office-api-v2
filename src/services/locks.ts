import { Verrou } from "@verrou/core";
import { memoryStore } from "@verrou/core/drivers/memory";
import { config } from "../config.ts";

// Inisialisasi lock manager global untuk sinkronisasi proses kritikal.
// Store aktif mengikuti konfigurasi `LOCK_STORE`, dengan fallback memory store.
export const verrou = new Verrou({
  default: config.LOCK_STORE,
  stores: {
    memory: { driver: memoryStore() },
  },
});
