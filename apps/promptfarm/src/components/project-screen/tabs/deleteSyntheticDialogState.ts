export function getDeleteSyntheticDialogDescription(
  roleName: string | null,
): string {
  if (roleName) {
    return `Remove "${roleName}" from the simulation team?`;
  }

  return "Remove this synthetic from the simulation team?";
}
