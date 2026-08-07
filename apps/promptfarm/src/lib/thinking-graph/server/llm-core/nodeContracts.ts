export type NodeStatus =
  | "success"
  | "insufficient_input"
  | "blocked_by_conflict"
  | "out_of_scope"

export type NodeType = "normalize" | "critique" | "resolve" | "finalize"

export type NodeDefinition = {
  identity: {
    id: string
    type: NodeType
    role: string
    stage: string
  }
  semantics: {
    mission: string
    progressIntent: string
    sourceOfTruth: string[]
    nonGoals: string[]
  }
  io: {
    acceptedInputs: string[]
    requiredInputs: string[]
    outputSchema: Record<string, unknown>
    handoffTarget: string
  }
  control: {
    allowedActions: string[]
    forbiddenActions: string[]
    completionRules: string[]
    failureModes: NodeStatus[]
  }
  stateInteraction: {
    readsFromState: string[]
    writesToState: string[]
    patchFormat: "json_patch_like"
  }
}

export type NodeHandoff = {
  resolved: string[]
  unresolved: string[]
  downstreamAttention: string[]
  confidence: number
  recommendedNextNode: string
}

export type NodeStatePatch = {
  ops: Array<{
    op: "set" | "append" | "mark_risk" | "mark_blocker"
    path: string
    value: unknown
  }>
}

export type NodeExecutionResult<TOutput = unknown> = {
  status: NodeStatus
  output: TOutput
  handoff: NodeHandoff
  statePatch: NodeStatePatch
  meta: {
    nodeId: string
    attempt: number
  }
}

export type ValidationStatus = "pass" | "warn" | "fail" | "error"

export type ValidationCheck = "pass" | "fail"

export type ValidationReport = {
  status: ValidationStatus
  checks: {
    schemaCompliance: ValidationCheck
    scopeDiscipline: ValidationCheck
    sourceOfTruthSafety: ValidationCheck
    handoffReadiness: ValidationCheck
    statePatchQuality: ValidationCheck
  }
  violations: Array<{
    code:
      | "SCHEMA_INVALID"
      | "OUT_OF_SCOPE_ACTION"
      | "SCOPE_DISCIPLINE"
      | "SOURCE_OF_TRUTH_OVERRIDE"
      | "HANDOFF_INCOMPLETE"
      | "STATE_PATCH_WEAK"
    message: string
    severity: "low" | "medium" | "high"
  }>
  revisionRequest: {
    requiredFixes: string[]
    forbiddenFixes: string[]
    preserve: string[]
  } | null
  meta: {
    validatorNodeId: string
    producerNodeId: string
    attempt: number
  }
}
