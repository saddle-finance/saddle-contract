const shell = require('shelljs'); // This module is already a solidity-coverage dep

module.exports = {
  onCompileComplete: async function(config){
    shell.exec("typechain --target ethers-v5 --outDir typechain 'artifacts/*.json'");
  },
  onIstanbulComplete: async function(config){
    shell.rm('-rf', './typechain'); // Clean up at the end
  }
}
