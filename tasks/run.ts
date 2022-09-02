import "hardhat-deploy"
import { task, types } from "hardhat/config"
import { NetworkUserConfig } from "hardhat/types"

/*
 * Allows run command to specify which network to read deployments from
 * This is useful when you have running hardhat network like `hardhat node --fork mainnet`
 * and want to connect to it with existing deployments.
 * example: hardhat --network localhost run --include-network mainnet
 */
task("run", "Starts a JSON-RPC server on top of Hardhat Network")
  .addOptionalParam(
    "include-network",
    "The name of the network to include the deployments from. Only valid when running with --network localhost",
    "hardhat",
    types.string,
  )
  .setAction(async (taskArgs, hre, runSuper) => {
    /*
     * Pre actions
     */

    if (
      taskArgs["include-network"] &&
      hre.hardhatArguments.network !== "localhost"
    ) {
      throw new Error(
        `--include-network can only be used when using run command with "--network localhost"`,
      )
    }

    // Forks an existing network if the given argument is a network name
    const network: NetworkUserConfig | undefined =
      hre.userConfig?.networks?.[taskArgs["include-network"]]
    if (network) {
      const networkName = taskArgs["include-network"]
      console.log(`Found matching network name, ${networkName}`)

      // Workaround for hardhat-deploy issue #115 https://github.com/wighawag/hardhat-deploy/issues/115
      process.env["HARDHAT_DEPLOY_FORK"] = networkName
      const externalDeploymentsFolder = `deployments/${networkName}`

      if ("url" in network) {
        console.log(
          `Using existing deployments from ${externalDeploymentsFolder}`,
        )

        if (network.chainId) {
          hre.config.networks.hardhat.chainId = network.chainId
          hre.config.networks.localhost.chainId = network.chainId
          hre.network.config.chainId = network.chainId
        }

        if (network.verify) {
          hre.config.networks.hardhat.verify = network.verify
          hre.config.networks.localhost.verify = network.verify
          hre.network.verify = network.verify
        }

        hre.config.external = {
          ...hre.config.external,
          deployments: {
            ...hre.config.external?.deployments,
            hardhat: [externalDeploymentsFolder],
            localhost: [externalDeploymentsFolder],
          },
        }
      }
    }

    /*
     * Super actions
     */
    await runSuper(taskArgs)
  })
