/* eslint-disable @typescript-eslint/no-var-requires */

const path = require("path")
const fs = require("fs")

const ALLOWED_ARGS = [
  "--network", // eg --network=mainnet
  "--only-addresses", // print only addresses, no names
  "--only-pools", // print only pools, no deposit or LPToken contracts
  "--json", // print as JSON
  "--help", // print help text
]

// Filters
function saddleFilesFilter(file) {
  const name = file.toLowerCase()
  return name.includes("saddle") || name.includes("sdl")
}
function onlyPoolsFilter(file) {
  const name = file.toLowerCase()
  return (
    !name.includes("lptoken") &&
    !name.includes("sdl") &&
    !name.includes("deposit")
  )
}

// Helpers
function sortLowercase(a, b) {
  return a.toLowerCase().localeCompare(b.toLowerCase())
}
function parseArgs() {
  const args = process.argv.slice(2)
  const result = {}
  ALLOWED_ARGS.forEach((arg) => {
    const match = args.find((a) => a.startsWith(arg))
    if (match) {
      result[arg] = match.split("=")[1] || true
    }
  })

  return result
}

/**
 * @notice Prints all Saddle contract addresses parsed from the deployments directory
 * Allows filtering and basic reformatting. Use --help for more infor
 */
function main() {
  const args = parseArgs()

  // Display help text and exit
  if (args["--help"]) {
    console.log(
      `Usage: node printSaddleAddrs.js [--network=<network>] [--only-addresses] [--only-pools] [--json] [--help]`,
    )
    return
  }

  // Attempt to read the deployments directory for a given network
  const network = args["--network"] || "mainnet"
  let files
  try {
    files = fs.readdirSync(path.resolve(`deployments/${network}`))
  } catch (e) {
    console.log(`No deployments found for network "${network}"`)
    return
  }

  // Filter and collect files
  const masterMap = {}
  let longestName = 0
  files
    .filter((file) => file.endsWith(".json"))
    .filter(saddleFilesFilter)
    .filter(args["--only-pools"] ? onlyPoolsFilter : () => true)
    .forEach((file) => {
      const json = require(`../deployments/${network}/${file}`)
      const name = file.split(".")[0]
      longestName = Math.max(longestName, name.length)
      masterMap[name] = json.address
    })

  // Display results
  if (args["--json"]) {
    if (args["--only-addresses"]) {
      console.log(JSON.stringify(Object.values(masterMap).sort(sortLowercase)))
    } else {
      masterMap["__network"] = network
      console.log(JSON.stringify(masterMap))
    }
  } else {
    console.log(`\n***** Printing addresses for ${network} *****\n`)
    if (args["--only-addresses"]) {
      console.log(Object.values(masterMap).sort().join("\n"))
    } else {
      Object.keys(masterMap)
        .sort(sortLowercase)
        .forEach((key) => {
          const address = masterMap[key]
          console.log(`${key.padEnd(longestName)} ${address.padEnd(40)}`)
        })
    }
  }
}

main()
