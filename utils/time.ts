import { BigNumber, BigNumberish } from "ethers"

/**
 * Delays execution for the given number of milliseconds. Helpful to use
 * in tests to simulate slow networks or to avoid rate-limiting.
 * @param ms milliseconds to wait
 * @returns a promise that resolves after the given number of milliseconds
 */
export async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Converts timestamp in seconds to UTC date string.
 * @param timestamp timestamp in seconds
 * @returns UTC date string
 */
export function timestampToUTCString(timestamp: BigNumberish): string {
  timestamp = BigNumber.from(timestamp).toNumber()
  return new Date(timestamp * 1000).toUTCString()
}

export const DAY = 86400
export const WEEK = DAY * 7
export const MAX_LOCK_TIME = DAY * 365 * 4
