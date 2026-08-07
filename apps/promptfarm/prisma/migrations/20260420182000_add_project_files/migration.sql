-- Add project-level file attachments.
CREATE TABLE "ProjectFile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "includeInContext" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectFile_projectId_createdAt_idx" ON "ProjectFile"("projectId", "createdAt" DESC);
CREATE INDEX "ProjectFile_userId_createdAt_idx" ON "ProjectFile"("userId", "createdAt" DESC);

ALTER TABLE "ProjectFile"
ADD CONSTRAINT "ProjectFile_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "PromptProject"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectFile"
ADD CONSTRAINT "ProjectFile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
