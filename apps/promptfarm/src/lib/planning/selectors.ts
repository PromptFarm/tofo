import type { GraphEdge, GraphNode, IterationNode, Project } from "./types"

export type RevisionTreeRow = {
  revision: IterationNode
  depth: number
}

const getIdeaGraphId = (project: Project) => `idea-${project.idea.id}`
const getIterationGraphId = (iteration: IterationNode) => `iteration-${iteration.id}`
const getRootRevisions = (project: Project) =>
  project.iterations.filter((revision) => !revision.parentId)

const getRevisionChildren = (project: Project, parentId: string) =>
  project.iterations.filter((revision) => revision.parentId === parentId)

const getRevisionsByCreatedAt = (revisions: IterationNode[]) =>
  [...revisions].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

export function getIterationById(project: Project, iterationId: string) {
  return project.iterations.find((iteration) => iteration.id === iterationId)
}

export function getIterationByVersion(project: Project, version: string) {
  return project.iterations.find((iteration) => iteration.version === version)
}

export function getLatestIteration(project: Project) {
  const ordered = getRevisionsByCreatedAt(project.iterations)
  return ordered.length > 0 ? ordered[ordered.length - 1] : undefined
}

export function getRevisionTreeRows(project: Project): RevisionTreeRow[] {
  const rows: RevisionTreeRow[] = []

  const walk = (revision: IterationNode, depth: number) => {
    rows.push({ revision, depth })

    const children = getRevisionsByCreatedAt(
      getRevisionChildren(project, revision.id)
    )
    children.forEach((child) => walk(child, depth + 1))
  }

  getRevisionsByCreatedAt(getRootRevisions(project)).forEach((root) => {
    walk(root, 0)
  })

  return rows
}

export function getRevisionPathIds(project: Project, revisionId: string): string[] {
  const path: string[] = []
  let current = getIterationById(project, revisionId)

  while (current) {
    path.unshift(current.id)
    current = current.parentId
      ? getIterationById(project, current.parentId)
      : undefined
  }

  return path
}

export function getGraphNodes(project: Project): GraphNode[] {
  const ideaNode: GraphNode = {
    id: getIdeaGraphId(project),
    type: "idea",
    refId: project.idea.id,
  }

  const iterationNodes: GraphNode[] = project.iterations.map((iteration) => ({
    id: getIterationGraphId(iteration),
    type: "iteration",
    refId: iteration.id,
  }))

  return [ideaNode, ...iterationNodes]
}

export function getGraphEdges(project: Project): GraphEdge[] {
  const ideaNodeId = getIdeaGraphId(project)
  const edges: GraphEdge[] = []

  project.iterations.forEach((revision) => {
    edges.push({
      from: revision.parentId ? `iteration-${revision.parentId}` : ideaNodeId,
      to: getIterationGraphId(revision),
    })
  })

  return edges
}
