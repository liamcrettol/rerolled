/** Strip the Bungie numeric suffix (#1234) from a display name. */
export function trimBungieName(name: string): string {
  return name.replace(/#\d+$/, "").trim();
}
