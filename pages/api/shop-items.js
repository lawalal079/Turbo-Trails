import { ethers } from 'ethers';

// Game Intermediary contract ABI
const GAME_INTERMEDIARY_ABI = [
  "function gameItems(uint256 itemId) external view returns (string memory name, uint256 price, uint8 itemType, bool isActive, uint256 speedBoost, uint256 gripBoost, uint256 armorBoost, uint256 nitroBoost)"
];

function getDefaultItems() {
  const base = [
    {
      id: 1,
      name: "Nitro Boost",
      price: 100,
      type: 0,
      isActive: true,
      speedBoost: 0,
      gripBoost: 0,
      armorBoost: 0,
      nitroBoost: 50,
      description: "Single-use nitro boost for extra speed when you need it most.",
      modelPath: "/models/nitro-boost.glb"
    },
    {
      id: 2,
      name: "Shield Bubble",
      price: 150,
      type: 0,
      isActive: true,
      speedBoost: 0,
      gripBoost: 0,
      armorBoost: 30,
      nitroBoost: 0,
      description: "Protective shield that absorbs one collision.",
      modelPath: "/models/shield-bubble.glb"
    },
    {
      id: 3,
      name: "Grip Tires",
      price: 500,
      type: 1,
      isActive: true,
      speedBoost: 0,
      gripBoost: 25,
      armorBoost: 0,
      nitroBoost: 0,
      description: "Permanent upgrade that improves bike handling on rough terrain.",
      modelPath: "/models/grip-tires.glb"
    },
    {
      id: 4,
      name: "Armor Plate",
      price: 750,
      type: 1,
      isActive: true,
      speedBoost: 0,
      gripBoost: 0,
      armorBoost: 40,
      nitroBoost: 0,
      description: "Permanent armor upgrade that reduces collision damage.",
      modelPath: "/models/armor-plate.glb"
    },
    {
      id: 5,
      name: "Turbo Engine",
      price: 1000,
      type: 1,
      isActive: true,
      speedBoost: 30,
      gripBoost: 0,
      armorBoost: 0,
      nitroBoost: 0,
      description: "Permanent engine upgrade for increased top speed.",
      modelPath: "/models/turbo-engine.glb"
    },
    {
      id: 6,
      name: "Overdrive ECU",
      price: 800,
      type: 1,
      isActive: true,
      speedBoost: 20,
      gripBoost: 0,
      armorBoost: 0,
      nitroBoost: 0,
      description: "Permanent electronics tune that improves acceleration and top-end power.",
      modelPath: "/models/turbo-engine.glb"
    },
    {
      id: 7,
      name: "Reinforced Chassis",
      price: 900,
      type: 1,
      isActive: true,
      speedBoost: 0,
      gripBoost: 0,
      armorBoost: 25,
      nitroBoost: 0,
      description: "Permanent frame reinforcement that reduces damage on impact.",
      modelPath: "/models/armor-plate.glb"
    },
    {
      id: 8,
      name: "Traction Control",
      price: 700,
      type: 1,
      isActive: true,
      speedBoost: 0,
      gripBoost: 20,
      armorBoost: 0,
      nitroBoost: 0,
      description: "Permanent handling module that improves tire grip and stability.",
      modelPath: "/models/shield-bubble.glb"
    }
  ];
  // Deduplicate defaults by name and modelPath (case-insensitive)
  const seenNames = new Set();
  const seenModels = new Set();
  const deduped = base.filter((it) => {
    const nameKey = (it.name || `id-${it.id}`).trim().toLowerCase();
    const modelKey = (it.modelPath || '').trim().toLowerCase();
    if (seenNames.has(nameKey)) return false;
    if (modelKey && seenModels.has(modelKey)) return false;
    seenNames.add(nameKey);
    if (modelKey) seenModels.add(modelKey);
    return true;
  });
  return deduped.map(attachEffects);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Prevent caching to avoid stale duplicates in clients
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    // Setup blockchain connection (if configured)
    const rpcUrl = process.env.RPC_URL;
    const intermediaryAddress = process.env.INTERMEDIARY_CONTRACT_ADDRESS;
    if (!rpcUrl || !intermediaryAddress) {
      console.warn('Shop API: Missing RPC_URL or INTERMEDIARY_CONTRACT_ADDRESS. Returning defaults.');
      return res.status(200).json(getDefaultItems());
    }
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Connect to intermediary contract
    const intermediaryContract = new ethers.Contract(
      intermediaryAddress,
      GAME_INTERMEDIARY_ABI,
      provider
    );

    console.log('Fetching shop items from blockchain...');

    // Fetch items from contract (items 1-10 for now)
    const items = [];
    
    for (let itemId = 1; itemId <= 10; itemId++) {
      try {
        const itemData = await intermediaryContract.gameItems(itemId);
        
        // Check if item exists and is active
        if (itemData[0] && itemData[3]) { // name exists and isActive is true
          items.push(attachEffects({
            id: itemId,
            name: itemData[0],
            price: parseInt(itemData[1].toString()),
            type: itemData[2], // 0: single-use, 1: permanent, 2: bike upgrade
            isActive: itemData[3],
            speedBoost: parseInt(itemData[4].toString()),
            gripBoost: parseInt(itemData[5].toString()),
            armorBoost: parseInt(itemData[6].toString()),
            nitroBoost: parseInt(itemData[7].toString()),
            // Add descriptions and model paths
            description: getItemDescription(itemId, itemData[0]),
            modelPath: getItemModelPath(itemId, itemData[2])
          }));
        }
      } catch (error) {
        // Item doesn't exist or error fetching, continue to next
        console.warn(`Could not fetch item ${itemId}:`, error.message);
      }
    }

    // Fallback to defaults if chain returned no active items
    if (!items.length) {
      console.warn('Shop API: No items found on-chain. Returning defaults.');
      return res.status(200).json(getDefaultItems());
    }
    // Deduplicate by a canonical key: prefer model groups (e.g., any 'grip-tires' model collapses to one)
    const seenKeys = new Set();
    const deduped = items.filter((it) => {
      const nameKey = (it.name || `id-${it.id}`).trim().toLowerCase();
      const modelKey = (it.modelPath || '').trim().toLowerCase();
      const isGripModel = modelKey.includes('grip-tires');
      const key = isGripModel ? 'model:grip-tires' : (modelKey ? `model:${modelKey}` : `name:${nameKey}`);
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
    res.status(200).json(deduped);

  } catch (error) {
    console.error('Error fetching shop items:', error);
    
    // Return default items if blockchain fetch fails
    res.status(200).json(getDefaultItems());
  }
}

function getItemDescription(itemId, itemName) {
  const descriptions = {
    1: "Single-use nitro boost for extra speed when you need it most.",
    2: "Protective shield that absorbs one collision.",
    3: "Permanent upgrade that improves bike handling on rough terrain.",
    4: "Permanent armor upgrade that reduces collision damage.",
    5: "Permanent engine upgrade for increased top speed.",
    6: "Complete bike upgrade with balanced improvements to all stats.",
    7: "Advanced handling module to sharpen steering response.",
    8: "Lightweight frame components for improved acceleration and agility."
  };
  
  return descriptions[itemId] || `${itemName} - Enhance your racing performance.`;
}

function getItemModelPath(itemId, itemType) {
  const modelPaths = {
    1: "/models/nitro-boost.glb",
    2: "/models/shield-bubble.glb",
    3: "/models/grip-tires.glb",
    4: "/models/armor-plate.glb",
    5: "/models/turbo-engine.glb"
  };
  
  return modelPaths[itemId] || `/models/item-${itemId}.gltf`;
}

// Build a normalized effects list for UI from boost fields
function attachEffects(item) {
  const effects = [];
  if (item.speedBoost && item.speedBoost > 0) effects.push({ key: 'Speed Boost', value: `+${item.speedBoost}` });
  if (item.gripBoost && item.gripBoost > 0) effects.push({ key: 'Grip Boost', value: `+${item.gripBoost}` });
  if (item.armorBoost && item.armorBoost > 0) effects.push({ key: 'Armor Boost', value: `+${item.armorBoost}` });
  if (item.nitroBoost && item.nitroBoost > 0) effects.push({ key: 'Nitro Boost', value: `+${item.nitroBoost}` });
  return { ...item, effects };
}
