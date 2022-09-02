import "hardhat-deploy"
import { task } from "hardhat/config"
import { NetworkUserConfig } from "hardhat/types"
import {
  compareDeployments,
  convertDeploymentsToSimpleAddressMap,
} from "./utils"

// Override the default node task
task("node", "Starts a JSON-RPC server on top of Hardhat Network").setAction(
  async (taskArgs, hre, runSuper) => {
    const { all } = hre.deployments
    /*
     * Pre actions
     */

    // Forks an existing network if the given argument is a network name
    const network: NetworkUserConfig | undefined =
      hre.userConfig?.networks?.[taskArgs.fork]
    let prevDeployments = undefined
    if (network) {
      const networkName = taskArgs.fork
      console.log(`Found matching network name, ${networkName}`)

      // Workaround for hardhat-deploy issue #115 https://github.com/wighawag/hardhat-deploy/issues/115
      process.env["HARDHAT_DEPLOY_FORK"] = networkName
      const externalDeploymentsFolder = `deployments/${networkName}`

      if ("url" in network) {
        console.log(`Forking ${networkName} from RPC: ${network.url}`)

        // Set the task arguments for the super call
        taskArgs.noReset = true
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

      prevDeployments = convertDeploymentsToSimpleAddressMap(await all())
    }

    /*
     * Super actions
     */
    await runSuper(taskArgs)

    /*
     * Post actions
     */
    if (prevDeployments) {
      compareDeployments(
        prevDeployments,
        convertDeploymentsToSimpleAddressMap(await all()),
      )
    }
  },
)
