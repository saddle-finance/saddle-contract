/* eslint-disable @typescript-eslint/no-var-requires */

const path = require("path")
const fs = require("fs")

const ALLOWED_ARGS = [
  "--network", // eg --network=mainnet
  "--only-addresses", // print only addresses, no names
  "--lp-tokens", // print only lp tokens
  "--only-pools", // print only pools, no deposit or LPToken contracts
  "--only-registries", // print only registries
  "--json", // print as JSON
  "--help", // print help text
  "--with-comments", // print pool name as comment
  "--graph-config", // print graph config
  "--after-block", // files with blockNumber greater than
]

// Filters
function saddleFilesFilter(file) {
  const name = file.toLowerCase()
  return (
    name.includes("saddle") || name.includes("sdl") || name.includes("registry")
  )
}

function onlyPoolsFilter(file) {
  const name = file.toLowerCase()
  return (
    /^saddle.+pool.* ?(:?\.json)?$/.test(name) &&
    !onlyLpTokensFilter(file) &&
    !name.includes("deposit")
  )
}

function onlyLpTokensFilter(file) {
  const name = file.toLowerCase()
  return /^saddle.+lptoken(:?\.json)?$/.test(name)
}

function onlyRegistriesFilter(file) {
  const name = file.toLowerCase()
  return name.includes("registry")
}

function graphConfigFilter(file) {
  return onlyPoolsFilter(file) || onlyRegistriesFilter(file)
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

function getContractData(network, filePath) {
  const errors = []
  let data = null
  const name = filePath.split(".")[0]
  try {
    const contract = require(`../deployments/${network}/${name}.json`)
    const startBlock = contract.receipt?.blockNumber || -1
    data = {
      address: contract.address,
      startBlock,
      name,
    }
    if (startBlock === -1) {
      errors.push(`No blockNumber for contract ${name}`)
    }
  } catch {
    errors.push(`Contract ${name} not found for network "${network}"`)
  }
  return { errors, data }
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
      `Usage: node printSaddleAddrs.js [--network=<network>] [--only-addresses] [--only-pools] [--only-registries] [--json] [--help] [--with-comments] [--graph-config]`,
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
    .filter(
      args["--only-pools"]
        ? onlyPoolsFilter
        : args["--graph-config"]
        ? graphConfigFilter
        : args["--only-registries"]
        ? onlyRegistriesFilter
        : args["--only-lp-tokens"]
        ? onlyLpTokensFilter
        : () => true,
    )
    .forEach((file) => {
      const { data } = getContractData(network, file)

      if (args["--after-block"] !== undefined) {
        if (data.startBlock < Number(args["--after-block"])) {
          return
        }
      }
      if (data) {
        longestName = Math.max(longestName, data.name.length)
        // TODO add errors
        masterMap[data.name] = data
      }
    })

  // Display results
  if (args["--graph-config"]) {
    const configNetwork = network === "localhost" ? "hardhat" : network
    const config = { errors: [], data: { network: configNetwork } }
    if (masterMap["MasterRegistry"]) {
      config.data.masterRegistry = {
        address: masterMap["MasterRegistry"].address,
        startBlock: masterMap["MasterRegistry"].blockNumber,
      }
    }
    if (masterMap["PoolRegistry"]) {
      config.data.poolRegistry = {
        address: masterMap["PoolRegistry"].address,
        startBlock: masterMap["PoolRegistry"].blockNumber,
      }
    }
    config.data.existingPools = Object.values(masterMap)
      .filter(({ name }) => onlyPoolsFilter(name))
      .sort((a, b) => a.startBlock - b.startBlock)
    // TODO add errors
    console.log(JSON.stringify(config))
  } else if (args["--json"]) {
    if (args["--only-addresses"]) {
      console.log(
        JSON.stringify(
          Object.values(masterMap)
            .map(({ address }) => address)
            .sort(sortLowercase),
        ),
      )
    } else {
      const newMap = {}
      Object.keys(masterMap).forEach((key) => {
        newMap[key] = masterMap[key].address
      })
      newMap["__network"] = network
      console.log(JSON.stringify(newMap))
    }
  } else {
    if (args["--only-addresses"]) {
      if (args["--with-comments"]) {
        console.log(
          Object.keys(masterMap)
            .sort(sortLowercase)
            .map((name) => {
              const address = masterMap[name].address
              return `"${address}", // ${name}`
            })
            .join("\n"),
        )
      } else {
        console.log(
          Object.values(masterMap)
            .map(({ address }) => address)
            .sort(sortLowercase)
            .join("\n"),
        )
      }
    } else {
      Object.keys(masterMap)
        .sort(sortLowercase)
        .forEach((key) => {
          const address = masterMap[key].address
          console.log(`${key.padEnd(longestName)} ${address.padEnd(40)}`)
        })
    }
  }
}

main()
