import { PrismaClient } from "./src/generated/prisma/client.js";

const prisma = new PrismaClient();

async function checkAccounts() {
    console.log("Checking accounts in database...\n");

    const accounts = await prisma.account.findMany({
        include: {
            user: true,
        },
    });

    console.log(`Found ${accounts.length} accounts:\n`);

    for (const account of accounts) {
        console.log(`Account ID: ${account.id}`);
        console.log(`User Email: ${account.user.email}`);
        console.log(`Provider ID: ${account.providerId}`);
        console.log(`Account ID (email): ${account.accountId}`);
        console.log(`Has Password: ${!!account.password}`);
        console.log(
            `Password Hash (first 50 chars): ${account.password?.substring(0, 50)}...`,
        );
        console.log("---");
    }

    await prisma.$disconnect();
}

checkAccounts().catch(console.error);
