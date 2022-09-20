import { Address, Deployment } from "hardhat-deploy/dist/types"

/**
 * Prints a table with the new deployments name and address.
 * Both parameters are object type of { [contractName: string]: string }
 * @param prevDeployments Object containing the names and addresses of previous deployments
 * @param currDeployments Object containing the names and addresses of current deployments
 */
export function compareDeployments(
  prevDeployments: { [contractName: string]: Address },
  currDeployments: { [contractName: string]: Address },
) {
  // Filter out any existing deployments that have not changed
  const newDeployments: { [contractName: string]: Address } = Object.keys(
    currDeployments,
  ).reduce((acc: { [contractName: string]: Address }, key) => {
    if (
      !currDeployments.hasOwnProperty(key) ||
      prevDeployments[key] !== currDeployments[key]
    ) {
      acc[key] = currDeployments[key]
    }
    return acc
  }, {})

  // Print the new deployments to the console
  if (Object.keys(newDeployments).length > 0) {
    console.log("\nNew deployments:")
    console.table(Object.entries(newDeployments))
  } else {
    console.warn("\nNo new deployments found")
  }
}

/**
 * Converts the deployments from the hardhat-deploy library to a simple address map
 * @param deploymentMap The deployments you get from the hardhat-deploy library using functions like all()
 * @returns Object with key value pairs of contract name to address
 */
export function convertDeploymentsToSimpleAddressMap(deploymentMap: {
  [p: string]: Deployment
}): { [p: string]: Address } {
  return Object.entries(deploymentMap).reduce(
    (acc: { [p: string]: string }, [k, v]) => {
      return { ...acc, [k]: v.address }
    },
    {},
  )
}
