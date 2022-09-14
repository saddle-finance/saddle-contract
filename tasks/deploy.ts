import "hardhat-deploy"
import { TASK_DEPLOY_RUN_DEPLOY } from "hardhat-deploy"
import { subtask } from "hardhat/config"
import {
  compareDeployments,
  convertDeploymentsToSimpleAddressMap,
} from "./utils"

/*
 * Prints a table with the new deployments name and address on deploys
 */
subtask(TASK_DEPLOY_RUN_DEPLOY, async (taskArgs, hre, runSuper) => {
  const { all } = hre.deployments
  /*
   * Pre-deployment actions
   */

  // Load exiting deployments
  const existingDeployments = convertDeploymentsToSimpleAddressMap(await all())

  /*
   * Run super task
   */
  const returnData = await runSuper(taskArgs)

  /*
   * Post-deployment actions
   */
  const updatedDeployments = convertDeploymentsToSimpleAddressMap(await all())
  compareDeployments(existingDeployments, updatedDeployments)

  return returnData
})
