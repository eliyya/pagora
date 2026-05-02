import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  prismaAdapter: PrismaPg;
};
const adapter =
  globalForPrisma.prismaAdapter ?? new PrismaPg(process.env.DATABASE_URL!);

const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaAdapter = adapter;
  globalForPrisma.prisma = db;
}

export { db };
