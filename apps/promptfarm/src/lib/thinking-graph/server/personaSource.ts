import { access, readFile } from "node:fs/promises"
import { constants as fsConstants } from "node:fs"
import path from "node:path"

import {
  DEFAULT_GAMEDEV_PERSONA_IDS,
  type DefaultGameDevPersonaId,
  type SyntheticPersona,
} from "./types"

const PERSONA_FILE_NAMES = ["gamedev.md", "business-startup.md", "health-fitness.md", "education.md"]

/** Derive a domain label from the persona filename. */
function domainFromFileName(fileName: string): string {
  return fileName.replace(/\.md$/, "").replace(/-/g, "_")
}

const GAMEDEV_PERSONA_CANDIDATE_PATHS = [
  path.join(process.cwd(), "src", "personas", "gamedev.md"),
  path.join(process.cwd(), "apps", "promptfarm", "src", "personas", "gamedev.md"),
]

async function resolvePersonaDir(): Promise<string> {
  const candidates = [
    path.join(process.cwd(), "src", "personas"),
    path.join(process.cwd(), "apps", "promptfarm", "src", "personas"),
  ]
  for (const dir of candidates) {
    try {
      await access(path.join(dir, "gamedev.md"), fsConstants.R_OK)
      return dir
    } catch {
      continue
    }
  }
  throw new Error("Could not locate personas directory.")
}

async function resolveGameDevPersonaPath(): Promise<string> {
  for (const candidatePath of GAMEDEV_PERSONA_CANDIDATE_PATHS) {
    try {
      await access(candidatePath, fsConstants.R_OK)
      return candidatePath
    } catch {
      continue
    }
  }

  throw new Error(
    "Could not locate gamedev personas markdown. Expected one of: " +
      GAMEDEV_PERSONA_CANDIDATE_PATHS.join(", "),
  )
}

function parsePersonaBlocks(
  markdown: string,
  sourcePath: string,
  domain?: string,
): SyntheticPersona[] {
  const blocks = markdown.split(/^### /m).slice(1)
  const personas: SyntheticPersona[] = []
  // Derive domain from file path when not supplied explicitly
  const resolvedDomain =
    domain ??
    domainFromFileName(sourcePath.split(/[/\\]/).pop() ?? "gamedev.md")

  for (const block of blocks) {
    const lines = block.split(/\r?\n/)
    const heading = lines[0]?.trim() ?? ""
    const idMatch = heading.match(/^`([^`]+)`/)
    if (!idMatch) {
      continue
    }

    let title = ""
    let weight = 1
    let inDescription = false
    const descriptionLines: string[] = []

    for (const rawLine of lines.slice(1)) {
      const line = rawLine.trimEnd()

      if (line.startsWith("**Title:**")) {
        title = line.replace("**Title:**", "").trim()
        continue
      }

      if (line.startsWith("**Weight:**")) {
        const parsedWeight = Number(line.replace("**Weight:**", "").trim())
        if (!Number.isNaN(parsedWeight)) {
          weight = parsedWeight
        }
        continue
      }

      if (line.startsWith("**Description:**")) {
        inDescription = true
        continue
      }

      if (inDescription && line.trim() === "---") {
        break
      }

      if (inDescription) {
        descriptionLines.push(line)
      }
    }

    const description = descriptionLines.join("\n").trim()
    if (!title || !description) {
      continue
    }

    personas.push({
      id: idMatch[1],
      title,
      weight,
      description,
      domain: resolvedDomain,
      sourcePath,
    })
  }

  return personas
}

export async function loadGameDevelopmentPersonas(): Promise<SyntheticPersona[]> {
  const sourcePath = await resolveGameDevPersonaPath()
  const markdown = await readFile(sourcePath, "utf8")
  return parsePersonaBlocks(markdown, sourcePath)
}

export async function loadSelectedGameDevelopmentPersonas(
  ids: readonly string[] = DEFAULT_GAMEDEV_PERSONA_IDS,
): Promise<SyntheticPersona[]> {
  const personas = await loadGameDevelopmentPersonas()
  const personaById = new Map(personas.map((persona) => [persona.id, persona]))

  return ids.map((id) => {
    const persona = personaById.get(id)
    if (!persona) {
      throw new Error(`Persona "${id}" was not found in gamedev.md.`)
    }
    return persona
  })
}

export async function loadDefaultGameDevelopmentPersonas(): Promise<
  SyntheticPersona[]
> {
  return loadSelectedGameDevelopmentPersonas(DEFAULT_GAMEDEV_PERSONA_IDS)
}

export function isDefaultGameDevPersonaId(
  value: string,
): value is DefaultGameDevPersonaId {
  return DEFAULT_GAMEDEV_PERSONA_IDS.includes(value as DefaultGameDevPersonaId)
}

/** Load every persona from every domain file. Used by the Director so it can suggest
 *  cross-domain experts regardless of which domain the user picked. */
export async function loadAllPersonas(): Promise<SyntheticPersona[]> {
  const dir = await resolvePersonaDir()
  const results = await Promise.allSettled(
    PERSONA_FILE_NAMES.map(async (fileName) => {
      const filePath = path.join(dir, fileName)
      const markdown = await readFile(filePath, "utf8")
      return parsePersonaBlocks(markdown, filePath)
    }),
  )
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []))
}
