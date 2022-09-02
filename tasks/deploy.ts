import "hardhat-deploy"
import { task } from "hardhat/config"
import {
  compareDeployments,
  convertDeploymentsToSimpleAddressMap,
} from "./utils"

// Override the default deploy task
task("deploy", async (taskArgs, hre, runSuper) => {
  const { all } = hre.deployments
  /*
   * Pre-deployment actions
   */

  // Load exiting deployments
  const existingDeployments = convertDeploymentsToSimpleAddressMap(await all())

  /*
   * Run super task
   */
  await runSuper(taskArgs)

  /*
   * Post-deployment actions
   */
  const updatedDeployments = convertDeploymentsToSimpleAddressMap(await all())
  compareDeployments(existingDeployments, updatedDeployments)
})
