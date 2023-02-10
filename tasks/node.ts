import "hardhat-deploy"
import { task } from "hardhat/config"
import { NetworkUserConfig } from "hardhat/types"
import { MULTISIG_ADDRESSES, PROD_DEPLOYER_ADDRESS } from "../utils/accounts"

/*
 * Extends the --fork option to parse network names
 * example: hardhat node --fork arbitrum_mainnet --fork-block-number 111111
 *          hardhat node --fork mainnet
 */
task("node", "Starts a JSON-RPC server on top of Hardhat Network").setAction(
  async (taskArgs, hre, runSuper) => {
    /*
     * Pre actions
     */

    // Forks an existing network if the given argument is a network name
    const network: NetworkUserConfig | undefined =
      hre.userConfig?.networks?.[taskArgs.fork]
    if (network) {
      const networkName = taskArgs.fork
      console.log(`Found matching network name, ${networkName}`)

      // Workaround for hardhat-deploy issue #115
      // https://github.com/wighawag/hardhat-deploy/issues/115
      process.env["HARDHAT_DEPLOY_FORK"] = networkName
      const externalDeploymentsFolder = `deployments/${networkName}`

      if ("url" in network) {
        console.log(`Forking ${networkName} from RPC: ${network.url}`)

        // Set the task arguments for the super call
        taskArgs.fork = network.url

        console.log(
          `Forking with deployments from ${externalDeploymentsFolder}`,
        )

        if (network.chainId) {
          hre.config.networks.hardhat.chainId = network.chainId
          hre.config.networks.localhost.chainId = network.chainId
        }

        if (network.deploy) {
          hre.config.networks.hardhat.deploy = network.deploy as string[]
          hre.config.networks.localhost.deploy = network.deploy as string[]
        }

        if (network.verify) {
          hre.config.networks.hardhat.verify = network.verify
          hre.config.networks.localhost.verify = network.verify
        }

        // Override namedAccounts settings so that in fork mode, we use
        // production deployer address as "deployer"
        // production multisig address of that chain as "multisig"
        hre.config.namedAccounts = {
          ...hre.config.namedAccounts,
          deployer: {
            [String(network.chainId)]: PROD_DEPLOYER_ADDRESS,
          },
          multisig: {
            [String(network.chainId)]:
              MULTISIG_ADDRESSES[String(network.chainId)],
          },
        }

        // Set external deployments path to copy over deployments before starting node
        hre.config.external = {
          ...hre.config.external,
          deployments: {
            ...hre.config.external?.deployments,
            hardhat: [externalDeploymentsFolder],
            localhost: [externalDeploymentsFolder],
          },
        }
      } else {
        throw new Error(
          `Could not find url to fork inside the "${networkName}" network config`,
        )
      }
    }

    /*
     * Super actions
     */
    return runSuper(taskArgs)
  },
)
