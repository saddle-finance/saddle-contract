const shell = require('shelljs'); // This module is already a solidity-coverage dep

module.exports = {
  // TODO: remove VirtualSwap from skipFiles once coverage is added
  // TODO: add coverage for older contracts
  skipFiles: [
    'VirtualSwap/',
    'guarded/',
    'helper/',
    'libraries/',
    'AmplificationUtilsV1.sol',
    'SwapFlashLoanV1.sol',
    'SwapUtilsV1.sol',
    'SwapV1.sol'
  ],
  mocha: {
    grep: "@skip-on-coverage", // Find everything with this tag
    invert: true               // Run the grep's inverse set.
  }
}
