import { Address, Deployment } from "hardhat-deploy/dist/types"

export function compareDeployments(
  prevDeplyments: { [contractName: string]: Address },
  currDeployments: { [contractName: string]: Address },
) {
  // Filter out any existing deployments that have not changed
  const newDeployments: { [contractName: string]: Address } = Object.keys(
    currDeployments,
  ).reduce((acc: { [contractName: string]: Address }, key) => {
    if (
      !currDeployments.hasOwnProperty(key) ||
      prevDeplyments[key] !== currDeployments[key]
    ) {
      acc[key] = currDeployments[key]
    }
    return acc
  }, {})

  // Print the new deployments to the console
  if (Object.keys(newDeployments).length > 0) {
    console.log("\nNew deployments:")
    console.table(newDeployments)
  } else {
    console.warn("\nNo new deployments found")
  }
}

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
