import { PrismaClient } from "./src/generated/prisma/client.js";

const prisma = new PrismaClient();

async function checkUserRoles() {
    console.log("Checking user roles in database...\n");

    const email = "mahasiswa@students.undip.ac.id";
    const user = await prisma.user.findUnique({
        where: { email },
        include: {
            userRole: {
                include: {
                    role: true,
                },
            },
        },
    });

    if (!user) {
        console.log(`User ${email} not found!`);
        return;
    }

    // Write to file to avoid console truncation
    const fs = require("fs");
    const result = {
        user: {
            name: user.name,
            email: user.email,
            id: user.id,
        },
        roles: user.userRole.map((ur) => ur.role.name),
    };
    fs.writeFileSync("roles.json", JSON.stringify(result, null, 2));
    console.log("Roles written to roles.json");

    await prisma.$disconnect();
}

checkUserRoles().catch(console.error);
