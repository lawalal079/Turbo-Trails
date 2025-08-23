const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

/**
 * Deployment script for Turbo Trails smart contracts
 * Run with: node deploy.js
 */

async function main() {
    // Configuration
    const RPC_URL = process.env.RPC_URL || "http://localhost:8545";
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    const MONAD_GAMES_ID_CONTRACT = process.env.MONAD_GAMES_ID_CONTRACT || "0xceCBFF203C8B6044F52CE23D914A1bfD997541A4";
    
    if (!PRIVATE_KEY) {
        throw new Error("PRIVATE_KEY environment variable is required");
    }
    
    console.log("🚀 Starting Turbo Trails contract deployment...");
    
    // Setup provider and wallet
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log(`📝 Deploying from address: ${wallet.address}`);
    
    // Read contract ABIs and bytecode (you'll need to compile these first)
    const turboTokenArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, "artifacts/TurboToken.json")));
    const gameIntermediaryArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, "artifacts/GameIntermediary.json")));
    
    // Deploy TurboToken
    console.log("🪙 Deploying TurboToken...");
    const TurboTokenFactory = new ethers.ContractFactory(
        turboTokenArtifact.abi,
        turboTokenArtifact.bytecode,
        wallet
    );
    
    const turboToken = await TurboTokenFactory.deploy();
    await turboToken.waitForDeployment();
    const turboTokenAddress = await turboToken.getAddress();
    
    console.log(`✅ TurboToken deployed at: ${turboTokenAddress}`);
    
    // Deploy GameIntermediary
    console.log("🎮 Deploying GameIntermediary...");
    const GameIntermediaryFactory = new ethers.ContractFactory(
        gameIntermediaryArtifact.abi,
        gameIntermediaryArtifact.bytecode,
        wallet
    );
    
    const gameIntermediary = await GameIntermediaryFactory.deploy(
        turboTokenAddress,
        MONAD_GAMES_ID_CONTRACT
    );
    await gameIntermediary.waitForDeployment();
    const gameIntermediaryAddress = await gameIntermediary.getAddress();
    
    console.log(`✅ GameIntermediary deployed at: ${gameIntermediaryAddress}`);
    
    // Setup permissions
    console.log("🔧 Setting up permissions...");
    
    // Add GameIntermediary as authorized minter for TurboToken
    const addMinterTx = await turboToken.addMinter(gameIntermediaryAddress);
    await addMinterTx.wait();
    console.log("✅ GameIntermediary added as authorized minter");
    
    // Set game server address (same as deployer for now)
    const setGameServerTx = await gameIntermediary.setGameServer(wallet.address);
    await setGameServerTx.wait();
    console.log("✅ Game server address set");
    
    // Save deployment info
    const deploymentInfo = {
        network: "monad",
        turboToken: turboTokenAddress,
        gameIntermediary: gameIntermediaryAddress,
        monadGamesId: MONAD_GAMES_ID_CONTRACT,
        deployer: wallet.address,
        deployedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(
        path.join(__dirname, "../deployment.json"),
        JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log("📄 Deployment info saved to deployment.json");
    console.log("\n🎉 Deployment completed successfully!");
    console.log("\n📋 Contract Addresses:");
    console.log(`TurboToken: ${turboTokenAddress}`);
    console.log(`GameIntermediary: ${gameIntermediaryAddress}`);
    console.log(`MonadGamesID: ${MONAD_GAMES_ID_CONTRACT}`);
    
    console.log("\n🔧 Next steps:");
    console.log("1. Update your .env.local file with the contract addresses");
    console.log("2. Verify contracts on block explorer if needed");
    console.log("3. Test the integration with your game");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
