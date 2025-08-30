import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { useWallets, usePrivy, useCrossAppAccounts } from '@privy-io/react-auth';
import { signPermit2AndBuy, buildPermit2TypedDataAndBody, postPermit2Buy, getOnchainTotal } from '../lib/permit2Client';
import turboTokenAbi from '../lib/abi/turboToken.json';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';

export default function Shop({ playerData, onBackToMenu, onPurchase }) {
  const { wallets } = useWallets?.() || { wallets: [] };
  const { user } = usePrivy?.() || {};
  const { signTypedData: crossAppSignTypedData } = useCrossAppAccounts?.() || {};
  const [selectedCategory, setSelectedCategory] = useState('single-use');
  const [selectedItem, setSelectedItem] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [shopItems, setShopItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [turboBalanceDisplay, setTurboBalanceDisplay] = useState('0');
  const modelViewerRef = useRef(null);
  const sceneRef = useRef(null);
  const [viewerReady, setViewerReady] = useState(false);
  // Track the latest model load request to avoid out-of-order async overwrites
  const modelLoadIdRef = useRef(0);

  // Prefer the embedded wallet provider that matches playerData.wallet
  const getEmbeddedProvider = async () => {
    try {
      const target = (playerData?.wallet || '').toLowerCase();
      // 1) Try to match by address in wallets[]
      if (wallets && wallets.length) {
        const match = wallets.find(w => (w?.address || '').toLowerCase() === target);
        if (match?.getEthereumProvider) {
          try { return await match.getEthereumProvider(); } catch {}
        }
        // Otherwise pick any embedded-like wallet
        for (const w of wallets) {
          const t = (w?.walletClientType || w?.type || '').toLowerCase();
          const isEmbedded = t.includes('privy') || t.includes('embedded');
          if (isEmbedded && w?.getEthereumProvider) {
            try { return await w.getEthereumProvider(); } catch {}
          }
        }
      }
      // 2) As a last resort, some environments expose window.ethereum
      if (typeof window !== 'undefined' && window.ethereum) return window.ethereum;
    } catch {}
    return null;
  };

  // Helper: fetch TURBO balance for an address
  const getTurboBalance = async (rpcUrl, tokenAddress, address) => {
    if (!rpcUrl || !tokenAddress || !address) return 0n;
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const erc20 = new ethers.Contract(tokenAddress, turboTokenAbi.abi, provider);
      const bal = await erc20.balanceOf(address);
      return BigInt(bal.toString());
    } catch (e) {
      return 0n;
    }
  };

  // Helper: get token decimals
  const getTokenDecimals = async (rpcUrl, tokenAddress) => {
    if (!rpcUrl || !tokenAddress) return 18;
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const erc20 = new ethers.Contract(tokenAddress, turboTokenAbi.abi, provider);
      const d = await erc20.decimals();
      return Number(d);
    } catch (e) {
      return 18;
    }
  };

  // Cache-busting for static model assets to avoid stale GLTF/GLB after updates
  const withCacheBust = (path) => {
    if (!path) return path;
    const sep = path.includes('?') ? '&' : '?';
    // Increment version string if you update assets
    const version = 'v=2';
    return `${path}${sep}${version}`;
  };

  // Ensure Three.js file cache doesn't serve stale GLTF/GLB
  if (THREE.Cache) {
    THREE.Cache.enabled = false;
  }

  useEffect(() => {
    fetchShopItems();
    const cleanup = setupModelViewer();
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);

  // Lazily initialize viewer when the container becomes available (e.g., when switching tabs)
  useEffect(() => {
    if (modelViewerRef.current && !sceneRef.current) {
      setupModelViewer();
    }
  }, [selectedCategory, selectedItem]);

  useEffect(() => {
    if (selectedItem?.modelPath && sceneRef.current) {
      loadItemModel(withCacheBust(selectedItem.modelPath));
    }
  }, [selectedItem]);

  // If the viewer initializes after the item was selected, load the model then
  useEffect(() => {
    if (viewerReady && selectedItem?.modelPath) {
      loadItemModel(withCacheBust(selectedItem.modelPath));
    }
  }, [viewerReady]);

  // Ensure the renderer canvas is attached to the current container when the ref changes
  // (e.g., switching between bikes and items detail panels)
  useEffect(() => {
    const inst = sceneRef.current;
    const target = modelViewerRef.current;
    if (!inst || !inst.renderer || !target) return;
    const canvas = inst.renderer.domElement;
    if (canvas && canvas.parentNode !== target) {
      try {
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        target.appendChild(canvas);
        // Resize to new container
        const w = target.clientWidth || 300;
        const h = target.clientHeight || 300;
        inst.camera.aspect = w / h;
        inst.camera.updateProjectionMatrix();
        inst.renderer.setSize(w, h);
      } catch (e) {}
    }
  }, [selectedCategory, selectedItem]);

  // Reset quantity when switching item/category, default to 1 for single-use
  useEffect(() => {
    if (!selectedItem || selectedItem.type !== 0) {
      setQuantity(1);
    } else if (quantity < 1) {
      setQuantity(1);
    }
  }, [selectedItem, selectedCategory]);

  // Fetch and periodically refresh the player's TURBO balance from-chain
  useEffect(() => {
    let mounted = true;
    let interval;
    const load = async () => {
      try {
        const rpc = process.env.NEXT_PUBLIC_RPC_URL;
        const token = process.env.NEXT_PUBLIC_TURBO_TOKEN;
        const addr = playerData?.wallet;
        if (!rpc || !token || !addr) {
          if (mounted) setTurboBalanceDisplay('0');
          return;
        }
        const decimals = await getTokenDecimals(rpc, token);
        const bal = await getTurboBalance(rpc, token, addr);
        const formatted = ethers.formatUnits(bal, decimals);
        // Format with k/m/b suffix at 2 decimals
        const num = Number(formatted);
        const formatWithSuffix = (v) => {
          if (!Number.isFinite(v)) return '0.00';
          const abs = Math.abs(v);
          if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'b';
          if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'm';
          if (abs >= 1e3) return (v / 1e3).toFixed(2) + 'k';
          return v.toFixed(2);
        };
        const pretty = formatWithSuffix(num);
        if (mounted) setTurboBalanceDisplay(pretty);
      } catch (e) {
        if (mounted) setTurboBalanceDisplay('0');
      }
    };
    load();
    interval = setInterval(load, 20000);
    return () => { mounted = false; if (interval) clearInterval(interval); };
  }, [playerData?.wallet]);

  const fetchShopItems = async () => {
    try {
      const response = await fetch(`/api/shop-items?cb=${Date.now()}`);
      const items = await response.json();
      // Defensive client-side dedupe by name (case-insensitive)
      const seen = new Set();
      const deduped = items.filter((it) => {
        const key = (it.name || `id-${it.id}`).trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setShopItems(deduped);
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  const setupModelViewer = () => {
    if (!modelViewerRef.current) return;

    const scene = new THREE.Scene();
    const container = modelViewerRef.current;
    const width = container.clientWidth || 300;
    const height = container.clientHeight || 300;
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.physicallyCorrectLights = true;

    renderer.setSize(width, height);
    // Neutral light background for true-color viewing
    renderer.setClearColor(0xf3f4f6, 1);
    container.appendChild(renderer.domElement);

    // Neutral lighting (avoid color cast)
    const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.9);
    scene.add(hemi);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.4);
    directionalLight.position.set(6, 8, 6);
    scene.add(directionalLight);

    camera.position.z = 5;

    sceneRef.current = { scene, camera, renderer, model: null, container };
    setViewerReady(true);

    // Re-enable neutral HDR environment for correct PBR base color
    new RGBELoader()
      .setPath('/env/')
      .load('studio.hdr', (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = tex; // reflections and diffuse IBL
      }, undefined, () => {});

    // No background cubes

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Resize handling to keep canvas flush with container and maintain centering
    const onResize = () => {
      const w = container.clientWidth || 300;
      const h = container.clientHeight || 300;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Mouse controls for rotation
    let isMouseDown = false;
    let mouseX = 0;
    let mouseY = 0;

    const handleMouseDown = (event) => {
      isMouseDown = true;
      mouseX = event.clientX;
      mouseY = event.clientY;
    };

    const handleMouseMove = (event) => {
      if (!isMouseDown) return;

      const deltaX = event.clientX - mouseX;
      const deltaY = event.clientY - mouseY;

      const current = sceneRef.current?.model;
      if (current) {
        current.rotation.y += deltaX * 0.01;
        current.rotation.x += deltaY * 0.01;
      }

      mouseX = event.clientX;
      mouseY = event.clientY;
    };

    const handleMouseUp = () => {
      isMouseDown = false;
    };

    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    renderer.domElement.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('mouseup', handleMouseUp);
    // Cleanup listeners and renderer on unmount
    return () => {
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('mousedown', handleMouseDown);
      renderer.domElement.removeEventListener('mousemove', handleMouseMove);
      renderer.domElement.removeEventListener('mouseup', handleMouseUp);
      try {
        renderer.dispose();
      } catch (e) {}
      const el = renderer.domElement;
      if (el && el.parentNode) el.parentNode.removeChild(el);
      scene.clear();
      setViewerReady(false);
      sceneRef.current = null;
    };
  };

  const loadItemModel = async (modelPath) => {
    if (!sceneRef.current) return;
    // Bump request id and capture for this invocation
    const requestId = ++modelLoadIdRef.current;

    const { scene } = sceneRef.current;
    // Remove existing model by reference to avoid touching lights
    if (sceneRef.current.model) {
      try { scene.remove(sceneRef.current.model); } catch (e) {}
      sceneRef.current.model = null;
    }
    // Additionally, remove any lingering prior detail models that may remain
    try {
      const toRemove = [];
      scene.traverse((obj) => {
        if (obj.userData && obj.userData.isDetailModel) {
          toRemove.push(obj);
        }
      });
      toRemove.forEach((obj) => {
        try { scene.remove(obj); } catch (e) {}
      });
    } catch (e) {}

    try {
      const loader = new GLTFLoader();
      loader.setResourcePath('/models/');
      loader.setCrossOrigin('anonymous');
      const gltf = await loader.loadAsync(modelPath);
      // Ignore if a newer request has started since this began
      if (requestId !== modelLoadIdRef.current) {
        return;
      }
      let model = gltf.scene;
      // mark for future cleanups
      model.userData.isDetailModel = true;
      // Normalize: center and fit like BikeCard
      const bboxPre = new THREE.Box3().setFromObject(model);
      const centerPre = bboxPre.getCenter(new THREE.Vector3());
      model.position.sub(centerPre);
      const sizePre = bboxPre.getSize(new THREE.Vector3());
      const maxDim = Math.max(sizePre.x, sizePre.y, sizePre.z) || 1;
      const target = 2.0;
      const scale = target / maxDim;
      model.scale.setScalar(scale);
      model.rotation.y = Math.PI / 6;
      // Fit camera to model
      const { camera } = sceneRef.current;
      const bboxPost = new THREE.Box3().setFromObject(model);
      const size = bboxPost.getSize(new THREE.Vector3());
      const center = bboxPost.getCenter(new THREE.Vector3());
      const fov = camera.fov * (Math.PI / 180);
      const fitHeightDistance = (size.y / 2) / Math.tan(fov / 2);
      const fitWidthDistance = (size.x / 2) / Math.tan(fov / 2) / camera.aspect;
      const distance = 1.2 * Math.max(fitHeightDistance, fitWidthDistance);
      camera.position.set(center.x + 0, center.y + size.y * 0.2, distance + 0.8);
      camera.lookAt(center);
      scene.add(model);
      // Double-check recency before committing
      if (requestId === modelLoadIdRef.current) {
        sceneRef.current.model = model;
      } else {
        try { scene.remove(model); } catch (e) {}
      }
    } catch (error) {
      // Create placeholder geometry
      // Ignore if a newer request superseded this one
      if (requestId !== modelLoadIdRef.current) return;
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshLambertMaterial({ color: 0x00ff00 });
      const cube = new THREE.Mesh(geometry, material);
      cube.userData.isDetailModel = true;
      scene.add(cube);
      sceneRef.current.model = cube;
    }
  };

  const handlePurchase = async (item, quantity = 1) => {
    try {
      if (!playerData?.wallet) {
        alert('No player wallet detected.');
        return;
      }

      // Prefer Monad Games ID cross-app wallet for typed-data signing
      const MONAD_CHAIN_ID = 10143; // testnet
      const crossAppAccount = user?.linkedAccounts?.find(
        (acc) => acc?.type === 'cross_app' && acc?.providerApp?.id === process.env.NEXT_PUBLIC_MONAD_GAMES_CROSS_APP_ID
      );

      if (crossAppAccount?.embeddedWallets?.length && crossAppSignTypedData) {
        try {
          // Auto-select the cross-app embedded wallet with sufficient TURBO balance
          const rpc = process.env.NEXT_PUBLIC_RPC_URL;
          const token = process.env.NEXT_PUBLIC_TURBO_TOKEN;
          if (!rpc || !token) {
            alert('Missing frontend env: NEXT_PUBLIC_RPC_URL or NEXT_PUBLIC_TURBO_TOKEN. Please set them and restart.');
            return;
          }
          const targetProfile = (playerData.wallet || '').toLowerCase();
          const candidates = crossAppAccount.embeddedWallets || [];
          if (!candidates.length) {
            alert('No cross-app embedded wallets available. Please log in with Monad Games ID.');
            return;
          }
          // Compute exact total from chain to ensure signed amount matches Shop calculation
          let exactTotal;
          try {
            if (rpc && process.env.NEXT_PUBLIC_SHOP) {
              exactTotal = await getOnchainTotal({ rpcUrl: rpc, shopAddress: process.env.NEXT_PUBLIC_SHOP, itemId: item.id, qty: quantity });
            }
          } catch (e) {
            console.warn('Failed to fetch on-chain total, falling back to UI price', e);
          }
          // Determine required amount in token base units (wei)
          let required;
          if (exactTotal != null) {
            required = BigInt(exactTotal.toString());
          } else {
            const decimals = await getTokenDecimals(rpc, token);
            const scale = 10n ** BigInt(decimals);
            const priceStr = String(item.price);
            const decMatch = /^(\d+)(?:\.(\d+))?$/.exec(priceStr);
            if (decMatch) {
              const intPart = BigInt(decMatch[1] || '0');
              const fracRaw = (decMatch[2] || '');
              const fracPadded = (fracRaw + '0'.repeat(decimals)).slice(0, decimals);
              const priceWei = intPart * scale + BigInt(fracPadded || '0');
              required = priceWei * BigInt(quantity);
            } else {
              // Assume already base units or BigInt-like string
              required = BigInt(priceStr) * BigInt(quantity);
            }
          }

          // Enforce buyer = Monad Games ID profile wallet only (no fallback)
          const profileWallet = candidates.find(w => (w?.address || '').toLowerCase() === targetProfile);
          let report = [];
          for (const w of candidates) {
            const addr = w?.address;
            const bal = await getTurboBalance(rpc, token, addr);
            report.push({ address: addr, balance: bal.toString() });
          }
          if (!profileWallet) {
            alert('Your Monad Games ID wallet is not available. Please log in with Monad Games ID and try again.');
            return;
          }
          const address = profileWallet.address;
          const profileBal = BigInt((report.find(r => (r.address || '').toLowerCase() === targetProfile)?.balance) || '0');
          if (profileBal < required) {
            alert(
              `Your Monad Games ID wallet does not have enough TURBO.\n` +
              `Required (wei): ${required}\n` +
              `Wallet ${address}: ${profileBal.toString()}\n` +
              `Token: ${token}\nRPC: ${rpc}`
            );
            return;
          }
          const { domain, types, message, primaryType, body } = buildPermit2TypedDataAndBody({
            chainId: MONAD_CHAIN_ID,
            buyer: address, // ensure buyer matches signer address
            itemId: item.id,
            qty: quantity,
            itemPrice: item.price,
            exactTotal,
          });

          // Sign via Privy cross-app API (will open provider app popup to confirm)
          const typedData = { domain, types, primaryType, message };
          let sigResp;
          try {
            // Cross-app expected shape: { address, typedData }
            sigResp = await crossAppSignTypedData({ address, typedData });
          } catch (e1) {
            try {
              // Other SDKs: signTypedData(typedData, { address })
              sigResp = await crossAppSignTypedData(typedData, { address });
            } catch (e2) {
              throw e2;
            }
          }

          const signature = sigResp?.signature || sigResp;
          // also ensure request body uses the signer as buyer
          const result = await postPermit2Buy({ body: { ...body, buyer: address }, signature });
          if (result?.hash) {
            alert(`Purchased ${item.name}! tx: ${result.hash.slice(0, 10)}...`);
            onPurchase && onPurchase();
          } else {
            alert('Purchase completed, but no tx hash returned');
          }
          return;
        } catch (err) {
          // If cross-app signing fails, do not fallback to browser EOA to avoid wrong wallet
          alert('Purchase failed: Please ensure you are logged in with Monad Games ID and allow the popup.');
          return;
        }
      }
      // If we reach here, no cross-app wallet available
      alert('Please log in with Monad Games ID (cross-app wallet) to complete a gasless purchase.');
    } catch (error) {
      alert(`Purchase failed: ${error?.message || 'Unknown error'}`);
    }
  };

  const categories = [
    { id: 'single-use', name: 'Single-Use Items', icon: '⚡' },
    { id: 'permanent', name: 'Permanent Upgrades', icon: '🔧' },
    { id: 'bikes', name: 'Bike Upgrades', icon: '🏍️' },
  ];

  // Local bikes data for details panel
  const bikesData = [
    {
      id: 'bike_cruiser',
      type: 2,
      name: 'Cruiser',
      price: shopItems.find(i => i.slug === 'bike-cruiser')?.price || 250,
      description: 'Balanced entry bike with comfortable handling and reliability.',
      effects: [
        { key: 'Speed Boost', value: '+10' },
        { key: 'Grip Boost', value: '+10' },
        { key: 'Armor Boost', value: '+10' }
      ],
      modelPath: '/models/bike-cruiser.glb'
    },
    {
      id: 'bike_sport',
      type: 2,
      name: 'Sport',
      price: shopItems.find(i => i.slug === 'bike-sport')?.price || 500,
      description: 'Lightweight chassis tuned for speed and agile cornering.',
      effects: [
        { key: 'Speed Boost', value: '+20' },
        { key: 'Grip Boost', value: '+15' }
      ],
      modelPath: '/models/bike-sport.glb'
    },
    {
      id: 'bike_hyper',
      type: 2,
      name: 'Hyper',
      price: shopItems.find(i => i.slug === 'bike-hyper')?.price || 900,
      description: 'Top-tier performance bike with extreme power and precision.',
      effects: [
        { key: 'Speed Boost', value: '+30' },
        { key: 'Grip Boost', value: '+20' },
        { key: 'Armor Boost', value: '+10' }
      ],
      modelPath: '/models/bike-hyper.glb'
    }
  ];

  const filteredItems = (() => {
    const subset = shopItems.filter(item => {
      switch (selectedCategory) {
        case 'single-use':
          return item.type === 0;
        case 'permanent':
          return item.type === 1;
        case 'bikes':
          return item.type === 2;
        default:
          return true;
      }
    });
    // Dedupe by name and modelPath at render time as a final guard
    const seenNames = new Set();
    const seenModels = new Set();
    return subset.filter((it) => {
      const nameKey = (it.name || `id-${it.id}`).trim().toLowerCase();
      const modelKey = (it.modelPath || '').trim().toLowerCase();
      if (seenNames.has(nameKey)) return false;
      if (modelKey && seenModels.has(modelKey)) return false;
      seenNames.add(nameKey);
      if (modelKey) seenModels.add(modelKey);
      return true;
    });
  })();

  // Inline ItemCard component for Single-Use and Permanent items (small 3D preview)
  const ItemCard = ({ item, onSelect, onBuy }) => {
    const ref = useRef(null);
    const local = useRef({ renderer: null, scene: null, camera: null, model: null, raf: 0 });
    useEffect(() => {
      if (!ref.current) return;
      const container = ref.current;
      const width = container.clientWidth || 220;
      const height = container.clientHeight || 180;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
      camera.position.set(0, 1.2, 3.2); // match BikeCard visual distance
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.physicallyCorrectLights = true;
      renderer.setClearColor(0xf3f4f6, 1);
      container.appendChild(renderer.domElement);
      // Lights
      scene.add(new THREE.HemisphereLight(0xffffff, 0xffffff, 0.7));
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const dir = new THREE.DirectionalLight(0xffffff, 0.8);
      dir.position.set(2, 3, 2);
      scene.add(dir);
      // Environment
      new RGBELoader().setPath('/env/').load('studio.hdr', (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = tex;
      });
      // Load model
      const loader = new GLTFLoader();
      let cancelled = false;
      loader.load(
        withCacheBust(item.modelPath),
        (gltf) => {
          if (cancelled) return;
          let model = gltf.scene;
          // Normalize like BikeCard: center at origin and fit to camera
          const bboxPre = new THREE.Box3().setFromObject(model);
          const centerPre = bboxPre.getCenter(new THREE.Vector3());
          model.position.sub(centerPre);
          const sizePre = bboxPre.getSize(new THREE.Vector3());
          const maxDim = Math.max(sizePre.x, sizePre.y, sizePre.z) || 1;
          const target = 2.0; // target max dimension
          const scale = target / maxDim;
          model.scale.setScalar(scale);
          model.rotation.y = Math.PI / 6;
          // Adjust camera to fit
          const bboxPost = new THREE.Box3().setFromObject(model);
          const size = bboxPost.getSize(new THREE.Vector3());
          const center = bboxPost.getCenter(new THREE.Vector3());
          const fov = camera.fov * (Math.PI / 180);
          const fitHeightDistance = (size.y / 2) / Math.tan(fov / 2);
          const fitWidthDistance = (size.x / 2) / Math.tan(fov / 2) / camera.aspect;
          const distance = 1.2 * Math.max(fitHeightDistance, fitWidthDistance);
          camera.position.set(center.x + 0, center.y + size.y * 0.2, distance + 0.8);
          camera.lookAt(center);
          scene.add(model);
          local.current.model = model;
        },
        undefined,
        () => {
          // Fallback primitive
          const geo = new THREE.TorusKnotGeometry(0.5, 0.15, 80, 14);
          const mat = new THREE.MeshStandardMaterial({ color: 0x88ccff, metalness: 0.8, roughness: 0.3 });
          const mesh = new THREE.Mesh(geo, mat);
          scene.add(mesh);
          local.current.model = mesh;
        }
      );
      const animate = () => {
        local.current.raf = requestAnimationFrame(animate);
        if (local.current.model) local.current.model.rotation.y += 0.01;
        renderer.render(scene, camera);
      };
      animate();
      const onResize = () => {
        const w = container.clientWidth || width;
        const h = container.clientHeight || height;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);
      local.current.renderer = renderer;
      return () => {
        if (local.current.raf) cancelAnimationFrame(local.current.raf);
        window.removeEventListener('resize', onResize);
        if (local.current.renderer) {
          local.current.renderer.dispose();
          const el = local.current.renderer.domElement;
          if (el && el.parentNode) el.parentNode.removeChild(el);
        }
        local.current = { renderer: null, scene: null, camera: null, model: null, raf: 0 };
      };
    }, [item.modelPath]);
    return (
      <div className={`item-card ${selectedItem?.id === item.id ? 'selected' : ''}`} onClick={() => onSelect(item)}>
        <div className="item-canvas" ref={ref} />
        <div className="item-meta">
          <div className="item-title">{item.name}</div>
          <div className="item-price">🪙 {item.price}</div>
        </div>
        <button className="purchase-button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          disabled={true}>
          Coming soon
        </button>
      </div>
    );
  };

  // Inline BikeCard component for 3D previews
  const BikeCard = ({ title, price, modelPath, tint = null, variant = 'sport', onBuy, onSelect }) => {
    const canvasRef = useRef(null);
    const localRefs = useRef({ renderer: null, scene: null, camera: null, model: null, raf: 0 });
    useEffect(() => {
      if (!canvasRef.current) return;
      const container = canvasRef.current;
      const width = container.clientWidth || 220;
      const height = container.clientHeight || 180;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
      camera.position.set(0, 1.2, 3.2);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.physicallyCorrectLights = true;
      // Neutral background
      renderer.setClearColor(0xf3f4f6, 1);
      container.appendChild(renderer.domElement);
      // Lights
      scene.add(new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6));
      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      const dir = new THREE.DirectionalLight(0xffffff, 0.8);
      dir.position.set(2, 6, 3);
      dir.castShadow = true;
      dir.shadow.mapSize.set(1024, 1024);
      dir.shadow.camera.near = 0.5;
      dir.shadow.camera.far = 20;
      scene.add(dir);
      // Ground plane for shadow feel
      const shadowMat = new THREE.ShadowMaterial({ opacity: 0.25 });
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), shadowMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 0;
      ground.receiveShadow = true;
      scene.add(ground);
      // Removed GridHelper to avoid visible tiled lines

      // Re-enable HDR environment for correct PBR shading
      new RGBELoader()
        .setPath('/env/')
        .load('studio.hdr', (tex) => {
          tex.mapping = THREE.EquirectangularReflectionMapping;
          scene.environment = tex;
        }, undefined, () => {});
      // Helper: procedural motorbike (fallback/placeholder)
      const createProceduralMotorbike = (tintColor, kind = 'sport') => {
        const bike = new THREE.Group();
        const colorFrame = tintColor ? tintColor.getHex() : 0x1e90ff; // frame/fairing tint
        const colorWheel = 0x111111; // tires
        const colorRim = 0xbbbbbb;   // rims/brakes
        const colorEngine = 0x666666; // engine block

        // Variant presets
        const presets = {
          cruiser: { wheelR: 0.55, tireT: 0.11, forkAngle: Math.PI/3.4, seatLen: 0.65, seatHeight: 1.05, handleWidth: 0.8, hasWindscreen: false, exhaustLen: 0.7 },
          sport:   { wheelR: 0.5,  tireT: 0.09, forkAngle: Math.PI/3.0, seatLen: 0.45, seatHeight: 1.15, handleWidth: 0.6, hasWindscreen: true,  exhaustLen: 0.6 },
          hyper:   { wheelR: 0.52, tireT: 0.095,forkAngle: Math.PI/3.1, seatLen: 0.4,  seatHeight: 1.18, handleWidth: 0.58,hasWindscreen: true,  exhaustLen: 0.75 }
        };
        const cfg = presets[kind] || presets.sport;

        // Wheels: thicker, larger
        const tireGeom = new THREE.TorusGeometry(cfg.wheelR, cfg.tireT, 20, 48);
        const tireMat = new THREE.MeshStandardMaterial({ color: colorWheel, metalness: 0.2, roughness: 0.9 });
        const rimGeom = new THREE.TorusGeometry(cfg.wheelR - 0.08, 0.025, 16, 40);
        const rimMat = new THREE.MeshStandardMaterial({ color: colorRim, metalness: 0.7, roughness: 0.3 });
        const brakeDiscGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.01, 24);
        const brakeDiscMat = new THREE.MeshStandardMaterial({ color: colorRim, metalness: 0.8, roughness: 0.2 });
        const wheelFront = new THREE.Group();
        const wheelBack = new THREE.Group();
        wheelFront.add(new THREE.Mesh(tireGeom, tireMat));
        wheelFront.add(new THREE.Mesh(rimGeom, rimMat));
        const frontDisc = new THREE.Mesh(brakeDiscGeom, brakeDiscMat); frontDisc.rotation.x = Math.PI / 2; wheelFront.add(frontDisc);
        wheelBack.add(new THREE.Mesh(tireGeom, tireMat));
        wheelBack.add(new THREE.Mesh(rimGeom, rimMat));
        const rearDisc = new THREE.Mesh(brakeDiscGeom, brakeDiscMat); rearDisc.rotation.x = Math.PI / 2; wheelBack.add(rearDisc);
        wheelFront.position.set(0.95, cfg.wheelR, 0);
        wheelBack.position.set(-0.75, cfg.wheelR, 0);
        bike.add(wheelFront, wheelBack);

        // Swingarm (rear)
        const swingMat = new THREE.MeshStandardMaterial({ color: colorFrame, metalness: 0.6, roughness: 0.4 });
        const swing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.12), swingMat);
        swing.position.set(-0.2, 0.6, 0);
        bike.add(swing);

        // Front fork (thicker, angled)
        const forkMat = swingMat;
        const forkL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 16), forkMat);
        const forkR = forkL.clone();
        forkL.position.set(0.85, 1.0, -0.08); forkL.rotation.z = cfg.forkAngle;
        forkR.position.set(0.85, 1.0, 0.08);  forkR.rotation.z = cfg.forkAngle;
        bike.add(forkL, forkR);

        // Handlebar
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, cfg.handleWidth, 12), forkMat);
        handle.position.set(1.2, 1.35, 0); handle.rotation.z = Math.PI / 2; bike.add(handle);

        // Chassis/main frame
        const frameMat = new THREE.MeshStandardMaterial({ color: colorFrame, metalness: 0.6, roughness: 0.4 });
        const topFrame = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 14), frameMat);
        topFrame.position.set(0.2, 1.05, 0); topFrame.rotation.z = Math.PI / 10;
        const bottomFrame = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 14), frameMat);
        bottomFrame.position.set(-0.05, 0.75, 0); bottomFrame.rotation.z = -Math.PI / 6;
        bike.add(topFrame, bottomFrame);

        // Engine block
        const engine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.35), new THREE.MeshStandardMaterial({ color: colorEngine, metalness: 0.7, roughness: 0.3 }));
        engine.position.set(-0.1, 0.7, 0);
        bike.add(engine);

        // Fuel tank
        const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.4, 8, 16), new THREE.MeshStandardMaterial({ color: colorFrame, metalness: 0.5, roughness: 0.4 }));
        tank.position.set(0.2, 1.15, 0); tank.rotation.z = -Math.PI / 10;
        bike.add(tank);

        // Seat (sporty) and tail cowl
        const seat = new THREE.Mesh(new THREE.BoxGeometry(cfg.seatLen, 0.08, 0.24), new THREE.MeshStandardMaterial({ color: 0x222222 }));
        seat.position.set(-0.45, cfg.seatHeight, 0); seat.rotation.z = Math.PI / 24;
        bike.add(seat);
        const tailCowl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.10, 0.26), new THREE.MeshStandardMaterial({ color: colorFrame, metalness: 0.5, roughness: 0.4 }));
        tailCowl.position.set(-0.75, cfg.seatHeight + 0.03, 0);
        tailCowl.rotation.z = Math.PI / 14;
        bike.add(tailCowl);

        // Exhaust
        const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, cfg.exhaustLen, 12), new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.9, roughness: 0.1 }));
        exhaust.position.set(-0.6, 0.9, -0.15); exhaust.rotation.x = Math.PI / 10; exhaust.rotation.z = Math.PI / 14; bike.add(exhaust);
        if (kind === 'hyper') {
          const exhaust2 = exhaust.clone();
          exhaust2.position.z = 0.15; bike.add(exhaust2);
        }

        // Rear mono-shock
        const shock = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 12), new THREE.MeshStandardMaterial({ color: 0xdd4444, metalness: 0.6, roughness: 0.3 }));
        shock.position.set(-0.35, 0.9, -0.08); shock.rotation.z = -Math.PI / 6; bike.add(shock);

        // Windscreen for sport/hyper
        if (cfg.hasWindscreen) {
          const screen = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.02), new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.35, metalness: 0.2, roughness: 0.1 }));
          screen.position.set(1.05, 1.28, 0);
          screen.rotation.z = Math.PI / 6;
          bike.add(screen);
        }

        // Mirrors
        const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.2 });
        const mirrorL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.02), mirrorMat);
        const mirrorR = mirrorL.clone();
        mirrorL.position.set(1.28, 1.45, -0.28); mirrorR.position.set(1.28, 1.45, 0.28);
        bike.add(mirrorL, mirrorR);

        // Headlight
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), new THREE.MeshStandardMaterial({ color: 0xffffdd, emissive: 0xffeeaa, emissiveIntensity: 0.6 }));
        head.position.set(1.25, 1.25, 0);
        bike.add(head);

        // Fenders
        const fenderMat = new THREE.MeshStandardMaterial({ color: colorFrame, metalness: 0.5, roughness: 0.3 });
        const frontFender = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.02, 6, 12), fenderMat);
        frontFender.position.set(0.95, cfg.wheelR + 0.08, 0);
        frontFender.rotation.z = Math.PI / 2;
        bike.add(frontFender);
        const rearFender = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.02, 6, 12), fenderMat);
        rearFender.position.set(-0.75, cfg.wheelR + 0.06, 0);
        rearFender.rotation.z = Math.PI / 2;
        bike.add(rearFender);

        // Simple chain and sprocket approximation
        const sprocket = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 20), new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.8, roughness: 0.2 }));
        sprocket.position.set(-0.75, cfg.wheelR, -0.07); sprocket.rotation.x = Math.PI / 2; bike.add(sprocket);
        const chain = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.01, 8, 40), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.7, roughness: 0.3 }));
        chain.position.set(-0.15, cfg.wheelR, -0.07); chain.rotation.y = Math.PI / 2; bike.add(chain);

        // Front brake calipers
        const caliperMat = new THREE.MeshStandardMaterial({ color: 0xffc04d, metalness: 0.6, roughness: 0.3 });
        const caliperL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.06), caliperMat);
        const caliperR = caliperL.clone();
        caliperL.position.set(0.88, 0.62, -0.12); caliperR.position.set(0.88, 0.62, 0.12);
        bike.add(caliperL, caliperR);

        // Pose
        bike.scale.set(1.1, 1.1, 1.1);
        bike.rotation.y = Math.PI / 6;
        return bike;
      };

      // Load model
      const loader = new GLTFLoader();
      let cancelled = false;
      loader.load(
        withCacheBust(modelPath),
        (gltf) => {
          if (cancelled) return;
          let model = gltf.scene;
          // Normalize: center and auto-fit to camera
          const bboxPre = new THREE.Box3().setFromObject(model);
          const centerPre = bboxPre.getCenter(new THREE.Vector3());
          model.position.sub(centerPre); // center at origin
          // Uniform scale to target size
          const sizePre = bboxPre.getSize(new THREE.Vector3());
          const maxDim = Math.max(sizePre.x, sizePre.y, sizePre.z) || 1;
          const target = 2.0; // target max dimension in scene units
          const scale = target / maxDim;
          model.scale.setScalar(scale);
          model.rotation.y = Math.PI / 6;
          // Adjust camera distance to fit
          const bboxPost = new THREE.Box3().setFromObject(model);
          const size = bboxPost.getSize(new THREE.Vector3());
          const center = bboxPost.getCenter(new THREE.Vector3());
          const fov = camera.fov * (Math.PI / 180);
          const fitHeightDistance = (size.y / 2) / Math.tan(fov / 2);
          const fitWidthDistance = (size.x / 2) / Math.tan(fov / 2) / camera.aspect;
          const distance = 1.2 * Math.max(fitHeightDistance, fitWidthDistance);
          camera.position.set(center.x + 0, center.y + size.y * 0.2, distance + 0.8);
          camera.lookAt(center);
          model.traverse(obj => {
            if (obj.isMesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
              // Ensure reasonable env map intensity for non-metallic surfaces
              if (obj.material && 'envMapIntensity' in obj.material) {
                obj.material.envMapIntensity = 1.2;
              }
            }
          });
          // Detect placeholder cube-like model via bounding box (~2x2x2 typical of unit cube from -1..1)
          const bbox = new THREE.Box3().setFromObject(model);
          const boxSize = new THREE.Vector3();
          bbox.getSize(boxSize);
          const looksLikeCube = Math.abs(boxSize.x - 2) < 0.05 && Math.abs(boxSize.y - 2) < 0.05 && Math.abs(boxSize.z - 2) < 0.05;
          if (looksLikeCube) {
            model = createProceduralMotorbike(tint, variant);
          }
          scene.add(model);
          localRefs.current.model = model;
        },
        undefined,
        (err) => {
          console.error('GLTF load error:', modelPath, err, '\nTip: If the .gltf references external .bin/.png files, ensure they exist in public/models and paths are correct.');
          // Fallback: Procedural motorbike
          const bike = createProceduralMotorbike(tint, variant);
          scene.add(bike);
          localRefs.current.model = bike;
        }
      );
      // Animate
      const animate = () => {
        localRefs.current.raf = requestAnimationFrame(animate);
        if (localRefs.current.model) {
          localRefs.current.model.rotation.y += 0.005;
        }
        renderer.render(scene, camera);
      };
      animate();
      // Handle resize to keep canvas flush with container and maintain centering
      const onResize = () => {
        const w = container.clientWidth || width;
        const h = container.clientHeight || height;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);
      // Save refs
      localRefs.current.scene = scene;
      localRefs.current.camera = camera;
      localRefs.current.renderer = renderer;
      return () => {
        cancelled = true;
        if (localRefs.current.raf) cancelAnimationFrame(localRefs.current.raf);
        if (localRefs.current.renderer) {
          localRefs.current.renderer.dispose();
          const el = localRefs.current.renderer.domElement;
          if (el && el.parentNode) el.parentNode.removeChild(el);
        }
        window.removeEventListener('resize', onResize);
        localRefs.current = { renderer: null, scene: null, camera: null, model: null, raf: 0 };
      };
    }, [modelPath, tint]);
    return (
      <div className="bike-card" onClick={onSelect}>
        <div className="bike-canvas" ref={canvasRef} />
        <div className="bike-info">
          <div className="bike-title">{title}</div>
          <div className="bike-price">🪙 {price} TURBO</div>
        </div>
        <button
          className="purchase-button"
          onClick={(e) => { e.preventDefault(); }}
          disabled={true}
        >
          Coming soon
        </button>
      </div>
    );
  };

  // Show details only for clicked items, but provide a sensible default
  // If no selection exists when category changes, auto-select the first item in that category
  // Otherwise keep the user's current selection if still valid
  useEffect(() => {
    setSelectedItem((prev) => {
      // If there's no previous selection, pick a default for the current category
      if (!prev) {
        if (selectedCategory === 'bikes') return bikesData[0] || null;
        return filteredItems[0] || null;
      }
      // Preserve selection if it matches the current category and still exists
      if (selectedCategory === 'bikes') {
        return prev.type === 2 ? prev : (bikesData[0] || null);
      }
      const stillExists = filteredItems.some(i => i.id === prev.id && i.type !== 2);
      return stillExists ? prev : (filteredItems[0] || null);
    });
  }, [selectedCategory, shopItems]);

  if (loading) {
    return (
      <div className="shop-container">
        <div className="loading">Loading shop...</div>
      </div>
    );
  }

  return (
    <div className="shop-container">
      <div className="shop-header">
        <button className="back-button" onClick={onBackToMenu}>
          ← Back to Menu
        </button>
        <h1>🛒 TURBO SHOP</h1>
        <div className="player-balance">
          🪙 {turboBalanceDisplay} TURBO
        </div>
      </div>

      <div className="shop-content">
        {/* Category Tabs */}
        <div className="category-tabs">
          {categories.map(category => (
            <button
              key={category.id}
              className={`category-tab ${selectedCategory === category.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(category.id)}
            >
              <span className="category-icon">{category.icon}</span>
              <span className="category-name">{category.name}</span>
            </button>
          ))}
        </div>

        <div className={`shop-main ${selectedCategory === 'bikes' ? 'bikes-mode' : ''}`}>
          {selectedCategory !== 'bikes' && (
            <>
              {/* Items List */}
              <div className="items-grid">
                {filteredItems.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onSelect={(it) => setSelectedItem(it)}
                    onBuy={(it) => handlePurchase(it, it.type === 0 ? 1 : 1)}
                  />
                ))}
              </div>

              {/* Item Details */}
              {selectedItem && (
                <div className="item-details">
                  <div className="model-viewer" ref={modelViewerRef}>
                    <div className="viewer-instructions">
                      Click and drag to rotate
                    </div>
                  </div>
                  
                  <div className="item-info-detailed">
                    <h2>{selectedItem.name}</h2>
                    <div className="item-description">
                      {selectedItem.description || 'No description available.'}
                    </div>
                    
                    <div className="item-stats">
                      <h3>Effects:</h3>
                      {Array.isArray(selectedItem.effects) && selectedItem.effects.length > 0 ? (
                        selectedItem.effects.map((e, idx) => (
                          <div key={idx} className="stat">{e.key === 'Grip Boost' ? '🔒' : e.key === 'Armor Boost' ? '🛡️' : e.key === 'Nitro Boost' ? '⚡' : '🏃'} {e.key}: {e.value}</div>
                        ))
                      ) : (
                        <>
                          {selectedItem.speedBoost > 0 && (
                            <div className="stat">🏃 Speed Boost: +{selectedItem.speedBoost}</div>
                          )}
                          {selectedItem.gripBoost > 0 && (
                            <div className="stat">🔒 Grip Boost: +{selectedItem.gripBoost}</div>
                          )}
                          {selectedItem.armorBoost > 0 && (
                            <div className="stat">🛡️ Armor Boost: +{selectedItem.armorBoost}</div>
                          )}
                          {selectedItem.nitroBoost > 0 && (
                            <div className="stat">⚡ Nitro Boost: +{selectedItem.nitroBoost}</div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="purchase-section">
                      <div className="item-price-large">
                        {selectedItem.type === 0 ? (
                          <>🪙 {selectedItem.price * Math.max(1, Math.min(100, parseInt(quantity) || 1))} TURBO</>
                        ) : (
                          <>🪙 {selectedItem.price} TURBO</>
                        )}
                      </div>
                      
                      {selectedItem.type === 0 && (
                        <div className="quantity-selector">
                          <label htmlFor="quantity-input">Quantity</label>
                          <input
                            id="quantity-input"
                            className="quantity-input"
                            type="number"
                            min={1}
                            max={100}
                            value={quantity}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (Number.isNaN(v)) return setQuantity(1);
                              setQuantity(Math.max(1, Math.min(100, v)));
                            }}
                          />
                        </div>
                      )}
                      
                      <button
                        className="purchase-button"
                        onClick={(e) => { e.preventDefault(); }}
                        disabled={true}
                      >
                        Coming soon
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {selectedCategory === 'bikes' && (
            <>
              <div className="bikes-gallery">
                <BikeCard
                  title="Cruiser"
                  price={shopItems.find(i => i.slug === 'bike-cruiser')?.price || 250}
                  modelPath={'/models/bike-cruiser.glb'}
                  tint={null}
                  variant="cruiser"
                  onSelect={() => setSelectedItem(bikesData[0])}
                  onBuy={() => {
                    const item = shopItems.find(i => i.slug === 'bike-cruiser') || { id: 'bike_cruiser', price: 250 };
                    handlePurchase(item, 1);
                  }}
                />
                <BikeCard
                  title="Sport"
                  price={shopItems.find(i => i.slug === 'bike-sport')?.price || 500}
                  modelPath={'/models/bike-sport.glb'}
                  tint={null}
                  variant="sport"
                  onSelect={() => setSelectedItem(bikesData[1])}
                  onBuy={() => {
                    const item = shopItems.find(i => i.slug === 'bike-sport') || { id: 'bike_sport', price: 500 };
                    handlePurchase(item, 1);
                  }}
                />
                <BikeCard
                  title="Hyper"
                  price={shopItems.find(i => i.slug === 'bike-hyper')?.price || 900}
                  modelPath={'/models/bike-hyper.glb'}
                  tint={null}
                  variant="hyper"
                  onSelect={() => setSelectedItem(bikesData[2])}
                  onBuy={() => {
                    const item = shopItems.find(i => i.slug === 'bike-hyper') || { id: 'bike_hyper', price: 900 };
                    handlePurchase(item, 1);
                  }}
                />
              </div>

              {selectedItem && selectedItem.type === 2 && (
                <div className="item-details">
                  <div className="model-viewer" ref={modelViewerRef}>
                    <div className="viewer-instructions">Click and drag to rotate</div>
                  </div>
                  <div className="item-info-detailed">
                    <h2>{selectedItem.name}</h2>
                    <div className="item-description">
                      {selectedItem.description || 'No description available.'}
                    </div>
                    <div className="item-stats">
                      <h3>Effects:</h3>
                      {Array.isArray(selectedItem.effects) && selectedItem.effects.length > 0 ? (
                        selectedItem.effects.map((e, idx) => (
                          <div key={idx} className="stat">{e.key === 'Grip Boost' ? '🔒' : e.key === 'Armor Boost' ? '🛡️' : '🏃'} {e.key}: {e.value}</div>
                        ))
                      ) : (
                        <>
                          {selectedItem.speedBoost > 0 && (
                            <div className="stat">🏃 Speed Boost: +{selectedItem.speedBoost}</div>
                          )}
                          {selectedItem.gripBoost > 0 && (
                            <div className="stat">🔒 Grip Boost: +{selectedItem.gripBoost}</div>
                          )}
                          {selectedItem.armorBoost > 0 && (
                            <div className="stat">🛡️ Armor Boost: +{selectedItem.armorBoost}</div>
                          )}
                          {selectedItem.nitroBoost > 0 && (
                            <div className="stat">⚡ Nitro Boost: +{selectedItem.nitroBoost}</div>
                          )}
                        </>
                      )}
                    </div>
                    <div className="purchase-section">
                      <div className="item-price-large">🪙 {selectedItem.price} TURBO</div>
                      <button
                        className="purchase-button"
                        onClick={(e) => { e.preventDefault(); }}
                        disabled={true}
                      >
                        Coming soon
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
