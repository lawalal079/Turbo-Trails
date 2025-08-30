import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';

export default function GameEngine({ gameMode, playerData, onGameEnd, onBackToMenu, bikeProfile, walletAddress }) {
  const mountRef = useRef(null);
  const gameRef = useRef(null);
  const [gameStats, setGameStats] = useState({
    score: 0,
    lives: 3,
    speed: 0,
    distance: 0,
    isPaused: false,
    isGameOver: false
  });
  const hasAutoSubmittedRef = useRef(false);
  const [cameraMode, setCameraMode] = useState('third-person'); // 'first-person' or 'third-person'

  useEffect(() => {
    if (mountRef.current) {
      console.log('[GameEngine] Mount detected. Creating TurboTrailsGame instance...', { gameMode, hasPlayerData: !!playerData });
      const game = new TurboTrailsGame(
        mountRef.current,
        gameMode,
        playerData,
        onGameEnd,
        setGameStats,
        setCameraMode,
        walletAddress
      );
      gameRef.current = game;
      // Apply initial bike profile BEFORE init so models load accordingly
      try {
        if (bikeProfile) {
          game.setBikeProfile(bikeProfile);
        }
      } catch {}
      game.init();

      return () => {
        console.log('[GameEngine] Disposing game instance...');
        game.dispose();
      };
    }
  }, [gameMode, playerData, onGameEnd]);

  // React to bikeProfile changes at runtime
  useEffect(() => {
    if (gameRef.current && bikeProfile) {
      try { gameRef.current.setBikeProfile(bikeProfile); } catch {}
    }
  }, [bikeProfile]);

  // Auto-submit results once when game transitions to Game Over
  useEffect(() => {
    if (gameStats.isGameOver && !hasAutoSubmittedRef.current) {
      hasAutoSubmittedRef.current = true;
      const distanceKm = Math.round(((gameStats.distance || 0) / 1000) * 100) / 100;
      try {
        onGameEnd && onGameEnd({ score: gameStats.score || 0, distanceKm });
      } catch (e) {
        console.warn('Auto onGameEnd failed:', e);
      }
    }
  }, [gameStats.isGameOver]);

  const handlePause = () => {
    if (gameRef.current && (gameMode === 'career' || gameMode === 'ghost')) {
      gameRef.current.togglePause();
    }
  };

  const handleCameraToggle = () => {
    if (gameRef.current) {
      gameRef.current.toggleCamera();
    }
  };

  const handleBackToMenu = () => {
    if (gameRef.current) {
      try {
        // Submit final stats if callback provided
        if (typeof onGameEnd === 'function') {
          const finalScore = Number(gameStats.score || 0);
          const distanceKm = Number((gameStats.distance || 0) / 1000);
          onGameEnd({ score: finalScore, distanceKm });
        }
      } catch {}
      gameRef.current.dispose();
    }
    onBackToMenu();
  };

  const handleRestart = () => {
    // Dispose existing game instance if any
    try { gameRef.current && gameRef.current.dispose(); } catch {}
    if (!mountRef.current) return;
    // Recreate a fresh game instance using the same props
    const game = new TurboTrailsGame(
      mountRef.current,
      gameMode,
      playerData,
      onGameEnd,
      setGameStats,
      setCameraMode,
      walletAddress
    );
    gameRef.current = game;
    try {
      if (bikeProfile) {
        game.setBikeProfile(bikeProfile);
      }
    } catch {}
    game.init();
  };

  return (
    <div className="game-container">
      <div
        ref={mountRef}
        className="game-canvas"
        tabIndex={0}
        onClick={() => {
          try { mountRef.current && mountRef.current.focus(); } catch {}
        }}
      />
      
      {/* Game UI */}
      <div className="game-ui">
        {/* Top HUD */}
        <div className="top-hud">
          <div className="hud-left">
            <div className="distance-display">
              Distance: {(gameStats.distance / 1000).toFixed(2)} km
            </div>
          </div>
          <div className="hud-center">
            <div className="items-display">
              Nitro: {Math.max(0, Math.floor(gameStats.nitroCount || 0))}
            </div>
          </div>
          <div className="hud-right">
            <div className="score-display">
              Score: {gameStats.score.toLocaleString()}
            </div>
            <div className="lives-display">
              Lives: {'❤️'.repeat(gameStats.lives)}
            </div>
          </div>
        </div>

        {/* Speed Gauge */}
        <div className="speed-gauge">
          <div className="gauge-container">
            <div 
              className="gauge-fill"
              style={{ 
                transform: `rotate(${Math.min(gameStats.speed * 1.8, 180)}deg)` 
              }}
            />
            <div className="gauge-center">
              <span className="speed-value">{Math.floor(gameStats.speed)}</span>
              <span className="speed-unit">KM/H</span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="game-controls">
          <button 
            className="control-button camera-toggle"
            onClick={handleCameraToggle}
            title="Toggle Camera View"
          >
            📷 {cameraMode === 'third-person' ? '3rd' : '1st'}
          </button>
          
          {(gameMode === 'career' || gameMode === 'ghost') && (
            <button 
              className="control-button pause-button"
              onClick={handlePause}
              title="Pause Game"
            >
              {gameStats.isPaused ? '▶️' : '⏸️'}
            </button>
          )}
          
          <button 
            className="control-button menu-button"
            onClick={handleBackToMenu}
            title="Back to Menu"
          >
            🏠
          </button>
        </div>

        {/* Pause Overlay */}
        {gameStats.isPaused && (
          <div className="pause-overlay">
            <div className="pause-content">
              <h2>PAUSED</h2>
              <button onClick={handlePause} className="resume-button">
                Resume Game
              </button>
              <button onClick={handleBackToMenu} className="quit-button">
                Quit to Menu
              </button>
            </div>
          </div>
        )}
        
        {/* Game Over Overlay */}
        {gameStats.isGameOver && (
          <div className="pause-overlay">
            <div className="pause-content">
              <h2>GAME OVER</h2>
              <div className="stats-line">Score: {String(gameStats.score).padStart(2, '0')}</div>
              <div className="stats-line">Distance: {(gameStats.distance / 1000).toFixed(2)} km</div>
              <div className="stats-line">Turbo Tokens: {(Math.round(((gameStats.distance || 0) / 1000) * 100) / 100).toFixed(2)}</div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '12px' }}>
                <button onClick={handleRestart} className="resume-button">
                  Restart
                </button>
                <button onClick={handleBackToMenu} className="quit-button" style={{ marginTop: '12px' }}>
                  Back to Menu
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="game-instructions">
        <div className="instruction-item">
          <span className="key">WASD</span> Move
        </div>
        <div className="instruction-item">
          <span className="key">SPACE</span> Brake
        </div>
        <div className="instruction-item">
          <span className="key">SHIFT</span> Nitro
        </div>
      </div>
    </div>
  );
}

// Main Game Class
class TurboTrailsGame {
  constructor(container, gameMode, playerData, onGameEnd, setGameStats, setCameraMode, walletAddress) {
    this.container = container;
    this.gameMode = gameMode;
    this.playerData = playerData;
    this.onGameEnd = onGameEnd;
    this.setGameStats = setGameStats;
    this.setCameraMode = setCameraMode;
    this.walletAddress = walletAddress || null;
    
    // Game state
    this.isRunning = false;
    this.isPaused = false;
    this.score = 0;
    this.lives = 3;
    this.speed = 0;
    this.distance = 0;
    this.isGameOver = false;
    // Behavior: do not auto-return to menu on game over; show overlay instead
    this.autoReturnOnGameOver = false;
    // Track last forward position for proper distance accumulation
    this.lastZ = 0;
    this._distanceInit = false;
    // Scoring: 1 point per 100 meters
    this.metersPerPoint = 100;
    this.cameraMode = 'third-person';
    
    // Single-use items (consumables)
    const inv = (playerData && playerData.inventory) || {};
    this.nitroCount = Number(inv.nitro || 0);
    this._nitroPressed = false;
    this._lastNitroUseTs = 0;
    this.nitroCooldownMs = 1200;
    
    // Three.js components
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.world = null;
    
    // Game objects
    this.bike = null;
    this.rider = null;
    this.track = null;
    this.obstacles = [];
    this.groundBodies = [];
    
    // Input handling
    this.keys = {};
    this.mouseX = 0;
    this.mouseY = 0;
    
    // Physics
    this.bikeBody = null;
    this.riderBody = null;
    this.isRagdoll = false;
    this.hasRider = false; // track if placeholder rider is present
    
    // Track generation
    this.trackSegments = [];
    this.currentSegment = 0;
    this.segmentLength = 100;
    
    // Bike performance profiles (can be switched at runtime)
    this.bikeProfiles = {
      default: { maxSpeedKmh: 220, base: 2200, boost: 9000, exponent: 1.25 },
      cruiser: { maxSpeedKmh: 160, base: 1200, boost: 6000, exponent: 1.35 },
      sport:   { maxSpeedKmh: 220, base: 2200, boost: 9000, exponent: 1.25 },
      hyper:   { maxSpeedKmh: 260, base: 2800, boost: 12000, exponent: 1.20 }
    };
    this.bikeProfileKey = 'sport';
    
    // Bind handlers so we can remove them later
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.bindEvents();

    // Disposal guard to avoid double-cleanup during unmount + manual back
    this._disposed = false;
  }

  // Public API: switch between 'cruiser' | 'sport' | 'hyper'
  setBikeProfile(key) {
    if (!this.bikeProfiles) return;
    if (this.bikeProfiles[key]) {
      this.bikeProfileKey = key;
      console.log('[BikeProfile] Active profile set to', key, this.bikeProfiles[key]);
    } else {
      console.warn('[BikeProfile] Unknown profile key:', key);
    }
  }

  init() {
    console.log('[TurboTrailsGame] init() start');
    // Record start time for early movement diagnostics
    this._startTs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.setupScene();
    this.setupPhysics();
    this.setupLighting();
    this.loadModels();
    this.generateInitialTrack();
    this.setupCamera();
    // Mark running before starting loop so first frame schedules correctly
    this.isRunning = true;
    this.startGameLoop();
    console.log('[TurboTrailsGame] init() complete. isRunning =', this.isRunning);
  }

  setupScene() {
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87CEEB, 100, 1000);
    
    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x87CEEB);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    this.container.appendChild(this.renderer.domElement);
    console.log('[TurboTrailsGame] Renderer attached', { width: w, height: h });
    
    // Handle resize
    window.addEventListener('resize', () => {
      if (this.camera && this.renderer) {
        const newW = this.container.clientWidth || window.innerWidth;
        const newH = this.container.clientHeight || window.innerHeight;
        this.camera.aspect = newW / newH;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(newW, newH);
      }
    });
  }

  setupPhysics() {
    // Create physics world
    this.world = new CANNON.World();
    this.world.gravity.set(0, -30, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.solver.iterations = 10;
    // Set sane defaults so contacts have some friction globally
    this.world.defaultContactMaterial.friction = 0.2;
    this.world.defaultContactMaterial.restitution = 0.0;
    
    // Create materials
    this.groundMaterial = new CANNON.Material('ground');
    this.bikeMaterial = new CANNON.Material('bike');
    
    // Contact material
    const groundBikeContact = new CANNON.ContactMaterial(
      this.groundMaterial,
      this.bikeMaterial,
      {
        // Slightly higher friction to reduce sideways drift while retaining motion
        friction: 0.12,
        restitution: 0.0
      }
    );
    this.world.addContactMaterial(groundBikeContact);
  }

  setupLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);
    
    // Directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(100, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    
    this.scene.add(directionalLight);
  }

  async loadModels() {
    const gltfLoader = new GLTFLoader();
    const objLoader = new OBJLoader();
    
    try {
      // Try to load a GLB for the current profile; fallback to placeholder
      const modelPath = this.getSelectedBikeModelPath();
      const loaded = await this.loadBikeGlb(gltfLoader, modelPath);
      if (!loaded) {
        // Fallback visuals and rider only if GLB failed
        this.createBike();
        this.createRider();
      } else {
        // Ensure no placeholder rider remains when GLB is used
        if (this.rider) {
          try { this.scene.remove(this.rider); } catch {}
          try { this.bike && this.bike.remove(this.rider); } catch {}
        }
        this.rider = null;
        this.riderBody = null;
        this.hasRider = false;
      }
      
    } catch (error) {
      console.warn('Could not load external models, using placeholder geometry');
      this.createBike();
      this.createRider();
    }
  }

  getSelectedBikeModelPath() {
    // Map current profile to expected model path in public/models
    const key = this.bikeProfileKey || 'sport';
    // Expected filenames: bike-cruiser.glb, bike-sport.glb, bike-hyper.glb
    return `/models/bike-${key}.glb`;
  }

  async loadBikeGlb(gltfLoader, url) {
    try {
      const gltf = await gltfLoader.loadAsync(url);
      // If the game was disposed during async load, abort safely
      if (this._disposed || !this.scene) return false;
      const group = gltf.scene || gltf.scenes?.[0];
      if (!group) return false;
      // Ensure all meshes cast/receive shadows
      group.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          if (obj.material) {
            // Make sure materials use correct side for thin surfaces
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => { if (m) m.side = THREE.FrontSide; });
            } else {
              obj.material.side = THREE.FrontSide;
            }
          }
        }
      });
      // Center and scale to a target size
      const bbox = new THREE.Box3().setFromObject(group);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      group.position.sub(center); // center at origin
      // Target length along Z ~ 4.0 units (similar to placeholder)
      const targetLen = 4.0;
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = targetLen / maxDim;
      group.scale.setScalar(scale);

      // Ensure the bike faces forward and centered using per-model tweaks
      const urlStr = String(url);
      const modelTweaks = {
        'bike-default.glb': { yaw: -Math.PI / 2, offset: { x: 0.0, y: 0.0, z: 0.0 } },
      };
      const fileNameMatch = urlStr.match(/([^/\\]+)$/);
      const fileName = fileNameMatch ? fileNameMatch[1].toLowerCase() : '';
      const tweak = modelTweaks[fileName] || (/\/models\/bike-.*\.glb$/i.test(urlStr) ? { yaw: Math.PI / 2, offset: { x: 0, y: 0, z: 0 } } : null);
      if (tweak) {
        if (typeof tweak.yaw === 'number') group.rotation.y = tweak.yaw;
        if (tweak.offset) {
          group.position.x += tweak.offset.x || 0;
          group.position.y += tweak.offset.y || 0;
          group.position.z += tweak.offset.z || 0;
        }
      }

      // Final visual recenter in X after rotation and offsets (preserve Y and Z)
      const postBox = new THREE.Box3().setFromObject(group);
      const postCenter = new THREE.Vector3();
      postBox.getCenter(postCenter);
      group.position.x -= postCenter.x;
      // keep Z as-is so the bike sits slightly forward if needed

      // Create bike group and add to scene (guard against disposal)
      if (this.bike) {
        this.scene.remove(this.bike);
      }
      const bikeGroup = new THREE.Group();
      bikeGroup.add(group);
      this.bike = bikeGroup;
      if (!this._disposed && this.scene) {
        this.scene.add(this.bike);
      } else {
        return false;
      }

      // Physics body based on bbox (recompute after scaling)
      const bbox2 = new THREE.Box3().setFromObject(this.bike);
      const size2 = new THREE.Vector3();
      const center2 = new THREE.Vector3();
      bbox2.getSize(size2);
      bbox2.getCenter(center2);
      // Half-extents for Cannon box
      const hx = Math.max(0.5, size2.x / 2);
      const hy = Math.max(0.5, size2.y / 2);
      const hz = Math.max(1.5, size2.z / 2);
      const bikeShape = new CANNON.Box(new CANNON.Vec3(hx, hy, hz));
      if (this.bikeBody) {
        try { this.world.removeBody(this.bikeBody); } catch {}
      }
      this.bikeBody = new CANNON.Body({ mass: 30, material: this.bikeMaterial });
      this.bikeBody.addShape(bikeShape);
      this.bikeBody.position.set(0, 5, 0);
      this.bikeBody.linearDamping = 0.1;
      this.bikeBody.angularDamping = 0.3;
      this.bikeBody.allowSleep = false;
      this.bikeBody.angularFactor = new CANNON.Vec3(0, 1, 0);
      this.world.addBody(this.bikeBody);

      // Place visual at physics position initially
      this.bike.position.copy(this.bikeBody.position);

      // Update camera once loaded
      this.updateCameraPosition();
      console.log('[GLB] Loaded bike model', { url, size: size2 });
      return true;
    } catch (e) {
      console.warn('[GLB] Failed to load bike model, falling back:', url, e?.message || e);
      return false;
    }
  }

  createBike() {
    if (this._disposed || !this.scene) return false;
    // Create bike geometry (placeholder)
    const bikeGroup = new THREE.Group();
    
    // Main body
    const bodyGeometry = new THREE.BoxGeometry(2, 1, 4);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xff4444 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1;
    body.castShadow = true;
    bikeGroup.add(body);
    
    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.3, 12);
    const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
    
    const frontWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    frontWheel.position.set(0, 0.8, 1.5);
    frontWheel.rotation.z = Math.PI / 2;
    frontWheel.castShadow = true;
    bikeGroup.add(frontWheel);
    
    const backWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    backWheel.position.set(0, 0.8, -1.5);
    backWheel.rotation.z = Math.PI / 2;
    backWheel.castShadow = true;
    bikeGroup.add(backWheel);
    
    this.bike = bikeGroup;
    if (this.scene && !this._disposed) {
      this.scene.add(this.bike);
    } else {
      return false;
    }
    
    // Physics body for bike
    const bikeShape = new CANNON.Box(new CANNON.Vec3(1, 0.5, 2));
    this.bikeBody = new CANNON.Body({ mass: 30, material: this.bikeMaterial });
    this.bikeBody.addShape(bikeShape);
    this.bikeBody.position.set(0, 5, 0);
    // Add damping so the bike slows naturally without needing extreme friction
    this.bikeBody.linearDamping = 0.1;
    this.bikeBody.angularDamping = 0.3;
    this.bikeBody.allowSleep = false;
    // Constrain rotation to yaw only to avoid tipping from forces
    this.bikeBody.angularFactor = new CANNON.Vec3(0, 1, 0);
    this.world.addBody(this.bikeBody);
  }

  createRider() {
    // Create rider geometry (placeholder)
    const riderGroup = new THREE.Group();
    
    // Head
    const headGeometry = new THREE.SphereGeometry(0.4);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 2.5;
    head.castShadow = true;
    riderGroup.add(head);
    
    // Body
    const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.5, 1.5);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x4444ff });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1.5;
    body.castShadow = true;
    riderGroup.add(body);
    
    this.rider = riderGroup;
    if (this.bike && !this._disposed) {
      this.bike.add(this.rider);
    } else {
      return false;
    }
    
    // Prepare rider physics body but DO NOT add to world until ragdoll
    const riderShape = new CANNON.Cylinder(0.3, 0.5, 1.5, 8);
    this.riderBody = new CANNON.Body({ mass: 70 });
    this.riderBody.addShape(riderShape);
    this.riderBody.position.copy(this.bikeBody.position);
    this.riderBody.position.y += 1.5;
    this.hasRider = true;
  }

  generateInitialTrack() {
    this.trackSegments = [];
    for (let i = 0; i < 10; i++) {
      this.generateTrackSegment(i);
    }
  }

  generateTrackSegment(index) {
    const segment = {
      index: index,
      obstacles: [],
      curve: 0, // Keep straight while tuning
      elevation: 0, // Flat while tuning
    };
    
    // Create ground
    const groundGeometry = new THREE.PlaneGeometry(20, this.segmentLength);
    const groundMaterial = new THREE.MeshLambertMaterial({ 
      color: 0x8B4513,
      transparent: true,
      opacity: 0.8
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(
      segment.curve * index * 10,
      segment.elevation,
      index * this.segmentLength
    );
    this.scene.add(ground);

    // Physics ground: finite box per segment
    const boxHalfExtents = new CANNON.Vec3(10, 0.25, this.segmentLength / 2);
    const groundShape = new CANNON.Box(boxHalfExtents);
    const groundBody = new CANNON.Body({ mass: 0, material: this.groundMaterial });
    groundBody.addShape(groundShape);
    groundBody.position.set(ground.position.x, ground.position.y - 0.25, ground.position.z);
    this.world.addBody(groundBody);
    this.groundBodies.push(groundBody);

    // Save refs on segment for debugging if needed
    segment.groundMesh = ground;
    segment.groundBody = groundBody;

    // Visual lane markers so motion is perceivable
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const markerGeom = new THREE.PlaneGeometry(20, 0.35);
    const marker = new THREE.Mesh(markerGeom, markerMaterial);
    marker.rotation.x = -Math.PI / 2;
    // Place marker near the forward edge of this segment
    const half = this.segmentLength / 2;
    marker.position.set(ground.position.x, ground.position.y + 0.01, ground.position.z + half - 0.5);
    this.scene.add(marker);
    segment.marker = marker;

    // Enable obstacles to make gameplay interesting; skip very first segment for safe spawn
    if (index > 0) {
      this.generateObstacles(segment, index);
    }

    this.trackSegments.push(segment);
  }

  generateObstacles(segment, segmentIndex) {
    // Fewer obstacles: 40% chance of 1 obstacle, otherwise 0
    const numObstacles = Math.random() < 0.4 ? 1 : 0;
    
    for (let i = 0; i < numObstacles; i++) {
      const obstacle = this.createObstacle(segmentIndex, i);
      segment.obstacles.push(obstacle);
    }
  }

  createObstacle(segmentIndex, obstacleIndex) {
    // Create obstacle geometry
    const obstacleGeometry = new THREE.BoxGeometry(
      Math.random() * 2 + 1,
      Math.random() * 3 + 1,
      Math.random() * 2 + 1
    );
    const obstacleMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 });
    const obstacle = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
    
    obstacle.position.set(
      (Math.random() - 0.5) * 15, // Random x position
      2,
      segmentIndex * this.segmentLength + Math.random() * this.segmentLength
    );
    obstacle.castShadow = true;
    this.scene.add(obstacle);
    
    // Physics body
    const obstacleShape = new CANNON.Box(new CANNON.Vec3(
      obstacle.geometry.parameters.width / 2,
      obstacle.geometry.parameters.height / 2,
      obstacle.geometry.parameters.depth / 2
    ));
    const obstacleBody = new CANNON.Body({ mass: 0 });
    obstacleBody.addShape(obstacleShape);
    obstacleBody.position.copy(obstacle.position);
    this.world.addBody(obstacleBody);
    
    const entry = { mesh: obstacle, body: obstacleBody };
    this.obstacles.push(entry);
    return entry;
  }

  setupCamera() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const aspect = h > 0 ? (w / h) : (window.innerWidth / Math.max(window.innerHeight, 1));
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    // Safe initial camera placement in case bike/physics haven't synced yet
    if (this.bike) {
      this.camera.position.set(
        this.bike.position.x,
        this.bike.position.y + 8,
        this.bike.position.z - 15
      );
      this.camera.lookAt(this.bike.position);
    } else {
      this.camera.position.set(0, 8, -15);
      this.camera.lookAt(new THREE.Vector3(0, 1, 0));
    }
    this.camera.updateProjectionMatrix();
    this.updateCameraPosition();
  }

  updateCameraPosition() {
    if (!this.camera) return;
    if (!this.bike) {
      // Keep a sensible default if bike not yet available
      this.camera.position.set(0, 8, -15);
      this.camera.lookAt(new THREE.Vector3(0, 1, 10));
      return;
    }
    
    if (this.cameraMode === 'third-person') {
      // Third-person camera
      this.camera.position.set(
        this.bike.position.x,
        this.bike.position.y + 8,
        this.bike.position.z - 15
      );
      this.camera.lookAt(this.bike.position);
    } else {
      // First-person camera
      this.camera.position.set(
        this.bike.position.x,
        this.bike.position.y + 2,
        this.bike.position.z + 1
      );
      this.camera.lookAt(
        this.bike.position.x,
        this.bike.position.y + 2,
        this.bike.position.z + 10
      );
    }
    this.camera.updateProjectionMatrix();
  }

  toggleCamera() {
    this.cameraMode = this.cameraMode === 'third-person' ? 'first-person' : 'third-person';
    this.setCameraMode(this.cameraMode);
    this.updateCameraPosition();
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    this.updateGameStats();
  }

  bindEvents() {
    // Keyboard events (use window to avoid focus issues)
    window.addEventListener('keydown', this.handleKeyDown, { capture: false });
    window.addEventListener('keyup', this.handleKeyUp, { capture: false });
    // Mouse events for camera control
    window.addEventListener('mousemove', this.handleMouseMove, { capture: false });
  }

  handleKeyDown(event) {
    this.keys[event.code] = true;
    // Fallback to key for some browsers
    if (event.key) {
      // Normalize common aliases
      if (event.key === ' ') this.keys['Space'] = true;
      if (event.key.toLowerCase() === 'w') this.keys['KeyW'] = true;
      if (event.key.toLowerCase() === 'a') this.keys['KeyA'] = true;
      if (event.key.toLowerCase() === 's') this.keys['KeyS'] = true;
      if (event.key.toLowerCase() === 'd') this.keys['KeyD'] = true;
    }
    if ((Math.floor(performance.now()/250) % 8) === 0) {
      console.log('[KeyDown]', { code: event.code, key: event.key });
    }
    // Prevent browser actions from stealing focus (e.g., SPACE scroll, arrows)
    const controlKeys = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (controlKeys.includes(event.code)) {
      event.preventDefault();
    }
    // Special keys
    if (event.code === 'KeyC') {
      this.toggleCamera();
    }
    if (event.code === 'KeyP' && (this.gameMode === 'career' || this.gameMode === 'ghost')) {
      this.togglePause();
    }
  }

  handleKeyUp(event) {
    this.keys[event.code] = false;
    const controlKeys = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (controlKeys.includes(event.code)) {
      event.preventDefault();
    }
  }

  handleMouseMove(event) {
    this.mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  handleInput() {
    if (!this.bikeBody || this.isPaused || this.isGameOver) return;
    this.bikeBody.wakeUp();
    
    const force = new CANNON.Vec3();
    const torque = new CANNON.Vec3();
    
    // Ensure bike profiles exist (simple per-bike acceleration/top-speed tuning)
    if (!this.bikeProfiles) {
      this.bikeProfiles = {
        default: { maxSpeedKmh: 220, base: 2200, boost: 9000, exponent: 1.25 }, // mirrors sport
        cruiser: { maxSpeedKmh: 160, base: 1200, boost: 6000, exponent: 1.35 }, // ~8–10s to top
        sport:   { maxSpeedKmh: 220, base: 2200, boost: 9000, exponent: 1.25 }, // ~6–8s to top
        hyper:   { maxSpeedKmh: 260, base: 2800, boost: 12000, exponent: 1.20 } // ~5–6s to top
      };
      // Default profile; can be changed later based on selected bike/upgrade
      this.bikeProfileKey = 'sport';
    }
    const profile = this.bikeProfiles[this.bikeProfileKey] || this.bikeProfiles.sport;
    
    // Forward/Backward
    const MAX_SPEED_KMH = profile.maxSpeedKmh;
    const currentSpeedKmh = this.bikeBody.velocity.length() * 3.6;
    // Arcade controls along world axes to ensure straight movement visually
    const forwardWorld = new CANNON.Vec3(0, 0, 1);
    const rightWorld = new CANNON.Vec3(1, 0, 0);
    
    // Determine if grounded by raycasting down to ground bodies
    let grounded = false;
    try {
      const rayFrom = this.bikeBody.position.clone();
      rayFrom.y += 0.5;
      const rayTo = new CANNON.Vec3(rayFrom.x, rayFrom.y - 2.0, rayFrom.z);
      const ray = new CANNON.Ray(rayFrom, rayTo);
      const result = new CANNON.RaycastResult();
      ray.intersectBodies(this.groundBodies, result);
      grounded = result.hasHit === true;
    } catch {}
    if (this.keys['KeyW'] || this.keys['ArrowUp']) {
      // Acceleration curve driven by selected bike profile
      const ratio = Math.min(1, Math.max(0, 1 - (currentSpeedKmh / MAX_SPEED_KMH))); // 1 at low speed -> 0 near max
      const base = profile.base;
      const boost = profile.boost;
      const exponent = profile.exponent;
      const thrust = base + boost * Math.pow(ratio, exponent);
      // Apply in world space along current forward (do not mutate forwardWorld)
      const thrustVec = forwardWorld.scale(thrust, new CANNON.Vec3());
      this.bikeBody.applyForce(thrustVec, this.bikeBody.position);
      if ((Math.floor(performance.now()/250) % 8) === 0) {
        console.log('[Input] W/Up pressed, speed(km/h)=', currentSpeedKmh.toFixed(1));
      }
      // If nearly stationary, give a short impulse to guarantee movement
      if (currentSpeedKmh < 2) {
        const impulseMag = 120;
        const impulse = new CANNON.Vec3(forwardWorld.x * impulseMag, forwardWorld.y * impulseMag, forwardWorld.z * impulseMag);
        this.bikeBody.applyImpulse(impulse, this.bikeBody.position);
        if ((Math.floor(performance.now()/1000) % 2) === 0) {
          console.log('[Impulse] Applied forward kick');
        }
      }
    }
    if (grounded && (this.keys['KeyS'] || this.keys['ArrowDown'])) {
      const brakeThrust = 2500;
      const backward = forwardWorld.scale(-1, new CANNON.Vec3());
      const brakeVec = backward.scale(brakeThrust, new CANNON.Vec3());
      this.bikeBody.applyForce(brakeVec, this.bikeBody.position);
      if ((Math.floor(performance.now()/250) % 8) === 0) {
        console.log('[Input] S/Down pressed, speed(km/h)=', currentSpeedKmh.toFixed(1));
      }
    }
    
    // Left/Right: pure lateral force, no yaw
    const sidePush = 3500; // moderate lateral move
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
      // Invert because on-screen left corresponds to +X in our world
      const leftVec = rightWorld.scale(sidePush, new CANNON.Vec3());
      this.bikeBody.applyForce(leftVec, this.bikeBody.position);
      if (!this._lastADLog || performance.now() - this._lastADLog > 500) { console.log('[Input] A/Left lateral'); this._lastADLog = performance.now(); }
    }
    if (this.keys['KeyD'] || this.keys['ArrowRight']) {
      const rightVec = rightWorld.scale(-sidePush, new CANNON.Vec3());
      this.bikeBody.applyForce(rightVec, this.bikeBody.position);
      if (!this._lastADLog || performance.now() - this._lastADLog > 500) { console.log('[Input] D/Right lateral'); this._lastADLog = performance.now(); }
    }
    
    // Brake
    if (this.keys['Space']) {
      this.bikeBody.velocity.scale(0.90, this.bikeBody.velocity);
    }
    
    // Tiny forward stabilize to keep rolling straight if no inputs
    if (!this.keys['KeyW'] && !this.keys['ArrowUp'] && !this.keys['Space']) {
      const cruise = 300;
      const cruiseVec = forwardWorld.scale(cruise, new CANNON.Vec3());
      this.bikeBody.applyForce(cruiseVec, this.bikeBody.position);
    }

    // Nitro (single-use item): edge-triggered with cooldown, consumes 1 per use
    const nowTs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const shiftDown = !!this.keys['ShiftLeft'] || !!this.keys['ShiftRight'];
    if (grounded && shiftDown && !this._nitroPressed && this.nitroCount > 0 && (nowTs - this._lastNitroUseTs) > this.nitroCooldownMs) {
      const nitro = 4500; // strong burst
      const nitroVec = forwardWorld.scale(nitro, new CANNON.Vec3());
      this.bikeBody.applyForce(nitroVec, this.bikeBody.position);
      this.nitroCount = Math.max(0, this.nitroCount - 1);
      this._nitroPressed = true;
      this._lastNitroUseTs = nowTs;
      this.updateGameStats();
    }
    if (!shiftDown) {
      this._nitroPressed = false;
    }

    // Remove early nudge; rely on user input for movement
    
    // No torque in arcade mode
    this.bikeBody.angularVelocity.set(0, 0, 0);
    // If no lateral input, damp X velocity to keep straight
    if (!this.keys['KeyA'] && !this.keys['ArrowLeft'] && !this.keys['KeyD'] && !this.keys['ArrowRight']) {
      this.bikeBody.velocity.x *= 0.90;
    }
    
    // Update speed
    this.speed = this.bikeBody.velocity.length() * 3.6; // Convert to km/h
    // Clamp to max for UI sanity
    if (this.speed > MAX_SPEED_KMH) this.speed = MAX_SPEED_KMH;
  }

  checkCollisions() {
    // Check for high-speed collisions that trigger ragdoll
    if (this.speed > 80 && !this.isRagdoll) {
      // Simple collision detection with obstacles
      this.obstacles.forEach(obstacle => {
        const distance = this.bike.position.distanceTo(obstacle.mesh.position);
        if (distance < 3) {
          this.triggerRagdoll();
        }
      });
    }
  }

  triggerRagdoll() {
    if (this.isRagdoll) return;
    this.isRagdoll = true;
    this.lives--;
    
    if (!this.hasRider || !this.rider || !this.riderBody) {
      // No rider visuals/physics: quick reset
      setTimeout(() => { this.resetAfterCrash(); }, 800);
      return;
    }

    // Detach rider from bike
    try { this.bike.remove(this.rider); } catch {}
    try { this.scene.add(this.rider); } catch {}
    this.rider.position.copy(this.bike.position);
    
    // Add rider body to world now that ragdoll is active
    try {
      if (this.riderBody && !this.world.bodies.includes(this.riderBody)) {
        this.world.addBody(this.riderBody);
        this.riderBody.position.copy(this.bikeBody.position);
        this.riderBody.position.y += 1.5;
      }
    } catch {}

    // Apply random forces to rider for ragdoll effect
    try {
      this.riderBody.velocity.set(
        (Math.random() - 0.5) * 20,
        Math.random() * 15 + 5,
        (Math.random() - 0.5) * 20
      );
    } catch {}
    
    // Reset after a delay
    setTimeout(() => { this.resetAfterCrash(); }, 3000);
  }

  resetAfterCrash() {
    if (this.lives <= 0) {
      this.endGame();
      return;
    }
    
    this.isRagdoll = false;
    
    // Reset positions
    this.bikeBody.position.set(0, 5, this.distance + 10);
    this.bikeBody.velocity.set(0, 0, 0);
    this.bikeBody.angularVelocity.set(0, 0, 0);
    
    if (this.hasRider && this.riderBody) {
      try {
        this.riderBody.position.copy(this.bikeBody.position);
        this.riderBody.position.y += 1.5;
        this.riderBody.velocity.set(0, 0, 0);
      } catch {}
    }
    
    // Reattach rider to bike if present
    if (this.hasRider && this.rider) {
      try { this.scene.remove(this.rider); } catch {}
      try { this.bike.add(this.rider); } catch {}
      this.rider.position.set(0, 1.5, 0);
    }
  }

  updateGameStats() {
    this.setGameStats({
      score: this.score,
      lives: this.lives,
      speed: this.speed,
      distance: this.distance,
      isPaused: this.isPaused,
      isGameOver: this.isGameOver,
      tokensEarned: this.score / 10,
      nitroCount: this.nitroCount
    });
  }

  update() {
    if (this.isPaused || !this.isRunning) return;
    
    this.handleInput();
    this.world.step(1/60);
    
    // Update visual objects from physics
    if (this.bike && this.bikeBody) {
      this.bike.position.copy(this.bikeBody.position);
      this.bike.quaternion.copy(this.bikeBody.quaternion);
    }
    
    if (this.rider && this.riderBody && this.isRagdoll) {
      this.rider.position.copy(this.riderBody.position);
      this.rider.quaternion.copy(this.riderBody.quaternion);
    }
    
    // Post-physics stabilization:
    if (this.bikeBody) {
      // In arcade mode lock orientation to world-forward (no roll/pitch/yaw)
      this.bikeBody.quaternion.set(0, 0, 0, 1);

      // Track soft centering + hard clamp at edges
      const segIndex = Math.max(0, Math.floor(this.bikeBody.position.z / this.segmentLength));
      const seg = this.trackSegments[segIndex] || { curve: 0, index: segIndex };
      const centerX = seg.curve * seg.index * 10;
      const trackHalfWidth = 10; // half width of the plane
      const dx = this.bikeBody.position.x - centerX;
      if (Math.abs(dx) > trackHalfWidth * 0.9) {
        const k = 160; // stronger spring to keep on road
        const fxCenter = -k * (dx - Math.sign(dx) * trackHalfWidth * 0.9);
        this.bikeBody.applyForce(new CANNON.Vec3(fxCenter, 0, 0), this.bikeBody.position);
      }
      const maxX = centerX + trackHalfWidth * 0.98;
      const minX = centerX - trackHalfWidth * 0.98;
      if (this.bikeBody.position.x > maxX) { this.bikeBody.position.x = maxX; this.bikeBody.velocity.x = 0; }
      if (this.bikeBody.position.x < minX) { this.bikeBody.position.x = minX; this.bikeBody.velocity.x = 0; }

      // Zero angular velocity to keep orientation locked
      this.bikeBody.angularVelocity.set(0, 0, 0);

      // 5) Cap effective speed to keep control while tuning
      const speedKmh = this.bikeBody.velocity.length() * 3.6;
      const cap = (this.bikeProfiles && this.bikeProfiles[this.bikeProfileKey]?.maxSpeedKmh) || 220;
      if (speedKmh > cap) {
        const scale = cap / speedKmh;
        this.bikeBody.velocity.scale(scale, this.bikeBody.velocity);
      }
    }

    // Update distance and score: accumulate only when moving forward above a small threshold
    if (this.bikeBody) {
      if (!this._distanceInit) {
        this.lastZ = this.bikeBody.position.z;
        this._distanceInit = true;
      }
      const vz = this.bikeBody.velocity.z;
      const zNow = this.bikeBody.position.z;
      const dz = zNow - this.lastZ;
      // Count only positive forward progress with minimal velocity to ignore spawn jitter
      if (vz > 0.5 && dz > 0.001) {
        this.distance += dz;
      }
      this.lastZ = zNow;
      this.score = Math.floor(this.distance / this.metersPerPoint);
    }
    
    // Generate new track segments as needed
    if (this.distance > this.currentSegment * this.segmentLength + 500) {
      this.generateTrackSegment(this.trackSegments.length);
      this.currentSegment++;
    }
    
    this.checkCollisions();
    this.updateCameraPosition();
    this.updateGameStats();
  }

  render() {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  startGameLoop() {
    const gameLoop = () => {
      if (this.isRunning) {
        this.update();
        this.render();
        // Periodic position/velocity diagnostic every ~1s
        if ((Math.floor(performance.now()/1000) % 3) === 0 && this.bikeBody) {
          const v = this.bikeBody.velocity;
          const p = this.bikeBody.position;
          if (!this._lastDiagTs || performance.now() - this._lastDiagTs > 900) {
            console.log('[Diag] pos', { x: p.x.toFixed(2), y: p.y.toFixed(2), z: p.z.toFixed(2) }, 'vel', { x: v.x.toFixed(2), y: v.y.toFixed(2), z: v.z.toFixed(2) });
            this._lastDiagTs = performance.now();
          }
        }
      }
      requestAnimationFrame(gameLoop);
    };
    console.log('[TurboTrailsGame] Game loop starting...');
    gameLoop();
  }

  endGame() {
    this.isRunning = false;
    this.isGameOver = true;
    this.updateGameStats();
    // Submit score/transaction deltas to server to call Monad Games ID
    try {
      const playerAddr = this.walletAddress || (this.playerData && (this.playerData.address || this.playerData.walletAddress)) || null;
      if (typeof fetch === 'function' && playerAddr) {
        const payload = {
          wallet: playerAddr,
          score: Number(this.score || 0)
        };
        fetch('/api/client-submit-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(async (r) => {
            const j = await r.json().catch(() => ({}));
            if (!r.ok) {
              console.warn('[GameOver] Score submit failed', j);
            } else {
              console.log('[GameOver] Score submitted', j);
            }
          })
          .catch((e) => {
            console.warn('[GameOver] Score submit error', e?.message || e);
          });
      }
    } catch {}
    if (this.autoReturnOnGameOver && typeof this.onGameEnd === 'function') {
      this.onGameEnd(this.score);
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.isRunning = false;
    
    // Safely detach renderer DOM if present
    try {
      if (this.renderer && this.renderer.domElement) {
        const el = this.renderer.domElement;
        if (this.container && el.parentNode === this.container) {
          this.container.removeChild(el);
        } else {
          // Fallback: try removing directly to be safe in case parent changed
          el.remove();
        }
        try { this.renderer.dispose(); } catch {}
      }
    } catch {}
    this.renderer = null;
    
    // Clean up physics world
    if (this.world) {
      // Remove our tracked ground and obstacle bodies first
      this.groundBodies.forEach(b => this.world.removeBody(b));
      this.obstacles.forEach(o => this.world.removeBody(o.body));
      // Remove any remaining bodies
      this.world.bodies.slice().forEach(body => {
        try { this.world.removeBody(body); } catch {}
      });
    }
    
    // Remove event listeners
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
    
    // Null references to help GC
    this.scene = null;
    this.camera = null;
    this.world = null;
    this.bike = null;
    this.bikeBody = null;
    this.rider = null;
    this.riderBody = null;
  }
}
