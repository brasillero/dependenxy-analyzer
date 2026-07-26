import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** "1 project" / "4 projects" — count plus correctly pluralized noun. */
export function pluralize(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`
}

/** Last path segment for compact display ('group/sub/project' -> 'project'). */
export function shortName(displayName: string): string {
  return displayName.split('/').filter(Boolean).pop() ?? displayName
}
