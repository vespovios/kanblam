import { PrismaClient } from "@prisma/client";
import { seedWorkspace } from "./seedWorkspace";

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedWorkspace(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
