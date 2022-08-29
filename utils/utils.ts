export function ensureEnvVar(varName: string): string {
  if (!process.env[varName]) {
    throw new Error(`Env var ${varName} not set or empty`)
  }
  return process.env[varName] as string
}
