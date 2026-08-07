export const CREATE_TABLES_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS PromptProject (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  idea TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  latestSessionId TEXT,
  projectState TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS PromptProject_userId_updatedAt_idx ON PromptProject(userId, updatedAt);

CREATE TABLE IF NOT EXISTS ProjectFile (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES PromptProject(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  storageBucket TEXT NOT NULL,
  storagePath TEXT NOT NULL,
  originalName TEXT NOT NULL,
  contentType TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL,
  includeInContext INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ProjectFile_projectId_createdAt_idx ON ProjectFile(projectId, createdAt);
CREATE INDEX IF NOT EXISTS ProjectFile_userId_createdAt_idx ON ProjectFile(userId, createdAt);

CREATE TABLE IF NOT EXISTS ThinkingGraphSession (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES PromptProject(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  ideaPrompt TEXT NOT NULL,
  provider TEXT,
  orchestrator TEXT,
  selectedPersonaIds TEXT NOT NULL DEFAULT '[]',
  currentPayload TEXT,
  projectSpec TEXT,
  directorOutput TEXT,
  runSummary TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ThinkingGraphSession_projectId_updatedAt_idx ON ThinkingGraphSession(projectId, updatedAt);
CREATE INDEX IF NOT EXISTS ThinkingGraphSession_userId_updatedAt_idx ON ThinkingGraphSession(userId, updatedAt);

CREATE TABLE IF NOT EXISTS ThinkingGraphSynthetic (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL REFERENCES ThinkingGraphSession(id) ON DELETE CASCADE,
  syntheticId TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  nodeRole TEXT,
  status TEXT NOT NULL,
  layoutX REAL NOT NULL,
  layoutY REAL NOT NULL,
  opinion TEXT,
  followUps TEXT,
  config TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(sessionId, syntheticId)
);
CREATE INDEX IF NOT EXISTS ThinkingGraphSynthetic_sessionId_code_idx ON ThinkingGraphSynthetic(sessionId, code);

CREATE TABLE IF NOT EXISTS ThinkingGraphEdge (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL REFERENCES ThinkingGraphSession(id) ON DELETE CASCADE,
  edgeId TEXT NOT NULL,
  fromSyntheticId TEXT NOT NULL,
  toSyntheticId TEXT NOT NULL,
  type TEXT NOT NULL,
  sourceHandle TEXT,
  targetHandle TEXT,
  waypoints TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(sessionId, edgeId)
);

CREATE TABLE IF NOT EXISTS ThinkingGraphRun (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL REFERENCES ThinkingGraphSession(id) ON DELETE CASCADE,
  projectId TEXT NOT NULL REFERENCES PromptProject(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'completed',
  ideaPrompt TEXT NOT NULL,
  versionLabel TEXT,
  parentRunId TEXT,
  runReason TEXT,
  provider TEXT,
  orchestrator TEXT,
  projectSpec TEXT,
  directorOutput TEXT,
  runSummary TEXT,
  graphPayload TEXT,
  startedAt TEXT NOT NULL,
  completedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ThinkingGraphRun_sessionId_createdAt_idx ON ThinkingGraphRun(sessionId, createdAt);
CREATE INDEX IF NOT EXISTS ThinkingGraphRun_projectId_createdAt_idx ON ThinkingGraphRun(projectId, createdAt);
CREATE INDEX IF NOT EXISTS ThinkingGraphRun_userId_createdAt_idx ON ThinkingGraphRun(userId, createdAt);

CREATE TABLE IF NOT EXISTS ThinkingGraphSyntheticOutput (
  id TEXT PRIMARY KEY,
  runId TEXT NOT NULL REFERENCES ThinkingGraphRun(id) ON DELETE CASCADE,
  sessionId TEXT NOT NULL REFERENCES ThinkingGraphSession(id) ON DELETE CASCADE,
  projectId TEXT NOT NULL REFERENCES PromptProject(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  syntheticRecordId TEXT REFERENCES ThinkingGraphSynthetic(id),
  syntheticId TEXT NOT NULL,
  syntheticName TEXT NOT NULL,
  outputKind TEXT NOT NULL DEFAULT 'synthetic',
  summary TEXT,
  details TEXT,
  recommendation TEXT,
  topRecommendation TEXT,
  strategicOptions TEXT,
  conflictResolution TEXT,
  changesFromPrevious TEXT,
  appliedInputs TEXT,
  ignoredInputs TEXT,
  keyRisks TEXT,
  concernLevels TEXT,
  handoff TEXT,
  upstreamContext TEXT,
  directedHandoffs TEXT,
  operational TEXT,
  outputQuality TEXT,
  model TEXT,
  tokenUsage TEXT,
  raw TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(runId, syntheticId)
);
CREATE INDEX IF NOT EXISTS ThinkingGraphSyntheticOutput_sessionId_syntheticId_createdAt_idx ON ThinkingGraphSyntheticOutput(sessionId, syntheticId, createdAt);

CREATE TABLE IF NOT EXISTS ThinkingGraphTranscriptEntry (
  id TEXT PRIMARY KEY,
  runId TEXT NOT NULL REFERENCES ThinkingGraphRun(id) ON DELETE CASCADE,
  sessionId TEXT NOT NULL REFERENCES ThinkingGraphSession(id) ON DELETE CASCADE,
  syntheticRecordId TEXT REFERENCES ThinkingGraphSynthetic(id),
  syntheticId TEXT NOT NULL,
  entryIndex INTEGER NOT NULL,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  UNIQUE(runId, entryIndex)
);

CREATE TABLE IF NOT EXISTS ThinkingGraphConversationMessage (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL REFERENCES ThinkingGraphSession(id) ON DELETE CASCADE,
  projectId TEXT NOT NULL REFERENCES PromptProject(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  syntheticRecordId TEXT REFERENCES ThinkingGraphSynthetic(id),
  syntheticId TEXT NOT NULL,
  messageId TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  includeInNextIteration INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  insertedAt TEXT NOT NULL,
  UNIQUE(sessionId, messageId)
);
CREATE INDEX IF NOT EXISTS ThinkingGraphConversationMessage_sessionId_syntheticId_createdAt_idx ON ThinkingGraphConversationMessage(sessionId, syntheticId, createdAt);

CREATE TABLE IF NOT EXISTS ThinkingGraphIntakeQuestion (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL REFERENCES ThinkingGraphSession(id) ON DELETE CASCADE,
  projectId TEXT NOT NULL REFERENCES PromptProject(id) ON DELETE CASCADE,
  raisedBySyntheticId TEXT,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  questionId TEXT NOT NULL,
  question TEXT NOT NULL,
  whyItMatters TEXT NOT NULL,
  required INTEGER NOT NULL,
  suggestedAnswer TEXT,
  source TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  UNIQUE(sessionId, questionId)
);

CREATE TABLE IF NOT EXISTS ThinkingGraphIntakeAnswer (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL REFERENCES ThinkingGraphSession(id) ON DELETE CASCADE,
  projectId TEXT NOT NULL REFERENCES PromptProject(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  intakeQuestionId TEXT NOT NULL REFERENCES ThinkingGraphIntakeQuestion(id) ON DELETE CASCADE,
  answer TEXT NOT NULL,
  answeredAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ThinkingGraphPreparedDecision (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL REFERENCES ThinkingGraphSession(id) ON DELETE CASCADE,
  runId TEXT REFERENCES ThinkingGraphRun(id) ON DELETE CASCADE,
  projectId TEXT NOT NULL REFERENCES PromptProject(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  syntheticId TEXT NOT NULL,
  decisionTitle TEXT NOT NULL,
  optionId TEXT NOT NULL,
  optionLabel TEXT NOT NULL,
  optionDescription TEXT NOT NULL,
  source TEXT,
  appliedAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ThinkingGraphPreparedClarification (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL REFERENCES ThinkingGraphSession(id) ON DELETE CASCADE,
  runId TEXT REFERENCES ThinkingGraphRun(id) ON DELETE CASCADE,
  projectId TEXT NOT NULL REFERENCES PromptProject(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  syntheticId TEXT NOT NULL,
  syntheticName TEXT NOT NULL,
  source TEXT,
  appliedAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ThinkingGraphClarificationAnswer (
  id TEXT PRIMARY KEY,
  preparedClarificationId TEXT NOT NULL REFERENCES ThinkingGraphPreparedClarification(id) ON DELETE CASCADE,
  questionId TEXT NOT NULL,
  questionLabel TEXT NOT NULL,
  answer TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ThinkingGraphResolvedDecision (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL REFERENCES ThinkingGraphSession(id) ON DELETE CASCADE,
  projectId TEXT NOT NULL REFERENCES PromptProject(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  syntheticId TEXT NOT NULL,
  decisionTitle TEXT NOT NULL,
  optionId TEXT NOT NULL,
  optionLabel TEXT NOT NULL,
  optionDescription TEXT NOT NULL,
  source TEXT,
  appliedAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ThinkingGraphPlan (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES PromptProject(id) ON DELETE CASCADE,
  runId TEXT NOT NULL REFERENCES ThinkingGraphRun(id) ON DELETE CASCADE,
  format TEXT NOT NULL,
  title TEXT NOT NULL,
  rawJson TEXT NOT NULL,
  generatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ThinkingGraphPlan_runId_idx ON ThinkingGraphPlan(runId);
CREATE INDEX IF NOT EXISTS ThinkingGraphPlan_projectId_generatedAt_idx ON ThinkingGraphPlan(projectId, generatedAt);

CREATE TABLE IF NOT EXISTS ThinkingGraphPlanExport (
  id TEXT PRIMARY KEY,
  planId TEXT NOT NULL REFERENCES ThinkingGraphPlan(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  exportedAt TEXT NOT NULL,
  externalIds TEXT NOT NULL DEFAULT '[]',
  metadata TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ThinkingGraphPlanExport_planId_destination_exportedAt_idx ON ThinkingGraphPlanExport(planId, destination, exportedAt);

CREATE TABLE IF NOT EXISTS TeamPreset (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS TeamPreset_userId_createdAt_idx ON TeamPreset(userId, createdAt);

CREATE TABLE IF NOT EXISTS CustomPersona (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  skillDescription TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS TeamPresetMember (
  id TEXT PRIMARY KEY,
  teamId TEXT NOT NULL REFERENCES TeamPreset(id) ON DELETE CASCADE,
  personaId TEXT,
  customPersonaId TEXT REFERENCES CustomPersona(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  skillDescription TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS TeamPresetMember_teamId_idx ON TeamPresetMember(teamId);

CREATE TABLE IF NOT EXISTS AppSetting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS TeamPresetConnection (
  id TEXT PRIMARY KEY,
  teamId TEXT NOT NULL REFERENCES TeamPreset(id) ON DELETE CASCADE,
  fromId TEXT NOT NULL REFERENCES TeamPresetMember(id) ON DELETE CASCADE,
  toId TEXT NOT NULL REFERENCES TeamPresetMember(id) ON DELETE CASCADE,
  type TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS TeamPresetConnection_teamId_idx ON TeamPresetConnection(teamId);
`;
