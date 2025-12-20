// generateService.ts
import * as fs from 'fs';
import * as path from 'path';

// --- Configuration ---
const BASE_PATH: string = path.join(process.cwd(), 'src', 'services', 'database_models');
const CRUD_PATH: string = './__basicCRUD.ts'; // Relative path from the new service file to your CRUD file

// --- Template Function ---
function generateTemplate(modelName: string): string {
    // 1. Capitalize the first letter (e.g., 'user' -> 'User')
    const capitalizedModelName: string = modelName.charAt(0).toUpperCase() + modelName.slice(1);
    
    // 2. Define the singular type name (e.g., 'User')
    const TModel: string = capitalizedModelName;
    
    // 3. Define the delegate type name (e.g., 'UserDelegate')
    const TDelegate: string = `${capitalizedModelName}Delegate`;
    
    // 4. Define the Prisma client delegate property (e.g., 'Prisma.user')
    // We use lowercase for the Prisma property name
    const prismaDelegateProperty: string = `Prisma.${modelName.toLowerCase()}`;
    
    // 5. Define the service class name (e.g., 'UserService')
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

// --- Main Execution Logic ---
function generateServiceFile(): void {
    // Get the model name from command line arguments (process.argv[2])
    const modelNameArg = process.argv[2]; 

    if (!modelNameArg) {
        console.error('🛑 Error: Please provide a model name.');
        console.log('Usage: npx ts-node generateService.ts <ModelName>');
        return;
    }

    const modelName = modelNameArg.toLowerCase();

    // Ensure model name is lowercased for the file name (e.g., 'user')
    const fileName: string = `${modelName}.service.ts`;
    const filePath: string = path.join(BASE_PATH, fileName);
    
    // Generate the content
    const content: string = generateTemplate(modelName);

    // Create the output directory if it doesn't exist
    if (!fs.existsSync(BASE_PATH)) {
        fs.mkdirSync(BASE_PATH, { recursive: true });
        console.log(`✅ Created directory: ${BASE_PATH}`);
    }

    // Write the file
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✨ Successfully generated service: ${fileName}`);
        console.log(`📁 File created at: ${filePath}`);
    } catch (err) {
        console.error(`❌ Failed to write file ${fileName}:`, err);
    }
}

// Run the generator
generateServiceFile();