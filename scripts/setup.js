const fs = require('fs');
const path = require('path');

/**
 * Setup script for Turbo Trails
 * Creates necessary directories and files
 */

async function setup() {
  console.log('🚀 Setting up Turbo Trails project...');
  
  // Create necessary directories
  const directories = [
    'public/models',
    'contracts/artifacts',
    'styles',
  ];
  
  directories.forEach(dir => {
    const fullPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`✅ Created directory: ${dir}`);
    }
  });
  
  // Create placeholder model files
  const placeholderModels = [
    'bike-default.gltf',
    'rider-default.gltf',
    'nitro-boost.gltf',
    'shield-bubble.gltf',
    'grip-tires.gltf',
    'armor-plate.gltf',
    'turbo-engine.gltf',
    'bike-tier1.gltf'
  ];
  
  placeholderModels.forEach(model => {
    const modelPath = path.join(__dirname, '..', 'public', 'models', model);
    if (!fs.existsSync(modelPath)) {
      // Create a simple placeholder GLTF file
      const placeholderGLTF = {
        "asset": { "version": "2.0" },
        "scene": 0,
        "scenes": [{ "nodes": [0] }],
        "nodes": [{ "mesh": 0 }],
        "meshes": [{
          "primitives": [{
            "attributes": { "POSITION": 0 },
            "indices": 1
          }]
        }],
        "accessors": [
          {
            "bufferView": 0,
            "componentType": 5126,
            "count": 8,
            "type": "VEC3",
            "max": [1, 1, 1],
            "min": [-1, -1, -1]
          },
          {
            "bufferView": 1,
            "componentType": 5123,
            "count": 36,
            "type": "SCALAR"
          }
        ],
        "bufferViews": [
          { "buffer": 0, "byteOffset": 0, "byteLength": 96 },
          { "buffer": 0, "byteOffset": 96, "byteLength": 72 }
        ],
        "buffers": [{ "byteLength": 168 }]
      };
      
      fs.writeFileSync(modelPath, JSON.stringify(placeholderGLTF, null, 2));
      console.log(`✅ Created placeholder model: ${model}`);
    }
  });
  
  // Create .env.local if it doesn't exist
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    const envExample = path.join(__dirname, '..', '.env.local.example');
    if (fs.existsSync(envExample)) {
      fs.copyFileSync(envExample, envPath);
      console.log('✅ Created .env.local from template');
      console.log('⚠️  Please update .env.local with your configuration');
    }
  }
  
  console.log('\n🎉 Setup complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Update .env.local with your configuration');
  console.log('2. Install dependencies: npm install');
  console.log('3. Install additional packages: npm install solc @openzeppelin/contracts');
  console.log('4. Compile contracts: cd contracts && node compile.js');
  console.log('5. Deploy contracts: node deploy.js');
  console.log('6. Start development: npm run dev');
}

setup().catch(console.error);
