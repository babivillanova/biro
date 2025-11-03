import { useEffect, useRef } from 'react';
import '../App.css';
import './Edit.css';
import * as THREE from "three";
import Stats from "stats.js";
import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { supabase } from '../supabaseClient';

// Track initialization state across component remounts (for React.StrictMode)
let isSceneInitialized = false;

// GeneralEditor class for editing BIM elements
class GeneralEditor {
  onUpdated = new OBC.Event();
  sampleMaterialsUpdated = new OBC.Event();

  // Reference to the currently used world
  _world;

  // Current element being edited
  _element = null;

  // Current three.js mesh for editing
  _mesh = null;

  // Global and local transform controls
  _gControls;
  _lControls = [];

  // Transform type: global or local
  _controlType = "global";

  // Materials, local transforms and geometries
  _materials = null;
  _localTransformsIds = [];
  _geometriesIds = [];

  // Model reference
  _model = null;
  _fragments = null;
  
  // User tracking
  _userIp = null;

  get materials() {
    if (!this._materials) {
      throw new Error("Editor not initialized");
    }
    return this._materials;
  }

  get localTransformsIds() {
    if (!this._localTransformsIds.length) {
      throw new Error("Editor not initialized");
    }
    return this._localTransformsIds;
  }

  get geometriesIds() {
    if (!this._geometriesIds.length) {
      throw new Error("Editor not initialized");
    }
    return this._geometriesIds;
  }

  get samples() {
    if (!this._element) {
      throw new Error("No element selected");
    }
    return this._element.core.samples;
  }

  get elementSelected() {
    return this._element !== null;
  }

  constructor(world, model, fragments) {
    this._world = world;
    this._model = model;
    this._fragments = fragments;
    this._gControls = new TransformControls(
      world.camera.three,
      world.renderer.three.domElement
    );
    this.setupEvents();
  }

  async init() {
    this._materials = await this._model.getMaterials();
    const allLtIds = await this._model.getLocalTransformsIds();
    const allGeomsIds = await this._model.getRepresentationsIds();
    this._localTransformsIds = [allLtIds[0], allLtIds[1]];
    this._geometriesIds = [allGeomsIds[0], allGeomsIds[1]];
  }

  setUserIp(ip) {
    this._userIp = ip;
  }

  get3dMaterials() {
    if (!this._mesh) {
      return [];
    }
    const materialList = new Map();

    this._mesh.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        materialList.set(
          object.material.userData.localId,
          object.material
        );
      }
    });

    return Array.from(materialList.values());
  }

  async setSampleMaterial(id, material) {
    if (!this._element) {
      return;
    }
    this._element.core.samples[id].material = material;
    await this.updateSamples();
    this.sampleMaterialsUpdated.trigger();
  }

  async updateMaterials() {
    if (!this._materials) {
      return;
    }
    this._materials = await this._model.getMaterials();
  }

  overrideGeometryWithCube() {
    if (!this._mesh) {
      return;
    }
    this._mesh.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const geometry = object.geometry;
        const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
        geometry.setAttribute("position", boxGeometry.attributes.position);
        geometry.setIndex(boxGeometry.index);
        geometry.setAttribute("normal", boxGeometry.attributes.normal);
      }
    });
  }

  async saveRequestsToDatabase(requests) {
    // Save edit requests to Supabase
    console.log('💾 Saving to Supabase...', {
      model_id: this._model.modelId,
      num_requests: requests.length,
      user_ip: this._userIp
    });
    
    try {
      const requestsToSave = requests.map((request, index) => ({
        model_id: this._model.modelId,
        request_type: request.type,
        local_id: request.localId,
        request_data: request,
        sequence_order: index,
        is_undone: false,
        user_id: this._userIp // Store IP address as user identifier
      }));

      const startTime = performance.now();
      const { data, error } = await supabase
        .from('edit_requests')
        .insert(requestsToSave)
        .select();
      const duration = (performance.now() - startTime).toFixed(2);

      if (error) {
        console.error('❌ Error saving to Supabase:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        return false;
      }

      console.log(`✅ Saved ${data.length} requests to database (${duration}ms)`);
      console.log('📦 Saved data:', data);
      return true;
    } catch (error) {
      console.error('❌ Exception in saveRequestsToDatabase:', error);
      return false;
    }
  }

  async applyChanges() {
    if (!this._element || !this._mesh) {
      return;
    }

    // Generate requests to apply changes
    await this._element.setMeshes(this._mesh);

    // Unselect the element
    this.dispose();

    // Apply changes to Fragments
    const requests = this._element.getRequests();
    if (requests) {
      await this._fragments.editor.edit(this._model.modelId, requests);
      
      // Save to Supabase for multi-user sync
      await this.saveRequestsToDatabase(requests);
    }

    // If no changes, show hidden items
    if (!this._element.elementChanged) {
      await this.setVisible(true);
    }

    // Update the viewer
    await this._fragments.update(true);

    // Reset variables
    this._element = null;
    this._mesh = null;

    // Trigger UI update
    this.onUpdated.trigger();
  }

  setControlsMode(mode) {
    this._gControls.setMode(mode);
    for (const localTransformControl of this._lControls) {
      localTransformControl.setMode(mode);
    }
  }

  setControlsTarget(target = this._controlType) {
    const globalGizmo = this._gControls.getHelper();
    if (target === "global") {
      this._world.scene.three.add(globalGizmo);
      this._gControls.enabled = true;
      for (const localTransformControl of this._lControls) {
        const localGizmo = localTransformControl.getHelper();
        localGizmo.removeFromParent();
        localTransformControl.enabled = false;
      }
    } else {
      globalGizmo.removeFromParent();
      this._gControls.enabled = false;
      for (const localTransformControl of this._lControls) {
        const localGizmo = localTransformControl.getHelper();
        this._world.scene.three.add(localGizmo);
        localTransformControl.enabled = true;
      }
    }
    this._controlType = target;
  }

  async updateSamples() {
    if (!this._element || !this._mesh) {
      return;
    }
    const prevTransform = this._mesh.matrixWorld.clone();
    await this._element.updateSamples();
    this.dispose();

    this._mesh = await this._element.getMeshes();
    this._world.scene.three.add(this._mesh);
    await this.createControls();
    this._mesh.position.set(0, 0, 0);
    this._mesh.rotation.set(0, 0, 0);
    this._mesh.applyMatrix4(prevTransform);
  }

  async createControls() {
    if (!this._mesh) {
      return;
    }

    this._gControls.attach(this._mesh);

    for (const localMesh of this._mesh.children) {
      const localTransformControl = new TransformControls(
        this._world.camera.three,
        this._world.renderer.three.domElement
      );
      localTransformControl.attach(localMesh);
      localTransformControl.setMode(this._gControls.mode);
      this._lControls.push(localTransformControl);
      localTransformControl.addEventListener("dragging-changed", (event) => {
        if (this._world.camera.hasCameraControls()) {
          this._world.camera.controls.enabled = !event.value;
        }
      });
    }

    this.setControlsTarget();
  }

  dispose() {
    // Dispose meshes
    if (this._mesh && this._element) {
      this._element.disposeMeshes(this._mesh);
    }
    
    // Dispose global transform controls
    const globalGizmo = this._gControls.getHelper();
    globalGizmo.removeFromParent();
    this._gControls.detach();
    
    if (!this._mesh || !this._element) {
      return;
    }
    
    for (const localTransformControl of this._lControls) {
      localTransformControl.detach();
      localTransformControl.dispose();
    }
    this._lControls.length = 0;
  }

  async setVisible(visible) {
    if (!this._element) {
      return;
    }
    const promises = [];
    for (const [, model] of this._fragments.models.list) {
      if (model.deltaModelId) {
        if (visible === true) {
          const editedElements = new Set(await model.getEditedElements());
          if (visible && editedElements.has(this._element.localId)) {
            continue;
          }
        }
      }

      promises.push(model.setVisible([this._element.localId], visible));
    }
    await Promise.all(promises);
  }

  setupEvents() {
    // Prevent camera move when using global transform controls
    this._gControls.addEventListener("dragging-changed", (event) => {
      if (this._world.camera.hasCameraControls()) {
        this._world.camera.controls.enabled = !event.value;
      }
    });

    // Double click event logic to select an element
    const mouse = new THREE.Vector2();
    const canvas = this._world.renderer.three.domElement;
    canvas.addEventListener("dblclick", async (event) => {
      mouse.x = event.clientX;
      mouse.y = event.clientY;
      let result;

      // Raycast all models, including delta models
      for (const [, model] of this._fragments.models.list) {
        const promises = [];
        promises.push(
          model.raycast({
            camera: this._world.camera.three,
            mouse,
            dom: this._world.renderer.three.domElement,
          })
        );
        const results = await Promise.all(promises);
        let smallestDistance = Infinity;
        for (const current of results) {
          if (current) {
            if (current.distance < smallestDistance) {
              smallestDistance = current.distance;
              result = current;
            }
          }
        }
      }

      // If nothing is found, return
      if (!result) {
        return;
      }

      // If an element was already selected, reset the visibility
      if (this._element) {
        await this.setVisible(true);
      }

      // Get the selected element
      const [element] = await this._fragments.editor.getElements(this._model.modelId, [
        result.localId,
      ]);
      this._element = element;
      if (!element) {
        return;
      }

      // Dispose the previous mesh, if any
      if (this._mesh) {
        this.dispose();
      }

      // Set the visibility of the selected elements to false
      await this.setVisible(false);

      // Add the selected meshes to the scene
      this._mesh = await element.getMeshes();
      this._world.scene.three.add(this._mesh);
      await this.createControls();

      // Update the viewer
      await this._fragments.update(true);

      // Trigger the UI update
      this.onUpdated.trigger();
    });

    // Keydown event logic to cancel the edit
    window.addEventListener("keydown", async (event) => {
      if (event.key === "Escape") {
        if (!this._element || !this._mesh) {
          return;
        }

        // Clear the existing edit requests
        this._element.getRequests();
        this.dispose();

        // Show hidden items
        this.setVisible(true);

        // Update the viewer
        await this._fragments.update(true);

        // Reset variables
        this._element = null;
        this._mesh = null;

        // Trigger UI update
        this.onUpdated.trigger();
      }
    });
  }
}

function Edit() {
  const containerRef = useRef(null);
  const editorRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Prevent double initialization from React.StrictMode
    if (isSceneInitialized) {
      console.log('⚠️ Skipping initialization - already initialized');
      return;
    }
    
    // Set flag immediately to prevent concurrent initialization attempts
    isSceneInitialized = true;

    const container = containerRef.current;
    let isCleaning = false;
    let components;
    let world;
    let fragments;
    let model;
    let generalEditor;
    let panel;
    let button;
    let stats;
    let userIp = null;
    let pollingInterval = null;

    // Fetch user's IP address for tracking
    const getUserIp = async () => {
      try {
        console.log('🔍 Fetching user IP address...');
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        userIp = data.ip;
        console.log('📍 User IP:', userIp);
        return userIp;
      } catch (error) {
        console.warn('⚠️ Could not fetch IP address:', error);
        userIp = 'unknown';
        return userIp;
      }
    };

    // Generate consistent color from user ID string
    const getUserColor = (userId) => {
      if (!userId || userId === 'unknown' || userId === 'Unknown') {
        return '#888888'; // Gray for unknown users
      }
      
      // Simple hash function
      let hash = 0;
      for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash & hash; // Convert to 32bit integer
      }
      
      // Convert hash to HSL color (hue between 0-360)
      const hue = Math.abs(hash % 360);
      const saturation = 65 + (Math.abs(hash) % 20); // 65-85%
      const lightness = 45 + (Math.abs(hash >> 8) % 15); // 45-60%
      
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    };

    const initializeScene = async () => {
      if (isCleaning) {
        console.log('⚠️ Skipping initialization - cleaning in progress');
        return;
      }
      
      try {
        console.log('🚀 Initializing BIM Editor with Supabase integration...');
        
        // Clear container first to remove any existing canvas
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
        
        // Get user IP for tracking
        await getUserIp();
        
        // Create components instance
        components = new OBC.Components();

        // Setup world
        const worlds = components.get(OBC.Worlds);
        world = worlds.create();

        world.scene = new OBC.ShadowedScene(components);
        world.renderer = new OBC.SimpleRenderer(components, container);
        world.camera = new OBC.OrthoPerspectiveCamera(components);

        components.init();

        world.scene.three.add(new THREE.AxesHelper());

        world.camera.three.far = 10000;

        world.renderer.three.shadowMap.enabled = true;
        world.renderer.three.shadowMap.type = THREE.PCFSoftShadowMap;

        world.scene.setup({
          shadows: {
            cascade: 1,
            resolution: 1024,
          },
        });

        await world.scene.updateShadows();

        world.camera.controls.addEventListener("rest", async () => {
          await world.scene.updateShadows();
        });

        // Setup Fragments
        const workerUrl = `${window.location.origin}/worker.mjs`;
        fragments = new FRAGS.FragmentsModels(workerUrl);
        
        world.camera.controls.addEventListener("control", () => fragments.update());

        fragments.models.list.onItemSet.add(({ value: model }) => {
          model.useCamera(world.camera.three);
          world.scene.three.add(model.object);

          model.tiles.onItemSet.add(({ value: mesh }) => {
            if ("isMesh" in mesh) {
              const mat = mesh.material;
              if (mat[0] && mat[0].opacity === 1) {
                mesh.castShadow = true;
                mesh.receiveShadow = true;
              }
            }
          });
        });

        // Load model
        const fetched = await fetch("https://thatopen.github.io/engine_fragment/resources/frags/school_arq.frag");
        const buffer = await fetched.arrayBuffer();
        model = await fragments.load(buffer, {
          modelId: "medium_test",
          camera: world.camera.three,
        });

        world.scene.three.add(model.object);
        await fragments.update(true);

        // Setup editor
        generalEditor = new GeneralEditor(world, model, fragments);
        await generalEditor.init();
        generalEditor.setUserIp(userIp); // Set the user's IP for tracking
        editorRef.current = generalEditor;

        // Store a reference for later panel updates
        window.generalEditorRef = generalEditor;

        // Create history menu
        const historyMenu = document.createElement("div");
        historyMenu.id = "history-menu";

        let selectedRequestIndex = null;

        const updateHistoryMenu = async () => {
          try {
            console.log('📚 Loading edit history from Supabase...');
            const startTime = performance.now();
            
            // Load requests from Supabase instead of local editor
            const { data: dbRequests, error } = await supabase
              .from('edit_requests')
              .select('*')
              .eq('model_id', model.modelId)
              .order('created_at', { ascending: true });

            const duration = (performance.now() - startTime).toFixed(2);

            if (error) {
              console.error('❌ Error loading requests from Supabase:', error);
              console.error('Error details:', {
                message: error.message,
                details: error.details,
                hint: error.hint
              });
              return;
            }

            const allRequests = dbRequests || [];
            console.log(`✅ Loaded ${allRequests.length} requests from database (${duration}ms)`);

            historyMenu.innerHTML = "";

            if (allRequests.length === 0) {
              console.log('📝 No edit history found');
              historyMenu.innerHTML = '<bim-label style="padding: 1rem; opacity: 0.6;">No edits yet</bim-label>';
              return;
            }

            let selectedButton = null;

            for (let i = 0; i < allRequests.length; i++) {
              const dbRequest = allRequests[i];
              const request = dbRequest.request_data; // Extract the actual request object
              const nextExists = i < allRequests.length - 1;

              const requestButton = BUI.Component.create(() => {
                return BUI.html`
                  <bim-button icon="solar:arrow-right-bold"></bim-button>
                `;
              });

              const isSelected = selectedRequestIndex === i;
              const noSelectionAndIsLast = selectedRequestIndex === null && !nextExists;
              if (isSelected || noSelectionAndIsLast) {
                requestButton.classList.add("selected-request");
                selectedButton = requestButton;
              }

              const currentIndex = i;
              requestButton.addEventListener("click", async () => {
                if (selectedButton) {
                  selectedButton.classList.remove("selected-request");
                }
                selectedButton = requestButton;
                requestButton.classList.add("selected-request");
                
                // Apply this specific edit from database
                await fragments.editor.edit(model.modelId, [request]);
                await model.setVisible(undefined, true);
                selectedRequestIndex = currentIndex;
                await fragments.update(true);
              });

              const requestTypeName = FRAGS.EditRequestTypeNames ? 
                FRAGS.EditRequestTypeNames[request.type] : 
                `Type ${request.type}`;

              const timestamp = new Date(dbRequest.created_at).toLocaleTimeString();
              const userIdentifier = dbRequest.user_id || 'Unknown';
              const userColor = getUserColor(userIdentifier);
              
              // Shorten IP addresses for display (e.g., 192.168.1.1 -> ...68.1.1)
              const displayUserId = userIdentifier.length > 12 ? 
                '...' + userIdentifier.slice(-9) : 
                userIdentifier;

              const requestMenu = BUI.Component.create(() => {
                return BUI.html`
                  <div class="history-request">
                    ${nextExists ? BUI.html`<div class="history-line"></div>` : ""}
                    ${requestButton}
                    <div>
                      <bim-label class="history-request-title">${requestTypeName}</bim-label>
                      <bim-label class="history-request-subtitle">ID: ${request.localId}</bim-label>
                      <bim-label class="history-request-subtitle" style="font-size: 0.7rem; opacity: 0.6;">
                        ${timestamp} • <span class="user-badge" style="background-color: ${userColor};">${displayUserId}</span>
                      </bim-label>
                    </div>
                  </div>
                `;
              });

              historyMenu.appendChild(requestMenu);
            }

            selectedRequestIndex = null;
          } catch (error) {
            console.error('Error in updateHistoryMenu:', error);
          }
        };

        // Try real-time subscription, but fall back to polling if it fails
        console.log('🔔 Setting up real-time subscription...');
        console.log('📡 Listening for changes to model:', model.modelId);
        
        let lastCheckTime = new Date().toISOString();
        let isRealtimeWorking = false;
        
        // Polling fallback: check for new edits every 3 seconds
        const startPolling = () => {
          console.log('🔄 Real-time failed, using polling instead (checks every 3s)');
          pollingInterval = setInterval(async () => {
            try {
              const { data: newEdits, error } = await supabase
                .from('edit_requests')
                .select('*')
                .eq('model_id', model.modelId)
                .gt('created_at', lastCheckTime)
                .order('created_at', { ascending: true });

              if (error) {
                console.error('❌ Polling error:', error);
                return;
              }

              if (newEdits && newEdits.length > 0) {
                console.log(`🆕 Found ${newEdits.length} new edits via polling`);
                
                // Apply new edits to the model
                const newRequests = newEdits.map(edit => edit.request_data);
                await fragments.editor.edit(model.modelId, newRequests);
                await fragments.update(true);
                
                // Update last check time
                lastCheckTime = newEdits[newEdits.length - 1].created_at;
                
                // Refresh history
                await updateHistoryMenu();
              }
            } catch (error) {
              console.error('❌ Polling exception:', error);
            }
          }, 3000); // Check every 3 seconds
        };
        
        const realtimeChannel = supabase
          .channel('edit-requests-changes')
          .on(
            'postgres_changes',
            {
              event: '*', // Listen to INSERT, UPDATE, DELETE
              schema: 'public',
              table: 'edit_requests',
              filter: `model_id=eq.${model.modelId}`
            },
            async (payload) => {
              console.log('⚡ Real-time update received!', {
                eventType: payload.eventType,
                timestamp: new Date().toLocaleTimeString()
              });
              console.log('📦 Payload:', payload);
              
              isRealtimeWorking = true;
              
              // When another user makes an edit, update the view
              if (payload.eventType === 'INSERT') {
                console.log('🆕 New edit detected, applying to local view...');
                const newRequest = payload.new.request_data;
                
                // Apply the new request to the local fragments
                await fragments.editor.edit(model.modelId, [newRequest]);
                await fragments.update(true);
                console.log('✅ Local view updated with remote changes');
                
                // Update last check time
                lastCheckTime = payload.new.created_at;
              }
              
              // Refresh the history menu
              await updateHistoryMenu();
            }
          )
          .subscribe((status, err) => {
            console.log('📡 Real-time subscription status:', status);
            if (err) {
              console.error('📦 Error details:', err);
            }
            
            if (status === 'SUBSCRIBED') {
              console.log('✅ Successfully subscribed to real-time updates!');
              console.log('👥 You will now see changes from other users instantly');
              isRealtimeWorking = true;
            } else if (status === 'CHANNEL_ERROR') {
              console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.warn('⚠️ Real-time subscription failed');
              console.warn('🔄 Falling back to polling mode (checks every 3s)');
              console.warn('💡 This still works, but see REALTIME_FIX.md to enable true real-time');
              console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              
              // Start polling as fallback
              startPolling();
            } else if (status === 'TIMED_OUT') {
              console.error('⏱️ Real-time subscription timed out');
              console.log('🔄 Starting polling mode...');
              startPolling();
            } else if (status === 'CLOSED') {
              console.log('🔌 Real-time subscription closed');
              if (!isRealtimeWorking && !pollingInterval) {
                startPolling();
              }
            }
          });

        // Load and apply all existing edits from database
        const loadAndApplyEdits = async () => {
          console.log('🔄 Loading existing edits from database...');
          
          try {
            const { data: dbRequests, error } = await supabase
              .from('edit_requests')
              .select('*')
              .eq('model_id', model.modelId)
              .order('created_at', { ascending: true });

            if (error) {
              console.error('❌ Error loading edits:', error);
              return;
            }

            if (dbRequests && dbRequests.length > 0) {
              console.log(`📥 Found ${dbRequests.length} existing edits, applying to model...`);
              
              // Extract all request_data and apply them in order
              const allRequests = dbRequests.map(dbReq => dbReq.request_data);
              await fragments.editor.edit(model.modelId, allRequests);
              await fragments.update(true);
              
              console.log(`✅ Applied ${allRequests.length} edits to the model`);
            } else {
              console.log('📝 No existing edits found, model in original state');
            }
          } catch (error) {
            console.error('❌ Error in loadAndApplyEdits:', error);
          }
        };

        // Initial load: apply edits first, then update menu
        await loadAndApplyEdits();
        await updateHistoryMenu();

        // Keep local event listener for immediate UI feedback
        fragments.editor.onEdit.add(updateHistoryMenu);

        // Store channel reference for cleanup
        window.supabaseChannel = realtimeChannel;
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 Supabase integration ready!');
        console.log('📝 Features enabled:');
        console.log('   ✓ Real-time collaboration');
        console.log('   ✓ Persistent edit history');
        console.log('   ✓ Multi-user sync');
        console.log('💡 Make an edit and check the console logs');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Create main panel - simplified version
        panel = BUI.Component.create(() => {
          return BUI.html`
            <bim-panel id="controls-panel" active label="Element Editor" class="options-menu" style="position: fixed; top: 1rem; right: 1rem; z-index: 999; min-width: 20rem; max-width: 30rem;">
              <bim-panel-section label="Controls">
                <bim-label>Double-click an element to select it for editing</bim-label>
                <bim-button label="Apply changes" @click=${() => {
                  if (window.generalEditorRef) {
                    window.generalEditorRef.applyChanges();
                  }
                }}></bim-button>
                <bim-dropdown required label="Transform Mode" 
                  @change="${({ target }) => {
                    const selected = target.value[0];
                    if (window.generalEditorRef) {
                      window.generalEditorRef.setControlsMode(selected);
                    }
                  }}">
                  <bim-option checked label="translate"></bim-option>
                  <bim-option label="rotate"></bim-option>
                </bim-dropdown>
                <bim-dropdown required label="Transform Target" 
                  @change="${({ target }) => {
                    const selected = target.value[0];
                    if (window.generalEditorRef) {
                      window.generalEditorRef.setControlsTarget(selected);
                    }
                  }}">
                  <bim-option checked label="global"></bim-option>
                  <bim-option label="local"></bim-option>
                </bim-dropdown>
                <bim-button label="Change to Cube" @click=${() => {
                  if (window.generalEditorRef) {
                    window.generalEditorRef.overrideGeometryWithCube();
                  }
                }}></bim-button>
              </bim-panel-section>
              <bim-panel-section label="History">
                ${historyMenu}
              </bim-panel-section>
            </bim-panel>
          `;
        });

        document.body.append(panel);
        console.log("=== PANEL DEBUG ===");
        console.log("Panel element:", panel);
        console.log("Panel parent:", panel.parentNode);
        console.log("Panel display:", window.getComputedStyle(panel).display);
        console.log("Panel visibility:", window.getComputedStyle(panel).visibility);
        console.log("Panel position:", window.getComputedStyle(panel).position);
        console.log("Panel in DOM:", document.body.contains(panel));
        console.log("All bim-panel elements:", document.querySelectorAll('bim-panel'));
        console.log("===================");

        // Create phone menu button
        button = BUI.Component.create(() => {
          const onClick = () => {
            if (panel.classList.contains("options-menu-visible")) {
              panel.classList.remove("options-menu-visible");
            } else {
              panel.classList.add("options-menu-visible");
            }
          };

          return BUI.html`
            <bim-button class="phone-menu-toggler" icon="solar:settings-bold"
              @click=${onClick}>
            </bim-button>
          `;
        });

        document.body.append(button);
        console.log("Button appended:", button);
        window.dispatchEvent(new Event("resize"));

        // Add Stats.js
        stats = new Stats();
        stats.showPanel(2);
        document.body.append(stats.dom);
        stats.dom.style.left = "0px";
        stats.dom.style.bottom = "0px";
        stats.dom.style.right = "unset";
        stats.dom.style.top = "unset";
        stats.dom.style.zIndex = "100";

        world.renderer.onBeforeUpdate.add(() => stats.begin());
        world.renderer.onAfterUpdate.add(() => stats.end());

      } catch (error) {
        console.error("Error initializing edit scene:", error);
      }
    };

    initializeScene();

    // Cleanup function
    return () => {
      // Skip cleanup if never initialized
      if (!isSceneInitialized) {
        console.log('⏭️ Skipping cleanup - was never initialized');
        return;
      }
      
      console.log('🧹 Cleaning up Edit component...');
      isCleaning = true;
      
      // Unsubscribe from real-time updates
      if (window.supabaseChannel) {
        supabase.removeChannel(window.supabaseChannel);
        window.supabaseChannel = null;
        console.log('🔌 Unsubscribed from real-time updates');
      }
      
      // Stop polling if active
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        console.log('🔌 Stopped polling');
      }
      
      if (components) components.dispose();
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      if (button && button.parentNode) button.parentNode.removeChild(button);
      if (stats && stats.dom.parentNode) stats.dom.parentNode.removeChild(stats.dom);
      
      // Clear the container to remove any canvas elements
      if (container) {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      }
      
      console.log('✅ Cleanup complete');
    };
  }, []);

  return (
    <div className="Edit">
      <div 
        ref={containerRef} 
        id="edit-container" 
        style={{ width: '100%', height: '100vh' }}
      />
    </div>
  );
}

export default Edit;

