const fs = require('fs');
const path = require('path');
const solc = require('solc');

/**
 * Solidity compiler script for Turbo Trails contracts
 * Run with: node compile.js
 */

function findImports(importPath) {
  // Handle OpenZeppelin imports
  if (importPath.startsWith('@openzeppelin/')) {
    try {
      const contractPath = path.join(__dirname, '..', 'node_modules', importPath);
      return { contents: fs.readFileSync(contractPath, 'utf8') };
    } catch (error) {
      console.error(`Could not resolve import: ${importPath}`);
      return { error: 'File not found' };
    }
  }
  
  // Handle local imports
  try {
    const contractPath = path.join(__dirname, importPath);
    return { contents: fs.readFileSync(contractPath, 'utf8') };
  } catch (error) {
    console.error(`Could not resolve import: ${importPath}`);
    return { error: 'File not found' };
  }
}

function compileContract(contractName) {
  console.log(`📝 Compiling ${contractName}...`);
  
  const contractPath = path.join(__dirname, `${contractName}.sol`);
  const source = fs.readFileSync(contractPath, 'utf8');
  
  const input = {
    language: 'Solidity',
    sources: {
      [`${contractName}.sol`]: {
        content: source,
      },
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode'],
        },
      },
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  };
  
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  
  if (output.errors) {
    output.errors.forEach((error) => {
      if (error.severity === 'error') {
        console.error(`❌ Error in ${contractName}:`, error.formattedMessage);
      } else {
        console.warn(`⚠️ Warning in ${contractName}:`, error.formattedMessage);
      }
    });
    
    if (output.errors.some(error => error.severity === 'error')) {
      throw new Error(`Compilation failed for ${contractName}`);
    }
  }
  
  const contract = output.contracts[`${contractName}.sol`][contractName];
  
  if (!contract) {
    throw new Error(`Contract ${contractName} not found in compilation output`);
  }
  
  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object,
  };
}

async function main() {
  console.log('🚀 Starting contract compilation...');
  
  // Create artifacts directory
  const artifactsDir = path.join(__dirname, 'artifacts');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
  
  const contracts = ['TurboToken', 'GameIntermediary'];
  
  for (const contractName of contracts) {
    try {
      const compiled = compileContract(contractName);
      
      // Save artifact
      const artifactPath = path.join(artifactsDir, `${contractName}.json`);
      fs.writeFileSync(artifactPath, JSON.stringify(compiled, null, 2));
      
      console.log(`✅ ${contractName} compiled successfully`);
      console.log(`   ABI entries: ${compiled.abi.length}`);
      console.log(`   Bytecode length: ${compiled.bytecode.length}`);
      
    } catch (error) {
      console.error(`❌ Failed to compile ${contractName}:`, error.message);
      process.exit(1);
    }
  }
  
  console.log('\n🎉 All contracts compiled successfully!');
  console.log('\n📋 Next steps:');
  console.log('1. Set up your .env.local file with RPC URL and private key');
  console.log('2. Run: node deploy.js');
  console.log('3. Update .env.local with deployed contract addresses');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Compilation failed:', error);
    process.exit(1);
  });
