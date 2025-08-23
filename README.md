# 🏍️ Turbo Trails - Web3 Blockchain Racing Game

A realistic 3D endless bike racing game with blockchain integration, featuring career mode, head-to-head PvP races, and a complete Web3 economy powered by TURBO tokens.

## 🎮 Game Features

### Core Gameplay
- **Realistic 3D Physics**: Built with Three.js and Cannon.js for authentic bike physics
- **Ragdoll System**: High-speed collisions trigger realistic ragdoll effects
- **Two Camera Modes**: Toggle between first-person and third-person views
- **Procedural Tracks**: Endless, curved, and challenging terrain generation
- **3 Lives System**: Strategic gameplay with limited chances per run

### Game Modes
1. **Career Mode**: Endless racing for high scores and TURBO token rewards
2. **Head-to-Head Mode**: 
   - **Live PvP**: Real-time races with betting functionality
   - **Ghost Races**: Solo races against recorded runs

### Web3 Integration
- **Privy Authentication**: Seamless wallet connection with Monad Games ID
- **TURBO Token (ERC-20)**: In-game currency with minting and burning mechanics
- **Smart Contract Economy**: Item ownership, purchases, and race betting
- **Blockchain Leaderboards**: Scores stored on-chain via Monad Games ID contract
- **Username Integration**: Fetches player usernames from Monad Games ID API

### Shop & Items
- **Single-Use Items**: Nitro Boost, Shield Bubble
- **Permanent Upgrades**: Grip Tires, Armor Plate, Turbo Engine
- **Bike Upgrades**: Complete bike enhancement packages
- **3D Model Viewer**: Interactive preview of items and bikes

## 🛠️ Technical Stack

### Frontend
- **Next.js 14**: React framework with App Router
- **Three.js**: 3D graphics and rendering
- **Cannon.js**: Physics simulation
- **@privy-io/react-auth**: Web3 authentication
- **Ethers.js**: Blockchain interaction

### Backend
- **Next.js API Routes**: Server-side blockchain operations
- **Node.js**: Runtime environment

### Blockchain
- **Solidity**: Smart contract development
- **Monad Network**: Target blockchain
- **OpenZeppelin**: Secure contract libraries

## 🚀 Setup Instructions

### Prerequisites
- Node.js 18+ installed
- Git installed
- Monad network RPC access
- Privy account and app ID

### 1. Clone and Install
```bash
git clone <repository-url>
cd turbo-trails
npm install
```

### 2. Install Additional Dependencies
```bash
# Install Solidity compiler and OpenZeppelin contracts
npm install solc @openzeppelin/contracts

# Install Three.js loaders
npm install three@^0.158.0
```

### 3. Environment Setup
```bash
# Copy the environment template
cp .env.local.example .env.local
```

Edit `.env.local` with your configuration:
```env
# Private key for the server wallet (used to submit scores and mint tokens)
PRIVATE_KEY=your_private_key_here

# RPC URL for Monad network
RPC_URL=https://your-monad-rpc-url

# Privy configuration
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id

# Monad Games ID contract address (official)
MONAD_GAMES_ID_CONTRACT=0xceCBFF203C8B6044F52CE23D914A1bfD997541A4

# Contract addresses (will be filled after deployment)
INTERMEDIARY_CONTRACT_ADDRESS=
TURBO_TOKEN_CONTRACT_ADDRESS=
```

### 4. Compile Smart Contracts
```bash
cd contracts
node compile.js
```

### 5. Deploy Smart Contracts
```bash
# Make sure your .env.local has PRIVATE_KEY and RPC_URL set
node deploy.js
```

After deployment, update your `.env.local` with the contract addresses shown in the console output.

### 6. Start the Development Server
```bash
npm run dev
```

Visit `http://localhost:3000` to play the game!

## 📁 Project Structure

```
turbo-trails/
├── components/           # React components
│   ├── GameEngine.js    # Main 3D game logic
│   ├── MainMenu.js      # Game menu interface
│   ├── Shop.js          # Item shop with 3D viewer
│   └── Leaderboard.js   # Blockchain leaderboard
├── contracts/           # Smart contracts
│   ├── TurboToken.sol   # ERC-20 token contract
│   ├── GameIntermediary.sol # Game logic contract
│   ├── compile.js       # Compilation script
│   └── deploy.js        # Deployment script
├── pages/               # Next.js pages
│   ├── api/            # API routes
│   │   ├── submit-score.js
│   │   ├── leaderboard.js
│   │   ├── player-data.js
│   │   ├── shop-items.js
│   │   └── purchase-item.js
│   ├── _app.js         # App wrapper with Privy
│   └── index.js        # Main game page
├── styles/
│   └── globals.css     # Game styling
├── public/             # Static assets
│   └── models/         # 3D model files (.gltf/.obj)
└── package.json
```

## 🎯 Game Controls

| Key | Action |
|-----|--------|
| **WASD** | Move bike (accelerate, brake, steer) |
| **SPACE** | Brake |
| **SHIFT** | Nitro boost (if available) |
| **C** | Toggle camera view |
| **P** | Pause (Career/Ghost mode only) |

## 🔧 Smart Contract Architecture

### TurboToken (ERC-20)
- Mintable token with authorized minter system
- Burn functionality for token sink mechanics
- No fixed supply cap - managed through game economy

### GameIntermediary
- Interfaces with Monad Games ID contract
- Handles score submission and token minting
- Manages item shop and player inventory
- Processes race betting and settlements

### Integration Flow
1. Player completes a race
2. Frontend sends score to `/api/submit-score`
3. Server calls `GameIntermediary.submitScoreAndMintTokens()`
4. Intermediary calls Monad Games ID contract to record score
5. Intermediary mints TURBO tokens as reward
6. Player receives tokens and score is recorded on-chain

## 🛒 Shop Economy

### Item Types
- **Type 0**: Single-use consumables
- **Type 1**: Permanent upgrades
- **Type 2**: Bike upgrades

### Token Economics
- **Earning Rate**: 10 TURBO tokens per 1 score point
- **Spending**: Items range from 100-2000+ TURBO tokens
- **Token Sinks**: All purchases burn tokens from circulation

## 🏆 Leaderboard System

Scores are stored on-chain via the Monad Games ID contract, ensuring:
- **Transparency**: All scores publicly verifiable
- **Persistence**: Permanent record of achievements
- **Integration**: Seamless with Monad Games ecosystem

## 🎨 3D Assets

The game supports loading external 3D models:
- **Format**: .GLTF and .OBJ files
- **Location**: `/public/models/` directory
- **Usage**: Bikes, characters, and shop items

### Adding Custom Models
1. Place model files in `/public/models/`
2. Update model paths in shop items or game objects
3. Models will be loaded automatically with fallback to placeholder geometry

## 🔒 Security Considerations

- Server wallet private key should be kept secure
- Smart contracts use OpenZeppelin libraries for security
- Input validation on all API endpoints
- Basic anti-cheat measures for score submission

## 🚀 Deployment to Production

### Frontend Deployment
```bash
npm run build
npm start
```

### Smart Contract Verification
After deployment, verify contracts on the block explorer for transparency.

### Environment Variables
Ensure all production environment variables are properly set:
- Use a dedicated server wallet with sufficient gas funds
- Set up proper RPC endpoints for reliability
- Configure Privy for production domain

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🎮 Play Now!

Experience the future of blockchain gaming with Turbo Trails - where skill meets Web3 technology!

---

**Built with ❤️ for the Monad Games ecosystem**
