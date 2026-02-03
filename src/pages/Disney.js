import { useEffect, useRef, useState } from 'react';
import '../App.css';
import './Disney.css';
import * as FRAGS from '@thatopen/fragments';
import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import LoadingSpinner from '../common/loadingSpinner';

const EPCOT_COORDS = {
  lat: 28.3747,
  lng: -81.5494,
};

const MODELS_STORAGE_KEY = 'disneyModels';
const LOCATIONS_STORAGE_KEY = 'disneyLocations';

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function Disney() {
  const serializerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Fragment viewer (Three.js / ThatOpen Engine) overlay refs
  const viewerContainerRef = useRef(null);
  const viewerComponentsRef = useRef(null);
  const viewerFragmentsRef = useRef(null);
  const viewerWorldRef = useRef(null);
  const viewerModelRef = useRef(null);
  const viewerReadyRef = useRef(false);
  const geoObjectsRef = useRef([]);
  const fragmentInstancesRef = useRef(new Map());
  const transformControlsRef = useRef(null);
  const mapPlaneRef = useRef(null);

  const [models, setModels] = useState([]);
  const [locations, setLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [activeLocationId, setActiveLocationId] = useState(null);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0, z: 0 });

  // Simple helper to convert lat/lng (degrees) to local X/Z coordinates (meters)
  const geoToLocal = (lat, lng) => {
    const latRad = (EPCOT_COORDS.lat * Math.PI) / 180;
    const metersPerDegLat = 111132; // approx
    const metersPerDegLon = 111320 * Math.cos(latRad);

    const dLat = lat - EPCOT_COORDS.lat;
    const dLon = lng - EPCOT_COORDS.lng;

    const x = dLon * metersPerDegLon;
    const z = dLat * metersPerDegLat;

    return { x, z };
  };
  // Initialise fragment viewer overlay (reusing ThatOpen fragments viewer)
  useEffect(() => {
    if (!viewerContainerRef.current || viewerComponentsRef.current) return;

    const container = viewerContainerRef.current;

    const components = new OBC.Components();
    viewerComponentsRef.current = components;

    const worlds = components.get(OBC.Worlds);
    const world = worlds.create();
    viewerWorldRef.current = world;

    world.scene = new OBC.SimpleScene(components);
    world.scene.setup();
    world.scene.three.background = new THREE.Color(0x0f172a);

    world.renderer = new OBC.SimpleRenderer(components, container);
    world.camera = new OBC.SimpleCamera(components);
    // Position camera high and far back to see the entire map area (2000m × 2000m)
    world.camera.controls.setLookAt(500, 400, 500, 0, 0, 0);
    
    // Increase far plane so we can see the entire 2km map from any angle
    world.camera.three.far = 10000;
    world.camera.three.updateProjectionMatrix();

    components.init();

    // Don't create ThatOpen grids (we'll add our own reference grid on the map plane)
    // const grids = components.get(OBC.Grids);
    // grids.create(world);

    const workerUrl = `${window.location.origin}/worker.mjs`;
    const fragments = new FRAGS.FragmentsModels(workerUrl);
    viewerFragmentsRef.current = fragments;

    world.camera.controls.addEventListener('rest', () => fragments.update(true));

    // Setup TransformControls for interactive fragment manipulation
    const transformControls = new TransformControls(world.camera.three, world.renderer.three.domElement);
    transformControls.addEventListener('dragging-changed', (event) => {
      world.camera.controls.enabled = !event.value;
    });
    world.scene.three.add(transformControls);
    transformControlsRef.current = transformControls;

    // Handle double-click to attach transform controls to a fragment
    const handleDoubleClick = (event) => {
      // Guard: ensure world and camera are ready
      if (!viewerReadyRef.current || !world || !world.camera || !world.camera.three) {
        console.warn('[Disney] World not ready for raycasting');
        return;
      }

      const mouse = new THREE.Vector2();
      const rect = container.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, world.camera.three);

      // Raycast against all fragment parent groups
      const groups = [];
      fragmentInstancesRef.current.forEach((modelId, locId) => {
        const group = world.scene.three.getObjectByName(`disney_group_${locId}`);
        if (group) groups.push(group);
      });

      if (groups.length === 0) {
        // No fragments loaded yet
        return;
      }

      try {
        const intersects = raycaster.intersectObjects(groups, true);
        if (intersects.length > 0) {
          // Find the parent group
          let targetGroup = intersects[0].object;
          while (targetGroup.parent && !targetGroup.name.startsWith('disney_group_')) {
            targetGroup = targetGroup.parent;
          }
          
          if (targetGroup && targetGroup.name.startsWith('disney_group_')) {
            transformControls.attach(targetGroup);
            console.log('[Disney] Transform controls attached to', targetGroup.name);
          }
        } else {
          transformControls.detach();
        }
      } catch (error) {
        console.error('[Disney] Error during raycasting', error);
      }
    };

    container.addEventListener('dblclick', handleDoubleClick);

    // Update location data when transform controls change
    transformControls.addEventListener('objectChange', () => {
      const attached = transformControls.object;
      if (attached && attached.name.startsWith('disney_group_')) {
        const locId = attached.name.replace('disney_group_', '');
        const loc = locations.find((l) => l.id === locId);
        if (loc) {
          // Convert world position back to lat/lng (inverse of geoToLocal)
          const x = attached.position.x;
          const z = attached.position.z;
          const elevation = attached.position.y;
          const rotation = THREE.MathUtils.radToDeg(attached.rotation.y);

          const latRad = (EPCOT_COORDS.lat * Math.PI) / 180;
          const metersPerDegLat = 111132;
          const metersPerDegLon = 111320 * Math.cos(latRad);

          const lat = EPCOT_COORDS.lat + z / metersPerDegLat;
          const lng = EPCOT_COORDS.lng + x / metersPerDegLon;

          setLocations((prev) =>
            prev.map((item) =>
              item.id === locId
                ? { ...item, lat, lng, elevation, rotation }
                : item
            )
          );
        }
      }
    });

    viewerReadyRef.current = true;

    return () => {
      if (viewerComponentsRef.current) {
        viewerComponentsRef.current.dispose();
      }
      viewerComponentsRef.current = null;
      viewerFragmentsRef.current = null;
      viewerWorldRef.current = null;
      viewerModelRef.current = null;
      viewerReadyRef.current = false;
    };
  }, []);

  // Initialise IFC -> Fragments serializer and restore saved state
  useEffect(() => {
    const serializer = new FRAGS.IfcImporter();
    serializer.wasm = {
      absolute: true,
      path: 'https://unpkg.com/web-ifc@0.0.72/',
    };
    serializerRef.current = serializer;

    try {
      const storedModels = JSON.parse(localStorage.getItem(MODELS_STORAGE_KEY) || '[]');
      if (Array.isArray(storedModels)) {
        setModels(storedModels);
      }
    } catch (error) {
      console.error('Error reading Disney models from localStorage:', error);
    }

    try {
      const storedLocations = JSON.parse(localStorage.getItem(LOCATIONS_STORAGE_KEY) || '[]');
      if (Array.isArray(storedLocations)) {
        setLocations(storedLocations);
      }
    } catch (error) {
      console.error('Error reading Disney locations from localStorage:', error);
    }
  }, []);

  // Add a map plane + GeoJSON into the main 3D viewer
  useEffect(() => {
    if (!viewerReadyRef.current || !viewerWorldRef.current) return;

    const world = viewerWorldRef.current;

    // Create a ground plane with an actual map texture from OpenStreetMap
    const planeSize = 2000; // meters (roughly 2km × 2km around Epcot)
    const planeGeometry = new THREE.PlaneGeometry(planeSize, planeSize, 1, 1);
    
    // Load a static map image centered on Epcot from OpenStreetMap
    // Using a tile server to get a satellite/street view
    // Zoom level 15 gives us good detail for a ~2km area
    const zoom = 15;
    const centerLat = EPCOT_COORDS.lat;
    const centerLng = EPCOT_COORDS.lng;
    
    // Calculate tile coordinates for the center
    const n = Math.pow(2, zoom);
    const xtile = Math.floor(((centerLng + 180) / 360) * n);
    const ytile = Math.floor(
      ((1 - Math.log(Math.tan((centerLat * Math.PI) / 180) + 1 / Math.cos((centerLat * Math.PI) / 180)) / Math.PI) / 2) * n
    );
    
    // Build a composite map from multiple tiles (3×3 grid for better coverage)
    const tileSize = 256;
    const tilesPerSide = 3;
    const canvas = document.createElement('canvas');
    canvas.width = tileSize * tilesPerSide;
    canvas.height = tileSize * tilesPerSide;
    const ctx = canvas.getContext('2d');
    
    let loadedTiles = 0;
    const totalTiles = tilesPerSide * tilesPerSide;
    
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0;
    plane.name = 'disney_map_plane';
    world.scene.three.add(plane);
    geoObjectsRef.current.push(plane);
    mapPlaneRef.current = plane;
    
    // Load tiles from OpenStreetMap
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          ctx.drawImage(
            img,
            (dx + 1) * tileSize,
            (dy + 1) * tileSize,
            tileSize,
            tileSize
          );
          loadedTiles += 1;
          
          if (loadedTiles === totalTiles) {
            // All tiles loaded, create texture
            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;
            planeMaterial.map = texture;
            planeMaterial.needsUpdate = true;
            console.log('[Disney] Map texture loaded successfully');
          }
        };
        img.onerror = () => {
          console.warn('[Disney] Failed to load map tile', { dx, dy });
          loadedTiles += 1;
        };
        img.src = `https://tile.openstreetmap.org/${zoom}/${xtile + dx}/${ytile + dy}.png`;
      }
    }

    const url = new URL(
      'https://services2.arcgis.com/N4cKzJ9dzXmsPNRs/arcgis/rest/services/CFTOD_Address_Finder_(Public)/FeatureServer/0/query'
    );
    const params = new URLSearchParams({
      where: '1=1',
      outFields: '*',
      returnGeometry: 'true',
      outSR: '4326',
      f: 'geojson',
    });
    url.search = params.toString();

    const fetchGeojson = async () => {
      try {
        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(`GeoJSON request failed with status ${response.status}`);
        }
        const data = await response.json();

        const objects = [];

        const addObject = (obj) => {
          world.scene.three.add(obj);
          objects.push(obj);
        };

        const processLine = (coordinates) => {
          const points = coordinates.map(([lng, lat]) => {
            const { x, z } = geoToLocal(lat, lng);
            return new THREE.Vector3(x, 0.5, z); // raised slightly above ground
          });
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const material = new THREE.LineBasicMaterial({
            color: 0x8b5cf6, // brighter purple
            linewidth: 2,
          });
          const line = new THREE.Line(geometry, material);
          addObject(line);
        };

        const processPoint = ([lng, lat]) => {
          const { x, z } = geoToLocal(lat, lng);
          const geometry = new THREE.SphereGeometry(2, 8, 8);
          const material = new THREE.MeshBasicMaterial({ color: 0xf97316 });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(x, 1, z); // slightly above ground
          addObject(mesh);
        };

        if (data && Array.isArray(data.features)) {
          data.features.forEach((feature) => {
            const { geometry } = feature;
            if (!geometry) return;
            const { type, coordinates } = geometry;

            if (type === 'LineString') {
              processLine(coordinates);
            } else if (type === 'MultiLineString') {
              coordinates.forEach((line) => processLine(line));
            } else if (type === 'Point') {
              processPoint(coordinates);
            } else if (type === 'MultiPoint') {
              coordinates.forEach((pt) => processPoint(pt));
            }
          });
        }

        geoObjectsRef.current.push(...objects);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading CFTOD GeoJSON data:', error);
      }
    };

    fetchGeojson();

    return () => {
      // Clean up all geo objects from scene
      geoObjectsRef.current.forEach((obj) => {
        if (obj.parent) {
          obj.parent.remove(obj);
        }
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      geoObjectsRef.current = [];
    };
  }, []);

  // Persist models and locations locally for future sessions
  useEffect(() => {
    try {
      // Store only lightweight metadata in localStorage to avoid quota issues.
      // The full fragmentBase64 payload can be kept in memory for the current
      // session but doesn't need to be persisted between reloads.
      const compactModels = models.map((model) => ({
        id: model.id,
        name: model.name,
        createdAt: model.createdAt,
      }));
      localStorage.setItem(MODELS_STORAGE_KEY, JSON.stringify(compactModels));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error saving Disney models to localStorage:', error);
    }
  }, [models]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCATIONS_STORAGE_KEY, JSON.stringify(locations));
    } catch (error) {
      console.error('Error saving Disney locations to localStorage:', error);
    }
  }, [locations]);

  // Apply map offset when it changes
  useEffect(() => {
    if (mapPlaneRef.current) {
      mapPlaneRef.current.position.set(mapOffset.x, mapOffset.y, mapOffset.z);
      console.log('[Disney] Map offset applied', mapOffset);
    }
  }, [mapOffset]);

  // Load/update fragment instances in the main 3D viewer based on locations
  useEffect(() => {
    if (!viewerReadyRef.current || !viewerWorldRef.current || !viewerFragmentsRef.current) return;

    const world = viewerWorldRef.current;
    const fragments = viewerFragmentsRef.current;
    const instanceMap = fragmentInstancesRef.current;

    // Helper to position a fragment object from location data
    const applyTransform = (object, loc) => {
      const { x, z } = geoToLocal(loc.lat, loc.lng);
      const elevation = loc.elevation || 0;
      const rotationDeg = loc.rotation || 0;

      object.position.set(x, elevation, z);
      object.rotation.set(0, THREE.MathUtils.degToRad(rotationDeg), 0);
      
      // eslint-disable-next-line no-console
      console.log('[Disney] Applied transform to fragment', {
        locationId: loc.id,
        position: { x, y: elevation, z },
        rotation: rotationDeg,
      });
    };

    const locationIds = new Set(locations.map((l) => l.id));

    // Remove instances for deleted locations
    instanceMap.forEach((modelId, locId) => {
      if (!locationIds.has(locId)) {
        fragments.disposeModel(modelId);
        instanceMap.delete(locId);
      }
    });

    // For each location, ensure a fragment instance exists and is positioned
    locations.forEach((loc) => {
      const existingModelId = instanceMap.get(loc.id);
      if (!existingModelId) {
        const modelMeta = models.find((m) => m.id === loc.modelId);
        if (!modelMeta || !modelMeta.fragmentBase64) return;

        const binaryString = atob(modelMeta.fragmentBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i += 1) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const arrayBuffer = bytes.buffer;

        const modelId = `disney_instance_${loc.id}`;

        (async () => {
          try {
            const model = await fragments.load(arrayBuffer, { modelId });
            model.useCamera(world.camera.three);
            
            // Create a parent group for this instance so we can center the model
            // and then apply geo transforms to the parent
            const parentGroup = new THREE.Group();
            parentGroup.name = `disney_group_${loc.id}`;
            
            // Center the model's geometry around the origin within the parent
            const box = new THREE.Box3().setFromObject(model.object);
            const center = new THREE.Vector3();
            box.getCenter(center);
            model.object.position.set(-center.x, -center.y, -center.z);
            
            parentGroup.add(model.object);
            world.scene.three.add(parentGroup);
            await fragments.update(true);

            // Apply geo transform to the parent group
            applyTransform(parentGroup, loc);

            instanceMap.set(loc.id, modelId);
            // eslint-disable-next-line no-console
            console.log('[Disney] Created fragment instance for location', {
              locationId: loc.id,
              modelId,
              parentGroup: parentGroup.name,
            });
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('[Disney] Error creating fragment instance', error);
          }
        })();
      } else {
        // Update transform for existing instance
        // The parent group is what we need to transform, not the fragment object itself
        const parentGroupName = `disney_group_${loc.id}`;
        const parentGroup = world.scene.three.getObjectByName(parentGroupName);
        if (parentGroup) {
          applyTransform(parentGroup, loc);
        } else {
          // eslint-disable-next-line no-console
          console.warn('[Disney] Could not find parent group for location', loc.id);
        }
      }
    });
  }, [locations, models]);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || !serializerRef.current) return;

    setIsLoading(true);
    setLoadingMessage('Converting IFC files to fragments...');

    try {
      // eslint-disable-next-line no-console
      console.log('[Disney] Starting file processing', {
        count: files.length,
        names: files.map((f) => f.name),
      });
      const newModels = [];
      const newLocations = [];

      // Process files sequentially to keep memory usage reasonable
      /* eslint-disable no-await-in-loop */
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const nameWithoutExt = file.name.replace(/\.(ifc|IFC|frag|FRAG)$/, '');
        const arrayBuffer = await file.arrayBuffer();
        // eslint-disable-next-line no-console
        console.log('[Disney] Read file as ArrayBuffer', {
          name: file.name,
          bytes: arrayBuffer.byteLength,
        });

        let fragmentBuffer;

        if (file.name.toLowerCase().endsWith('.frag')) {
          fragmentBuffer = arrayBuffer;
          // eslint-disable-next-line no-console
          console.log('[Disney] Using existing .frag data for model', nameWithoutExt);
        } else {
          // Convert IFC -> fragments using the same engine as the IFC Importer page
          const ifcBytes = new Uint8Array(arrayBuffer);
          // eslint-disable-next-line no-console
          console.log('[Disney] Converting IFC to fragments', {
            name: nameWithoutExt,
            sizeMB: (ifcBytes.byteLength / 1024 / 1024).toFixed(2),
          });
          fragmentBuffer = await serializerRef.current.process({
            bytes: ifcBytes,
          });
          // eslint-disable-next-line no-console
          console.log('[Disney] IFC converted to fragments', {
            name: nameWithoutExt,
            sizeMB: (fragmentBuffer.byteLength / 1024 / 1024).toFixed(2),
          });
        }

        const fragmentBase64 = arrayBufferToBase64(fragmentBuffer);
        const modelId = `disney_model_${Date.now()}_${i}`;

        const modelRecord = {
          id: modelId,
          name: nameWithoutExt,
          fragmentBase64,
          createdAt: new Date().toISOString(),
        };
        newModels.push(modelRecord);
        // eslint-disable-next-line no-console
        console.log('[Disney] Created model record', modelRecord);

        // Default location at Epcot center so it's immediately visible on the map
        const locationRecord = {
          id: `disney_location_${Date.now()}_${i}`,
          modelId,
          label: nameWithoutExt,
          lat: EPCOT_COORDS.lat,
          lng: EPCOT_COORDS.lng,
          elevation: 0,
          rotation: 0,
        };
        newLocations.push(locationRecord);
        // eslint-disable-next-line no-console
        console.log('[Disney] Created default location for model', locationRecord);
      }
      /* eslint-enable no-await-in-loop */

      setModels((prev) => [...prev, ...newModels]);
      setLocations((prev) => [...prev, ...newLocations]);

      setLoadingMessage('IFC files converted and stored locally.');
    } catch (error) {
      console.error('Error processing IFC files:', error);
      // eslint-disable-next-line no-alert
      alert(`Error processing IFC files: ${error.message}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = (event) => {
    if (event.target.files && event.target.files.length) {
      handleFiles(event.target.files);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer.files && event.dataTransfer.files.length) {
      handleFiles(event.dataTransfer.files);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleAddLocation = () => {
    if (!models.length) {
      // eslint-disable-next-line no-alert
      alert('Import at least one IFC/fragment model before adding locations.');
      // eslint-disable-next-line no-console
      console.warn('[Disney] Tried to add location without any models');
      return;
    }

    const now = Date.now();
    const newLocation = {
      id: `disney_location_${now}`,
      modelId: models[0].id,
      label: `Location ${locations.length + 1}`,
      lat: EPCOT_COORDS.lat,
      lng: EPCOT_COORDS.lng,
      elevation: 0,
      rotation: 0,
    };

    setLocations((prev) => {
      const next = [...prev, newLocation];
      // eslint-disable-next-line no-console
      console.log('[Disney] Added new location', newLocation, 'All locations now:', next);
      return next;
    });
  };

  const updateLocationField = (locationId, field, value) => {
    setLocations((prev) => {
      const next = prev.map((loc) =>
        loc.id === locationId
          ? {
              ...loc,
              [field]: value,
            }
          : loc
      );
      // eslint-disable-next-line no-console
      console.log('[Disney] Updated location field', {
        locationId,
        field,
        value,
        nextLocation: next.find((l) => l.id === locationId),
      });
      return next;
    });
  };

  const handleRemoveLocation = (locationId) => {
    setLocations((prev) => prev.filter((loc) => loc.id !== locationId));
  };

  const focusLocationOnMap = (locationId) => {
    const loc = locations.find((item) => item.id === locationId);
    if (!loc) {
      // eslint-disable-next-line no-console
      console.warn('[Disney] focusLocationOnMap: location not found for id', locationId);
      return;
    }

    // Debug logs to trace focus behavior
    // eslint-disable-next-line no-console
    console.log('[Disney] Focusing location', {
      id: locationId,
      lat: loc.lat,
      lng: loc.lng,
      modelId: loc.modelId,
    });

    setActiveLocationId(locationId);
    if (!viewerWorldRef.current) return;

    const { x, z } = geoToLocal(loc.lat, loc.lng);
    const elevation = loc.elevation || 0;
    const world = viewerWorldRef.current;

    const offset = 60;
    world.camera.controls.setLookAt(
      x + offset,
      elevation + offset,
      z + offset,
      x,
      elevation,
      z,
    );
  };

  // Keep tracking active location for potential future UI (selection highlight)
  useEffect(() => {
    if (activeLocationId && !locations.find((l) => l.id === activeLocationId)) {
      setActiveLocationId(null);
    }
  }, [activeLocationId, locations]);

  return (
    <div className="DisneyPage">
      {isLoading && <LoadingSpinner message={loadingMessage} />}
      <div className="disney-layout">
        <aside className="disney-sidebar">
          <section className="disney-section">
            <h2 className="disney-section-title">Models</h2>
            <p className="disney-section-help">
              Drop IFC files here or use the selector. Each file is converted to
              fragments and stored locally (browser-only) for reuse on this page.
            </p>
            <div
              className="disney-dropzone"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
            >
              <span className="disney-dropzone-icon">+</span>
              <span className="disney-dropzone-text">
                Drop IFC / .frag files or click to add
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ifc,.IFC,.frag,.FRAG"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
            />
            <div className="disney-model-list">
              {models.length === 0 ? (
                <p className="disney-empty">No models imported yet.</p>
              ) : (
                models.map((model) => (
                  <div key={model.id} className="disney-model-item">
                    <div className="disney-model-name">{model.name}</div>
                    <div className="disney-model-meta">
                      Saved locally for this browser only
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="disney-section">
            <h2 className="disney-section-title">Map Alignment</h2>
            <p className="disney-section-help">
              Manually adjust the map position to align it with your fragments.
            </p>
            <div className="disney-location-grid">
              <label className="disney-field-label">
                Offset X (m)
                <input
                  type="number"
                  step="1"
                  className="disney-input"
                  value={mapOffset.x}
                  onChange={(event) =>
                    setMapOffset((prev) => ({
                      ...prev,
                      x: parseFloat(event.target.value) || 0,
                    }))
                  }
                />
              </label>
              <label className="disney-field-label">
                Offset Z (m)
                <input
                  type="number"
                  step="1"
                  className="disney-input"
                  value={mapOffset.z}
                  onChange={(event) =>
                    setMapOffset((prev) => ({
                      ...prev,
                      z: parseFloat(event.target.value) || 0,
                    }))
                  }
                />
              </label>
            </div>
            <button
              type="button"
              className="disney-location-focus"
              style={{ marginTop: '0.5rem', width: '100%' }}
              onClick={() => setMapOffset({ x: 0, y: 0, z: 0 })}
            >
              Reset Map Position
            </button>
          </section>

          <section className="disney-section disney-locations">
            <div className="disney-section-header">
              <h2 className="disney-section-title">Locations</h2>
              <button
                type="button"
                className="disney-add-location-btn"
                onClick={handleAddLocation}
                title="Add location"
              >
                +
              </button>
            </div>
            <p className="disney-section-help">
              Each location places one of your models on the map at Epcot. Adjust
              latitude, longitude, elevation, and rotation as needed.
            </p>

            {locations.length === 0 ? (
              <p className="disney-empty">
                Use the <strong>+</strong> button to add your first location.
              </p>
            ) : (
              <div className="disney-location-list">
                {locations.map((loc, index) => (
                  <div
                    key={loc.id}
                    className="disney-location-card"
                    onClick={() => setActiveLocationId(loc.id)}
                  >
                    <div className="disney-location-header">
                      <input
                        className="disney-location-name"
                        value={loc.label || `Location ${index + 1}`}
                        onChange={(event) =>
                          updateLocationField(loc.id, 'label', event.target.value)
                        }
                      />
                      <div className="disney-location-header-actions">
                        <button
                          type="button"
                          className="disney-location-focus"
                          onClick={() => focusLocationOnMap(loc.id)}
                        >
                          Focus
                        </button>
                        <button
                          type="button"
                          className="disney-location-remove"
                          onClick={() => handleRemoveLocation(loc.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <div className="disney-location-row">
                      <label className="disney-field-label" htmlFor={`model-${loc.id}`}>
                        Model
                      </label>
                      <select
                        id={`model-${loc.id}`}
                        className="disney-select"
                        value={loc.modelId}
                        onChange={(event) =>
                          updateLocationField(loc.id, 'modelId', event.target.value)
                        }
                      >
                        {models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="disney-location-grid">
                      <label className="disney-field-label">
                        Lat
                        <input
                          type="number"
                          step="0.000001"
                          className="disney-input"
                          value={loc.lat}
                          onChange={(event) =>
                            updateLocationField(
                              loc.id,
                              'lat',
                              parseFloat(event.target.value) || EPCOT_COORDS.lat
                            )
                          }
                        />
                      </label>
                      <label className="disney-field-label">
                        Lng
                        <input
                          type="number"
                          step="0.000001"
                          className="disney-input"
                          value={loc.lng}
                          onChange={(event) =>
                            updateLocationField(
                              loc.id,
                              'lng',
                              parseFloat(event.target.value) || EPCOT_COORDS.lng
                            )
                          }
                        />
                      </label>
                    </div>

                    <div className="disney-location-grid">
                      <label className="disney-field-label">
                        Elevation (m)
                        <input
                          type="number"
                          step="0.1"
                          className="disney-input"
                          value={loc.elevation}
                          onChange={(event) =>
                            updateLocationField(
                              loc.id,
                              'elevation',
                              parseFloat(event.target.value) || 0
                            )
                          }
                        />
                      </label>
                      <label className="disney-field-label">
                        Rotation (°)
                        <input
                          type="number"
                          step="1"
                          min="0"
                          max="360"
                          className="disney-input"
                          value={loc.rotation}
                          onChange={(event) =>
                            updateLocationField(
                              loc.id,
                              'rotation',
                              parseFloat(event.target.value) || 0
                            )
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>

        <div className="disney-map-container">
          <div ref={viewerContainerRef} className="disney-map" />
        </div>
      </div>
    </div>
  );
}

export default Disney;


