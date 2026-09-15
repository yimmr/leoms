export type ClassValue = string | number | boolean | undefined | null | { [key: string]: any } | ClassValue[];

export function cn(...inputs: any[]): string {
  return inputs
    .flat(Infinity)
    .filter(Boolean)
    .map((x) => (typeof x === "object" ? Object.keys(x).filter((k) => x[k]).join(" ") : String(x)))
    .join(" ");
}
