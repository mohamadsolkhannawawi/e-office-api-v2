// generateService.ts - Generator untuk membuat file service dari model Prisma
// Script ini secara otomatis membuat boilerplate service class dengan CRUD operations

import * as fs from "fs";
import * as path from "path";

// [KONFIGURASI] Path dan settings utama
const BASE_PATH: string = path.join(
  process.cwd(),
  "src",
  "services",
  "database_models",
);
const CRUD_PATH: string = "./__basicCRUD.ts"; // Relative path from the new service file to your CRUD file

// [TEMPLATE] Fungsi untuk menghasilkan konten template service
function generateTemplate(modelName: string): string {
  // [STEP 1] Kapitalisasi huruf pertama (contoh: 'user' -> 'User')
  const capitalizedModelName: string =
    modelName.charAt(0).toUpperCase() + modelName.slice(1);

  // [STEP 2] Tentukan nama type model (contoh: 'User')
  const TModel: string = capitalizedModelName;

  // [STEP 3] Tentukan nama delegate type (contoh: 'UserDelegate')
  const TDelegate: string = `${capitalizedModelName}Delegate`;

  // [STEP 4] Tentukan property delegate Prisma client (contoh: 'Prisma.user')
  // Menggunakan lowercase untuk nama property Prisma
  const prismaDelegateProperty: string = `Prisma.${modelName.toLowerCase()}`;

  // [STEP 5] Tentukan nama class service (contoh: 'UserService')
  const serviceClassName: string = `${capitalizedModelName}Service`;

  return `// ${modelName.toLowerCase()}.service.ts

import { Prisma, type ${TModel} } from "@db";
// NOTE: Adjust the path below if your generated types are in a different location
import type { ${TDelegate} } from "@generated/prisma/models.ts";
import { CRUD } from "${CRUD_PATH}";

export abstract class ${serviceClassName} extends CRUD<${TModel}, ${TDelegate}>(
    ${prismaDelegateProperty},
) {}
`;
}

// [MAIN] Logika utama eksekusi generator
function generateServiceFile(): void {
  // [INPUT] Ambil nama model dari argument command line (process.argv[2])
  const modelNameArg = process.argv[2];

  if (!modelNameArg) {
    console.error("[ERROR] Please provide a model name.");
    console.log("Usage: npx ts-node generateService.ts <ModelName>");
    return;
  }

  const modelName = modelNameArg.toLowerCase();

  // [NAMING] Pastikan nama model lowercase untuk nama file (contoh: 'user')
  const fileName: string = `${modelName}.service.ts`;
  const filePath: string = path.join(BASE_PATH, fileName);

  // [GENERATE] Buat konten template
  const content: string = generateTemplate(modelName);

  // [MKDIR] Buat direktori output jika belum ada
  if (!fs.existsSync(BASE_PATH)) {
    fs.mkdirSync(BASE_PATH, { recursive: true });
    console.log(`[SUCCESS] Directory created: ${BASE_PATH}`);
  }

  // [WRITE] Tulis file ke disk
  try {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`[SUCCESS] Service generated: ${fileName}`);
    console.log(`[INFO] File created at: ${filePath}`);
  } catch (err) {
    console.error(`[ERROR] Failed to write file ${fileName}:`, err);
  }
}

// Run the generator
generateServiceFile();
