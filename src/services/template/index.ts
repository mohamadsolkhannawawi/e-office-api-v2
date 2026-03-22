// Barrel file untuk mengekspor seluruh service dan tipe pada modul template.
// Memudahkan import dari satu entry point tanpa mengakses file internal satu per satu.
export {
  DocumentTemplateService,
  type TemplateData,
  type DigitalFeatures,
} from "./DocumentTemplateService.js";
export {
  SuratRekomendasiTemplateService,
  type SuratRekomendasiData,
} from "./SuratRekomendasiTemplateService.js";
