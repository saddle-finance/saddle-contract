/* eslint-disable @typescript-eslint/no-var-requires */
require("dotenv").config()
const fetch = require("node-fetch")
const NETWORKS = require("./utils").DEPLOYMENTS_TO_NETWORK

const ALLOWED_ARGS = ["--contract", "--action", "--network", "--help"]
const ALLOWED_ACTIONS = { getContractLibraries }

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
 * node scripts/etherscan.js --contract=ADDRESS --action=getContractLibraries --network=mainnet
 */
async function getContractLibraries() {
  try {
    const { "--network": network, "--contract": contract } = parseArgs()
    if (!contract) {
      throw new Error("Please provide '--contract'")
    }
    const { apiKeyName, explorerApi } = NETWORKS[network] || {}
    if (!apiKeyName || !explorerApi) {
      throw new Error(`Unable to process network: ${network}`)
    }

    const etherscanKey = process.env[apiKeyName]
    if (!etherscanKey) {
      throw new Error(`Please provide ${apiKeyName} in .env`)
    }
    const etherscanUrl = `${explorerApi}/api?module=contract&action=getsourcecode&address=${contract}&apikey=${etherscanKey}`

    const response = await fetch(etherscanUrl)
    if (!response.ok) throw new Error("getContractLibraries: Bad response")
    const json = await response.json()
    if (json.status !== "1") {
      throw new Error(`getContractLibraries: ${json.result}`)
    }
    const sourceCode = json.result?.[0].SourceCode.replace("{{", "{").replace(
      "}}",
      "}",
    )
    const sourceCodeJson = JSON.parse(sourceCode)
    const libraries = sourceCodeJson.settings.libraries
    if (!libraries) throw new Error("getContractLibraries: Libraries not found")
    return libraries
  } catch (e) {
    return { error: e.message }
  }
}

;(async function main() {
  const { "--action": action, "--help": help } = parseArgs()
  if (help) {
    console.log(`Usage: node scripts/etherscan.js [--action=ACTION] [--help]`)
    console.log(`Actions: ${Object.keys(ALLOWED_ACTIONS).join(", ")}`)
    return
  }
  const result = ALLOWED_ACTIONS?.[action]
    ? await ALLOWED_ACTIONS[action]()
    : {
        error: `Unknown action: ${args["--action"]}`,
      }
  process.stdout.write(JSON.stringify(result))
})()
