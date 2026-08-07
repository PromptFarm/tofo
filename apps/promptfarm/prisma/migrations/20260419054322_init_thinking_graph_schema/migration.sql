-- CreateEnum
CREATE TYPE "ThinkingGraphRunStatus" AS ENUM ('draft', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "ThinkingGraphOutputKind" AS ENUM ('synthetic', 'advisor');

-- CreateEnum
CREATE TYPE "ThinkingGraphConversationRole" AS ENUM ('system', 'user', 'synthetic');

-- CreateEnum
CREATE TYPE "ThinkingGraphTranscriptType" AS ENUM ('opinion', 'followup', 'adjustment', 'included');

-- CreateEnum
CREATE TYPE "ThinkingGraphPreparedInputSource" AS ENUM ('defaults', 'manual_edit');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "grantedCredits" INTEGER NOT NULL DEFAULT 0,
    "spentCredits" INTEGER NOT NULL DEFAULT 0,
    "refundedCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingLedgerEntry" (
    "id" TEXT NOT NULL,
    "billingAccountId" TEXT NOT NULL,
    "externalRef" TEXT,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "idea" TEXT NOT NULL,
    "latestSessionId" TEXT,
    "projectState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThinkingGraphSession" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ideaPrompt" TEXT NOT NULL,
    "provider" JSONB,
    "orchestrator" JSONB,
    "selectedPersonaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentPayload" JSONB,
    "projectSpec" JSONB,
    "directorOutput" JSONB,
    "runSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThinkingGraphSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThinkingGraphSynthetic" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "syntheticId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "nodeRole" TEXT,
    "status" TEXT NOT NULL,
    "layoutX" DOUBLE PRECISION NOT NULL,
    "layoutY" DOUBLE PRECISION NOT NULL,
    "opinion" JSONB,
    "followUps" JSONB,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThinkingGraphSynthetic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThinkingGraphEdge" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "edgeId" TEXT NOT NULL,
    "fromSyntheticId" TEXT NOT NULL,
    "toSyntheticId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceHandle" TEXT,
    "targetHandle" TEXT,
    "waypoints" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThinkingGraphEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThinkingGraphRun" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ThinkingGraphRunStatus" NOT NULL DEFAULT 'completed',
    "ideaPrompt" TEXT NOT NULL,
    "provider" JSONB,
    "orchestrator" JSONB,
    "projectSpec" JSONB,
    "directorOutput" JSONB,
    "runSummary" JSONB,
    "graphPayload" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThinkingGraphRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThinkingGraphSyntheticOutput" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "syntheticRecordId" TEXT,
    "syntheticId" TEXT NOT NULL,
    "syntheticName" TEXT NOT NULL,
    "outputKind" "ThinkingGraphOutputKind" NOT NULL DEFAULT 'synthetic',
    "summary" TEXT,
    "details" TEXT,
    "recommendation" TEXT,
    "topRecommendation" TEXT,
    "strategicOptions" JSONB,
    "conflictResolution" JSONB,
    "changesFromPrevious" JSONB,
    "appliedInputs" JSONB,
    "ignoredInputs" JSONB,
    "keyRisks" JSONB,
    "concernLevels" JSONB,
    "handoff" TEXT,
    "upstreamContext" JSONB,
    "directedHandoffs" JSONB,
    "operational" JSONB,
    "outputQuality" JSONB,
    "model" JSONB,
    "tokenUsage" JSONB,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThinkingGraphSyntheticOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThinkingGraphTranscriptEntry" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "syntheticRecordId" TEXT,
    "syntheticId" TEXT NOT NULL,
    "entryIndex" INTEGER NOT NULL,
    "type" "ThinkingGraphTranscriptType" NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThinkingGraphTranscriptEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThinkingGraphConversationMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "syntheticRecordId" TEXT,
    "syntheticId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "role" "ThinkingGraphConversationRole" NOT NULL,
    "text" TEXT NOT NULL,
    "includeInNextIteration" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "insertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThinkingGraphConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThinkingGraphIntakeQuestion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "raisedBySyntheticId" TEXT,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "suggestedAnswer" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThinkingGraphIntakeQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThinkingGraphIntakeAnswer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "intakeQuestionId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThinkingGraphIntakeAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThinkingGraphPreparedDecision" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "runId" TEXT,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "syntheticId" TEXT NOT NULL,
    "decisionTitle" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "optionLabel" TEXT NOT NULL,
    "optionDescription" TEXT NOT NULL,
    "source" "ThinkingGraphPreparedInputSource",
    "appliedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThinkingGraphPreparedDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThinkingGraphPreparedClarification" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "runId" TEXT,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "syntheticId" TEXT NOT NULL,
    "syntheticName" TEXT NOT NULL,
    "source" "ThinkingGraphPreparedInputSource",
    "appliedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThinkingGraphPreparedClarification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThinkingGraphClarificationAnswer" (
    "id" TEXT NOT NULL,
    "preparedClarificationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionLabel" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThinkingGraphClarificationAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThinkingGraphResolvedDecision" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "syntheticId" TEXT NOT NULL,
    "decisionTitle" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "optionLabel" TEXT NOT NULL,
    "optionDescription" TEXT NOT NULL,
    "source" "ThinkingGraphPreparedInputSource",
    "appliedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThinkingGraphResolvedDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_userId_key" ON "BillingAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingLedgerEntry_externalRef_key" ON "BillingLedgerEntry"("externalRef");

-- CreateIndex
CREATE INDEX "BillingLedgerEntry_billingAccountId_createdAt_idx" ON "BillingLedgerEntry"("billingAccountId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PromptProject_userId_updatedAt_idx" ON "PromptProject"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "ThinkingGraphSession_projectId_updatedAt_idx" ON "ThinkingGraphSession"("projectId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "ThinkingGraphSession_userId_updatedAt_idx" ON "ThinkingGraphSession"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "ThinkingGraphSynthetic_sessionId_code_idx" ON "ThinkingGraphSynthetic"("sessionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ThinkingGraphSynthetic_sessionId_syntheticId_key" ON "ThinkingGraphSynthetic"("sessionId", "syntheticId");

-- CreateIndex
CREATE INDEX "ThinkingGraphEdge_sessionId_fromSyntheticId_idx" ON "ThinkingGraphEdge"("sessionId", "fromSyntheticId");

-- CreateIndex
CREATE INDEX "ThinkingGraphEdge_sessionId_toSyntheticId_idx" ON "ThinkingGraphEdge"("sessionId", "toSyntheticId");

-- CreateIndex
CREATE UNIQUE INDEX "ThinkingGraphEdge_sessionId_edgeId_key" ON "ThinkingGraphEdge"("sessionId", "edgeId");

-- CreateIndex
CREATE INDEX "ThinkingGraphRun_sessionId_createdAt_idx" ON "ThinkingGraphRun"("sessionId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ThinkingGraphRun_projectId_createdAt_idx" ON "ThinkingGraphRun"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ThinkingGraphRun_userId_createdAt_idx" ON "ThinkingGraphRun"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ThinkingGraphSyntheticOutput_sessionId_syntheticId_createdA_idx" ON "ThinkingGraphSyntheticOutput"("sessionId", "syntheticId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ThinkingGraphSyntheticOutput_projectId_createdAt_idx" ON "ThinkingGraphSyntheticOutput"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ThinkingGraphSyntheticOutput_runId_syntheticId_key" ON "ThinkingGraphSyntheticOutput"("runId", "syntheticId");

-- CreateIndex
CREATE INDEX "ThinkingGraphTranscriptEntry_sessionId_syntheticId_createdA_idx" ON "ThinkingGraphTranscriptEntry"("sessionId", "syntheticId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ThinkingGraphTranscriptEntry_runId_entryIndex_key" ON "ThinkingGraphTranscriptEntry"("runId", "entryIndex");

-- CreateIndex
CREATE INDEX "ThinkingGraphConversationMessage_sessionId_syntheticId_crea_idx" ON "ThinkingGraphConversationMessage"("sessionId", "syntheticId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ThinkingGraphConversationMessage_projectId_createdAt_idx" ON "ThinkingGraphConversationMessage"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ThinkingGraphConversationMessage_sessionId_messageId_key" ON "ThinkingGraphConversationMessage"("sessionId", "messageId");

-- CreateIndex
CREATE INDEX "ThinkingGraphIntakeQuestion_projectId_createdAt_idx" ON "ThinkingGraphIntakeQuestion"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ThinkingGraphIntakeQuestion_sessionId_questionId_key" ON "ThinkingGraphIntakeQuestion"("sessionId", "questionId");

-- CreateIndex
CREATE INDEX "ThinkingGraphIntakeAnswer_sessionId_answeredAt_idx" ON "ThinkingGraphIntakeAnswer"("sessionId", "answeredAt" DESC);

-- CreateIndex
CREATE INDEX "ThinkingGraphIntakeAnswer_projectId_answeredAt_idx" ON "ThinkingGraphIntakeAnswer"("projectId", "answeredAt" DESC);

-- CreateIndex
CREATE INDEX "ThinkingGraphPreparedDecision_sessionId_syntheticId_applied_idx" ON "ThinkingGraphPreparedDecision"("sessionId", "syntheticId", "appliedAt" DESC);

-- CreateIndex
CREATE INDEX "ThinkingGraphPreparedDecision_runId_syntheticId_idx" ON "ThinkingGraphPreparedDecision"("runId", "syntheticId");

-- CreateIndex
CREATE INDEX "ThinkingGraphPreparedClarification_sessionId_syntheticId_ap_idx" ON "ThinkingGraphPreparedClarification"("sessionId", "syntheticId", "appliedAt" DESC);

-- CreateIndex
CREATE INDEX "ThinkingGraphPreparedClarification_runId_syntheticId_idx" ON "ThinkingGraphPreparedClarification"("runId", "syntheticId");

-- CreateIndex
CREATE INDEX "ThinkingGraphClarificationAnswer_preparedClarificationId_idx" ON "ThinkingGraphClarificationAnswer"("preparedClarificationId");

-- CreateIndex
CREATE INDEX "ThinkingGraphResolvedDecision_sessionId_syntheticId_applied_idx" ON "ThinkingGraphResolvedDecision"("sessionId", "syntheticId", "appliedAt" DESC);

-- CreateIndex
CREATE INDEX "ThinkingGraphResolvedDecision_projectId_appliedAt_idx" ON "ThinkingGraphResolvedDecision"("projectId", "appliedAt" DESC);

-- AddForeignKey
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLedgerEntry" ADD CONSTRAINT "BillingLedgerEntry_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptProject" ADD CONSTRAINT "PromptProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphSession" ADD CONSTRAINT "ThinkingGraphSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PromptProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphSession" ADD CONSTRAINT "ThinkingGraphSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphSynthetic" ADD CONSTRAINT "ThinkingGraphSynthetic_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ThinkingGraphSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphEdge" ADD CONSTRAINT "ThinkingGraphEdge_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ThinkingGraphSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphRun" ADD CONSTRAINT "ThinkingGraphRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ThinkingGraphSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphRun" ADD CONSTRAINT "ThinkingGraphRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PromptProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphRun" ADD CONSTRAINT "ThinkingGraphRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphSyntheticOutput" ADD CONSTRAINT "ThinkingGraphSyntheticOutput_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ThinkingGraphRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphSyntheticOutput" ADD CONSTRAINT "ThinkingGraphSyntheticOutput_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ThinkingGraphSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphSyntheticOutput" ADD CONSTRAINT "ThinkingGraphSyntheticOutput_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PromptProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphSyntheticOutput" ADD CONSTRAINT "ThinkingGraphSyntheticOutput_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphSyntheticOutput" ADD CONSTRAINT "ThinkingGraphSyntheticOutput_syntheticRecordId_fkey" FOREIGN KEY ("syntheticRecordId") REFERENCES "ThinkingGraphSynthetic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphTranscriptEntry" ADD CONSTRAINT "ThinkingGraphTranscriptEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ThinkingGraphRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphTranscriptEntry" ADD CONSTRAINT "ThinkingGraphTranscriptEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ThinkingGraphSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphTranscriptEntry" ADD CONSTRAINT "ThinkingGraphTranscriptEntry_syntheticRecordId_fkey" FOREIGN KEY ("syntheticRecordId") REFERENCES "ThinkingGraphSynthetic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphConversationMessage" ADD CONSTRAINT "ThinkingGraphConversationMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ThinkingGraphSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphConversationMessage" ADD CONSTRAINT "ThinkingGraphConversationMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PromptProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphConversationMessage" ADD CONSTRAINT "ThinkingGraphConversationMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphConversationMessage" ADD CONSTRAINT "ThinkingGraphConversationMessage_syntheticRecordId_fkey" FOREIGN KEY ("syntheticRecordId") REFERENCES "ThinkingGraphSynthetic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphIntakeQuestion" ADD CONSTRAINT "ThinkingGraphIntakeQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ThinkingGraphSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphIntakeQuestion" ADD CONSTRAINT "ThinkingGraphIntakeQuestion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PromptProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphIntakeQuestion" ADD CONSTRAINT "ThinkingGraphIntakeQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphIntakeAnswer" ADD CONSTRAINT "ThinkingGraphIntakeAnswer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ThinkingGraphSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphIntakeAnswer" ADD CONSTRAINT "ThinkingGraphIntakeAnswer_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PromptProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphIntakeAnswer" ADD CONSTRAINT "ThinkingGraphIntakeAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphIntakeAnswer" ADD CONSTRAINT "ThinkingGraphIntakeAnswer_intakeQuestionId_fkey" FOREIGN KEY ("intakeQuestionId") REFERENCES "ThinkingGraphIntakeQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphPreparedDecision" ADD CONSTRAINT "ThinkingGraphPreparedDecision_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ThinkingGraphSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphPreparedDecision" ADD CONSTRAINT "ThinkingGraphPreparedDecision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ThinkingGraphRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphPreparedDecision" ADD CONSTRAINT "ThinkingGraphPreparedDecision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PromptProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphPreparedDecision" ADD CONSTRAINT "ThinkingGraphPreparedDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphPreparedClarification" ADD CONSTRAINT "ThinkingGraphPreparedClarification_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ThinkingGraphSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphPreparedClarification" ADD CONSTRAINT "ThinkingGraphPreparedClarification_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ThinkingGraphRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphPreparedClarification" ADD CONSTRAINT "ThinkingGraphPreparedClarification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PromptProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphPreparedClarification" ADD CONSTRAINT "ThinkingGraphPreparedClarification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphClarificationAnswer" ADD CONSTRAINT "ThinkingGraphClarificationAnswer_preparedClarificationId_fkey" FOREIGN KEY ("preparedClarificationId") REFERENCES "ThinkingGraphPreparedClarification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphResolvedDecision" ADD CONSTRAINT "ThinkingGraphResolvedDecision_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ThinkingGraphSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphResolvedDecision" ADD CONSTRAINT "ThinkingGraphResolvedDecision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PromptProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThinkingGraphResolvedDecision" ADD CONSTRAINT "ThinkingGraphResolvedDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
