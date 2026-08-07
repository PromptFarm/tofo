import { useCallback, useMemo, useState } from "react"
import { type Connection, type Edge } from "@xyflow/react"
import { toast } from "sonner"

import type { SyntheticEdge, SyntheticNode } from "@/lib/planning/types"
import { composeVisibleSynthetics } from "../composeVisibleSynthetics"

type SyntheticRoleTemplate = {
  id: string
  code: string
  name: string
  role: string
  subtitle?: string
}

function hasExactDuplicateEdge(
  edges: SyntheticEdge[],
  candidate: SyntheticEdge,
): boolean {
  return edges.some(
    (edge) =>
      edge.id !== candidate.id &&
      edge.from === candidate.from &&
      edge.to === candidate.to &&
      edge.type === candidate.type,
  )
}

function hasDependencyCycle(
  nodeIds: string[],
  edges: { from: string; to: string }[],
): boolean {
  const inDegree = new Map<string, number>(nodeIds.map((id) => [id, 0]))
  const outMap = new Map<string, string[]>(
    nodeIds.map((id) => [id, [] as string[]]),
  )

  edges.forEach((edge) => {
    if (!inDegree.has(edge.from) || !inDegree.has(edge.to)) {
      return
    }
    outMap.get(edge.from)?.push(edge.to)
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
  })

  const queue: string[] = []
  inDegree.forEach((count, nodeId) => {
    if (count === 0) {
      queue.push(nodeId)
    }
  })

  let visitedCount = 0
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      break
    }
    visitedCount += 1
    ;(outMap.get(current) ?? []).forEach((next) => {
      const nextCount = (inDegree.get(next) ?? 0) - 1
      inDegree.set(next, nextCount)
      if (nextCount === 0) {
        queue.push(next)
      }
    })
  }

  return visitedCount !== nodeIds.length
}

function hasDependencyCycleInEdges(
  syntheticNodeIds: string[],
  edges: SyntheticEdge[],
): boolean {
  const nodeIdSet = new Set(syntheticNodeIds)
  // Only oversight and amplification edges are directed and can form cycles.
  // Tension edges are bidirectional by nature so they don't participate in directed cycles.
  // Structural edges connect to idea/outcome nodes, not between synthetics.
  const directionalEdges = edges
    .filter(
      (edge) =>
        (edge.type === "oversight" || edge.type === "amplification") &&
        nodeIdSet.has(edge.from) &&
        nodeIdSet.has(edge.to),
    )
    .map((edge) => ({ from: edge.from, to: edge.to }))

  return hasDependencyCycle(syntheticNodeIds, directionalEdges)
}

type UseThinkingGraphEditorInput = {
  baseVisibleSynthetics: SyntheticNode[]
  currentRevisionId: string | null
  revisionEdges: SyntheticEdge[]
  selectedNodeId: string | null
  showProcessGraph: boolean
  isRunInProgress: boolean
  ideaNodeId: string
  outcomeNodeId: string
  extraRoleTemplates: SyntheticRoleTemplate[]
  roleSearchTerm: string
  onRevisionEdgesChange: (edges: SyntheticEdge[]) => void
  onSelectNode: (nodeId: string | null) => void
  onSelectedEdgeChange: (edgeId: string | null) => void
  markNodesDirty: (ids: string[]) => void
  onTeamMutationStart?: () => void
}

export function useThinkingGraphEditor({
  baseVisibleSynthetics,
  currentRevisionId,
  revisionEdges,
  selectedNodeId,
  showProcessGraph,
  isRunInProgress,
  ideaNodeId,
  outcomeNodeId,
  extraRoleTemplates,
  roleSearchTerm,
  onRevisionEdgesChange,
  onSelectNode,
  onSelectedEdgeChange,
  markNodesDirty,
  onTeamMutationStart,
}: UseThinkingGraphEditorInput) {
  const [pendingRoleDeleteId, setPendingRoleDeleteId] = useState<string | null>(
    null,
  )
  const [addedSyntheticsByRevision, setAddedSyntheticsByRevision] = useState<
    Record<string, SyntheticNode[]>
  >({})
  const [removedSyntheticIdsByRevision, setRemovedSyntheticIdsByRevision] =
    useState<Record<string, string[]>>({})
  const [pendingConnection, setPendingConnection] = useState<{
    connection: Connection
    sourceId: string
    targetId: string
  } | null>(null)

  const baseSyntheticById = useMemo(
    () =>
      new Map<string, SyntheticNode>(
        baseVisibleSynthetics.map((synthetic) => [synthetic.id, synthetic]),
      ),
    [baseVisibleSynthetics],
  )

  const removedSyntheticIds = useMemo(
    () =>
      currentRevisionId
        ? (removedSyntheticIdsByRevision[currentRevisionId] ?? [])
        : [],
    [currentRevisionId, removedSyntheticIdsByRevision],
  )

  const addedSynthetics = useMemo(
    () =>
      currentRevisionId
        ? (addedSyntheticsByRevision[currentRevisionId] ?? [])
        : [],
    [addedSyntheticsByRevision, currentRevisionId],
  )

  const visibleSynthetics = useMemo(() => {
    return composeVisibleSynthetics(
      baseVisibleSynthetics,
      addedSynthetics,
      removedSyntheticIds,
    )
  }, [addedSynthetics, baseVisibleSynthetics, removedSyntheticIds])

  const roleTemplates = useMemo(() => {
    const templateById = new Map<string, SyntheticRoleTemplate>()
    baseVisibleSynthetics.forEach((synthetic) => {
      templateById.set(synthetic.id, {
        id: synthetic.id,
        code: synthetic.code,
        name: synthetic.name,
        role: synthetic.role,
      })
    })
    extraRoleTemplates.forEach((template) => {
      templateById.set(template.id, template)
    })
    return Array.from(templateById.values())
  }, [baseVisibleSynthetics, extraRoleTemplates])

  const roleTemplateById = useMemo(
    () => new Map(roleTemplates.map((template) => [template.id, template])),
    [roleTemplates],
  )

  const visibleSyntheticIdSet = useMemo(
    () => new Set(visibleSynthetics.map((synthetic) => synthetic.id)),
    [visibleSynthetics],
  )
  const syntheticNodeIds = useMemo(
    () => visibleSynthetics.map((synthetic) => synthetic.id),
    [visibleSynthetics],
  )

  const filteredRoleTemplates = useMemo(() => {
    const query = roleSearchTerm.trim().toLowerCase()
    return roleTemplates.filter((template) => {
      if (visibleSyntheticIdSet.has(template.id)) {
        return false
      }
      if (!query) {
        return true
      }
      return (
        template.name.toLowerCase().includes(query) ||
        template.code.toLowerCase().includes(query) ||
        template.role.toLowerCase().includes(query)
      )
    })
  }, [roleSearchTerm, roleTemplates, visibleSyntheticIdSet])

  const selectedSyntheticNode = useMemo(
    () =>
      selectedNodeId
        ? (visibleSynthetics.find(
            (synthetic) => synthetic.id === selectedNodeId,
          ) ?? null)
        : null,
    [selectedNodeId, visibleSynthetics],
  )

  const visibleSyntheticById = useMemo(
    () =>
      new Map(visibleSynthetics.map((synthetic) => [synthetic.id, synthetic])),
    [visibleSynthetics],
  )

  const selectedSyntheticEdgeCount = useMemo(
    () =>
      selectedSyntheticNode
        ? revisionEdges.filter(
            (edge) =>
              edge.from === selectedSyntheticNode.id ||
              edge.to === selectedSyntheticNode.id,
          ).length
        : 0,
    [revisionEdges, selectedSyntheticNode],
  )

  const pendingDeleteRole = useMemo(
    () =>
      pendingRoleDeleteId
        ? (visibleSyntheticById.get(pendingRoleDeleteId) ?? null)
        : null,
    [pendingRoleDeleteId, visibleSyntheticById],
  )

  const pendingDeleteRoleEdgeCount = useMemo(
    () =>
      pendingDeleteRole
        ? revisionEdges.filter(
            (edge) =>
              edge.from === pendingDeleteRole.id || edge.to === pendingDeleteRole.id,
          ).length
        : 0,
    [pendingDeleteRole, revisionEdges],
  )

  const toSemanticNodeId = useCallback(
    (graphNodeId: string): string | null => {
      if (graphNodeId === ideaNodeId) {
        return "idea"
      }
      if (graphNodeId === outcomeNodeId) {
        return "outcome"
      }
      if (visibleSyntheticIdSet.has(graphNodeId)) {
        return graphNodeId
      }
      return null
    },
    [ideaNodeId, outcomeNodeId, visibleSyntheticIdSet],
  )

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (isRunInProgress || !showProcessGraph) {
        return
      }

      const sourceId = connection.source
        ? toSemanticNodeId(connection.source)
        : null
      const targetId = connection.target
        ? toSemanticNodeId(connection.target)
        : null
      if (!sourceId || !targetId) {
        return
      }
      if (sourceId === targetId) {
        toast.error("Cannot connect a node to itself.")
        return
      }

      // Block semantically invalid structural connections
      if (targetId === "idea") {
        toast.error("Edges cannot point back to the Idea node.")
        return
      }
      if (sourceId === "outcome") {
        toast.error("Edges cannot originate from the Outcome node.")
        return
      }
      if (targetId === "outcome") {
        toast.error("Edges cannot point directly to the Outcome node.")
        return
      }
      if (sourceId === "idea") {
        toast.error("Edges cannot originate from the Idea node.")
        return
      }

      setPendingConnection({ connection, sourceId, targetId })
    },
    [isRunInProgress, showProcessGraph, toSemanticNodeId, revisionEdges, onRevisionEdgesChange],
  )

  const confirmConnection = useCallback(
    (type: SyntheticEdge["type"]) => {
      if (!pendingConnection) return
      const { connection, sourceId, targetId } = pendingConnection
      setPendingConnection(null)

      const nextEdge: SyntheticEdge = {
        id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        from: sourceId,
        to: targetId,
        type,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
      }

      if (hasExactDuplicateEdge(revisionEdges, nextEdge)) {
        toast.error("This link already exists.")
        return
      }

      const nextEdges = [...revisionEdges, nextEdge]
      if (hasDependencyCycleInEdges(syntheticNodeIds, nextEdges)) {
        toast.error("Cannot create dependency cycle.")
        return
      }

      onRevisionEdgesChange(nextEdges)
      onSelectedEdgeChange(nextEdge.id)
      markNodesDirty([targetId])
    },
    [
      markNodesDirty,
      onRevisionEdgesChange,
      onSelectedEdgeChange,
      pendingConnection,
      revisionEdges,
      syntheticNodeIds,
    ],
  )

  const handleReconnect = useCallback(
    (oldEdge: Edge, connection: Connection) => {
      if (isRunInProgress || !showProcessGraph) return

      const sourceId = connection.source
        ? toSemanticNodeId(connection.source)
        : null
      const targetId = connection.target
        ? toSemanticNodeId(connection.target)
        : null
      if (!sourceId || !targetId) return
      if (sourceId === targetId) {
        toast.error("Cannot connect a node to itself.")
        return
      }

      const previousSemanticEdge = revisionEdges.find(
        (edge) => edge.id === oldEdge.id,
      )
      if (!previousSemanticEdge) return

      // For structural edges, allow only handle-position changes on the idea/outcome node.
      // The semantic from/to pair must stay the same — you can move which SIDE the edge
      // attaches to, but not which node it connects.
      if (
        previousSemanticEdge.from === "idea" ||
        previousSemanticEdge.to === "idea" ||
        previousSemanticEdge.from === "outcome" ||
        previousSemanticEdge.to === "outcome"
      ) {
        const fromUnchanged = sourceId === previousSemanticEdge.from
        const toUnchanged   = targetId === previousSemanticEdge.to
        if (!fromUnchanged || !toUnchanged) {
          toast.error("Structural edges cannot be rerouted to a different node.")
          return
        }
        // Only the handle (side) changed — persist and return early
        onRevisionEdgesChange(
          revisionEdges.map((edge) =>
            edge.id === oldEdge.id
              ? {
                  ...previousSemanticEdge,
                  sourceHandle: connection.sourceHandle ?? undefined,
                  targetHandle: connection.targetHandle ?? undefined,
                }
              : edge,
          ),
        )
        return
      }

      const updatedEdge: SyntheticEdge = {
        ...previousSemanticEdge,
        from: sourceId,
        to: targetId,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
      }

      if (hasExactDuplicateEdge(revisionEdges, updatedEdge)) {
        toast.error("This link already exists.")
        return
      }

      const nextEdges = revisionEdges.map((edge) =>
        edge.id === oldEdge.id ? updatedEdge : edge,
      )
      if (hasDependencyCycleInEdges(syntheticNodeIds, nextEdges)) {
        toast.error("Cannot create dependency cycle.")
        return
      }

      onRevisionEdgesChange(nextEdges)
      onSelectedEdgeChange(oldEdge.id)
      onSelectNode(connection.source ?? null)
      markNodesDirty([previousSemanticEdge.to, targetId])
    },
    [
      isRunInProgress,
      markNodesDirty,
      onRevisionEdgesChange,
      onSelectNode,
      onSelectedEdgeChange,
      revisionEdges,
      showProcessGraph,
      syntheticNodeIds,
      toSemanticNodeId,
    ],
  )

  const handleAddRole = useCallback(
    (templateId: string, dropPosition?: { x: number; y: number }) => {
      if (!currentRevisionId) return
      const template = roleTemplateById.get(templateId)
      if (!template) return
      onTeamMutationStart?.()

      if (baseSyntheticById.has(templateId)) {
        setRemovedSyntheticIdsByRevision((prev) => {
          const current = prev[currentRevisionId] ?? []
          return {
            ...prev,
            [currentRevisionId]: current.filter((id) => id !== templateId),
          }
        })
        markNodesDirty([templateId])
        return
      }

      if (visibleSyntheticIdSet.has(templateId)) return

      let layoutX: number
      let layoutY: number
      if (dropPosition) {
        layoutX = dropPosition.x
        layoutY = dropPosition.y
      } else {
        const maxX =
          visibleSynthetics.length > 0
            ? Math.max(...visibleSynthetics.map((node) => node.layout.x))
            : 540
        const minY =
          visibleSynthetics.length > 0
            ? Math.min(...visibleSynthetics.map((node) => node.layout.y))
            : 180
        const nextIndex = addedSynthetics.length
        const row = Math.floor(nextIndex / 4)
        const col = nextIndex % 4
        layoutX = maxX + 180 + col * 130
        layoutY = minY + 40 + row * 130
      }

      const newSynthetic: SyntheticNode = {
        id: template.id,
        code: template.code,
        name: template.name,
        role: template.role,
        status: "proposed",
        layout: { x: layoutX, y: layoutY },
        config: {
          enabled: true,
          temperature: 0.3,
          strictness: 72,
          engagementPercent: 68,
        },
      }

      setAddedSyntheticsByRevision((prev) => ({
        ...prev,
        [currentRevisionId]: [...(prev[currentRevisionId] ?? []), newSynthetic],
      }))

      // Auto-add structural idea → newNode and newNode → outcome edges if not already present
      const edgesToAdd: SyntheticEdge[] = []
      const ideaEdgeId = `edge-idea-${newSynthetic.id}`
      if (!revisionEdges.some((e) => e.id === ideaEdgeId)) {
        edgesToAdd.push({ id: ideaEdgeId, from: "idea", to: newSynthetic.id, type: "structural" })
      }
      const outcomeEdgeId = `edge-${newSynthetic.id}-outcome`
      if (!revisionEdges.some((e) => e.id === outcomeEdgeId)) {
        edgesToAdd.push({ id: outcomeEdgeId, from: newSynthetic.id, to: "outcome", type: "structural" })
      }
      if (edgesToAdd.length > 0) {
        onRevisionEdgesChange([...revisionEdges, ...edgesToAdd])
      }

      onSelectedEdgeChange(null)
      onSelectNode(newSynthetic.id)
      markNodesDirty([newSynthetic.id])
    },
    [
      addedSynthetics.length,
      baseSyntheticById,
      currentRevisionId,
      markNodesDirty,
      onRevisionEdgesChange,
      onSelectNode,
      onSelectedEdgeChange,
      revisionEdges,
      roleTemplateById,
      visibleSyntheticIdSet,
      visibleSynthetics,
      onTeamMutationStart,
    ],
  )

  const removeRoleById = useCallback(
    (roleId: string) => {
      if (!currentRevisionId) return
      onTeamMutationStart?.()

      const affectedByRemoval = revisionEdges
        .filter((edge) => edge.from === roleId || edge.to === roleId)
        .flatMap((edge) => [edge.from, edge.to])
        .filter((id) => id !== roleId)

      // Remove all edges touching this node, including the structural idea→node edge
      onRevisionEdgesChange(
        revisionEdges.filter((edge) => edge.from !== roleId && edge.to !== roleId),
      )

      if (baseSyntheticById.has(roleId)) {
        setRemovedSyntheticIdsByRevision((prev) => {
          const current = prev[currentRevisionId] ?? []
          if (current.includes(roleId)) return prev
          return { ...prev, [currentRevisionId]: [...current, roleId] }
        })
      } else {
        setAddedSyntheticsByRevision((prev) => ({
          ...prev,
          [currentRevisionId]: (prev[currentRevisionId] ?? []).filter(
            (synthetic) => synthetic.id !== roleId,
          ),
        }))
      }

      if (selectedNodeId === roleId) {
        onSelectNode(null)
      }
      onSelectedEdgeChange(null)
      markNodesDirty(affectedByRemoval)
    },
    [
      baseSyntheticById,
      currentRevisionId,
      markNodesDirty,
      onRevisionEdgesChange,
      onSelectNode,
      onSelectedEdgeChange,
      revisionEdges,
      selectedNodeId,
      onTeamMutationStart,
    ],
  )

  const addCustomRole = useCallback(
    (name: string, roleDesc: string) => {
      if (!currentRevisionId) return
      onTeamMutationStart?.()
      const words = name.trim().split(/\s+/)
      const code =
        words.length >= 2
          ? (words[0][0] + words[1][0]).toUpperCase()
          : name.slice(0, 2).toUpperCase()
      const id = `syn-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const maxX =
        visibleSynthetics.length > 0
          ? Math.max(...visibleSynthetics.map((node) => node.layout.x))
          : 540
      const minY =
        visibleSynthetics.length > 0
          ? Math.min(...visibleSynthetics.map((node) => node.layout.y))
          : 180
      const col = addedSynthetics.length % 4
      const row = Math.floor(addedSynthetics.length / 4)
      const newSynthetic: SyntheticNode = {
        id,
        code,
        name,
        role: roleDesc,
        status: "proposed",
        layout: { x: maxX + 180 + col * 130, y: minY + 40 + row * 130 },
        config: { enabled: true, temperature: 0.3, strictness: 72, engagementPercent: 68 },
      }
      setAddedSyntheticsByRevision((prev) => ({
        ...prev,
        [currentRevisionId]: [...(prev[currentRevisionId] ?? []), newSynthetic],
      }))
      const edgesToAdd: SyntheticEdge[] = []
      const ideaEdgeId = `edge-idea-${newSynthetic.id}`
      if (!revisionEdges.some((e) => e.id === ideaEdgeId)) {
        edgesToAdd.push({ id: ideaEdgeId, from: "idea", to: newSynthetic.id, type: "structural" })
      }
      const outcomeEdgeId = `edge-${newSynthetic.id}-outcome`
      if (!revisionEdges.some((e) => e.id === outcomeEdgeId)) {
        edgesToAdd.push({ id: outcomeEdgeId, from: newSynthetic.id, to: "outcome", type: "structural" })
      }
      if (edgesToAdd.length > 0) onRevisionEdgesChange([...revisionEdges, ...edgesToAdd])
      onSelectedEdgeChange(null)
      onSelectNode(newSynthetic.id)
      markNodesDirty([newSynthetic.id])
    },
    [
      addedSynthetics.length,
      currentRevisionId,
      markNodesDirty,
      onRevisionEdgesChange,
      onSelectNode,
      onSelectedEdgeChange,
      revisionEdges,
      visibleSynthetics,
      onTeamMutationStart,
    ],
  )

  const handleDeleteSelectedRole = useCallback(() => {
    if (!selectedSyntheticNode) {
      return
    }
    setPendingRoleDeleteId(selectedSyntheticNode.id)
  }, [selectedSyntheticNode])

  const resetEditorState = useCallback(() => {
    setPendingRoleDeleteId(null)
    setPendingConnection(null)
    setAddedSyntheticsByRevision({})
    setRemovedSyntheticIdsByRevision({})
  }, [])

  return {
    pendingRoleDeleteId,
    setPendingRoleDeleteId,
    pendingConnection,
    setPendingConnection,
    setAddedSyntheticsByRevision,
    setRemovedSyntheticIdsByRevision,
    addedSynthetics,
    visibleSynthetics,
    roleTemplates,
    roleTemplateById,
    filteredRoleTemplates,
    selectedSyntheticNode,
    selectedSyntheticEdgeCount,
    pendingDeleteRole,
    pendingDeleteRoleEdgeCount,
    handleConnect,
    confirmConnection,
    handleReconnect,
    handleAddRole,
    addCustomRole,
    handleDeleteSelectedRole,
    removeRoleById,
    resetEditorState,
  }
}
