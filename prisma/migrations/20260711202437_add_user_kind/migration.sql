-- CreateEnum
CREATE TYPE "UserKind" AS ENUM ('HUMAN', 'AGENT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "kind" "UserKind" NOT NULL DEFAULT 'HUMAN';
