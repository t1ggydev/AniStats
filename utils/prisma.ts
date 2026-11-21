import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 5,
  connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 })

export const prisma = new PrismaClient({ adapter })
