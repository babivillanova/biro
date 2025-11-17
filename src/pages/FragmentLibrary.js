import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';
import './FragmentLibrary.css';
import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as FRAGS from "@thatopen/fragments";
import * as OBF from "@thatopen/components-front";
import Stats from "stats.js";
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../common/loadingSpinner';

function FragmentLibrary() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const componentsRef = useRef(null);
  const fragmentsRef = useRef(null);
  const worldRef = useRef(null);
  const gridRef = useRef(null);
  const panelRef = useRef(null);
  const postProdPanelRef = useRef(null);
  const buttonRef = useRef(null);
  const statsRef = useRef(null);
  const modelOffsetRef = useRef(0); // Track X offset for positioning models side by side
  
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [savedFragments, setSavedFragments] = useState([]);
  const [loadedModels, setLoadedModels] = useState([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    
    // Initialize BUI Manager
    BUI.Manager.init();

    // Setting up the scene
    const components = new OBC.Components();
    componentsRef.current = components;

    const worlds = components.get(OBC.Worlds);
    const world = worlds.create();
    worldRef.current = world;

    world.scene = new OBC.SimpleScene(components);
    world.scene.setup();
    world.scene.three.background = new THREE.Color(0xf0f0f0);

    world.renderer = new OBF.PostproductionRenderer(components, container);
    world.camera = new OBC.OrthoPerspectiveCamera(components);
    world.camera.controls.setLookAt(74, 16, 0.2, 30, -4, 27);

    components.init();

    // Enable postproduction
    world.renderer.postproduction.enabled = true;

    const grids = components.get(OBC.Grids);
    const grid = grids.create(world);
    gridRef.current = grid;

    // Initialize Fragments Manager
    const workerUrl = `${window.location.origin}/worker.mjs`;
    const fragments = new FRAGS.FragmentsModels(workerUrl);
    fragmentsRef.current = fragments;

    world.camera.controls.addEventListener("rest", () => fragments.update(true));

    // Stats.js for performance monitoring
    const stats = new Stats();
    stats.showPanel(2);
    document.body.append(stats.dom);
    stats.dom.style.left = "0px";
    stats.dom.style.zIndex = "unset";
    statsRef.current = stats;

    world.renderer.onBeforeUpdate.add(() => stats.begin());
    world.renderer.onAfterUpdate.add(() => stats.end());

    // Load saved fragments from database
    loadSavedFragments();

    // Create postproduction panel
    createPostproductionPanel(world.renderer, world.scene, grid);

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up FragmentLibrary component...');
      
      if (componentsRef.current) {
        componentsRef.current.dispose();
      }
      
      if (panelRef.current && panelRef.current.parentNode) {
        console.log('🗑️ Removing FragmentLibrary panel');
        panelRef.current.parentNode.removeChild(panelRef.current);
      }

      if (postProdPanelRef.current && postProdPanelRef.current.parentNode) {
        console.log('🗑️ Removing Postproduction panel');
        postProdPanelRef.current.parentNode.removeChild(postProdPanelRef.current);
      }
      
      if (buttonRef.current && buttonRef.current.parentNode) {
        console.log('🗑️ Removing FragmentLibrary button');
        buttonRef.current.parentNode.removeChild(buttonRef.current);
      }
      
      if (statsRef.current && statsRef.current.dom && statsRef.current.dom.parentNode) {
        console.log('🗑️ Removing FragmentLibrary stats');
        statsRef.current.dom.parentNode.removeChild(statsRef.current.dom);
      }
      
      console.log('✅ FragmentLibrary cleanup complete');
    };
  }, []);

  const loadSavedFragments = async () => {
    try {
      setIsLoading(true);
      setLoadingMessage('Loading fragments from database...');

      // Only select metadata, not the large fragment_data blob
      const { data, error } = await supabase
        .from('ifc_fragments')
        .select('id, name, file_size, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setSavedFragments(data || []);
      console.log(`✅ Loaded ${data?.length || 0} fragments from database`);
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading fragments:', error);
      alert('Error loading fragments from database: ' + error.message);
      setIsLoading(false);
    }
  };

  const loadFragmentToScene = async (fragment) => {
    try {
      setIsLoading(true);
      setLoadingMessage(`Loading ${fragment.name} into scene...`);

      // Check if already loaded
      if (loadedModels.find(m => m.id === fragment.id)) {
        alert('This model is already loaded in the scene!');
        setIsLoading(false);
        return;
      }

      // Fetch the fragment data (only fetch when needed)
      const { data: fragmentData, error } = await supabase
        .from('ifc_fragments')
        .select('fragment_data')
        .eq('id', fragment.id)
        .single();

      if (error) throw error;
      if (!fragmentData) throw new Error('Fragment data not found');

      // Decode Base64 back to ArrayBuffer
      const binaryString = atob(fragmentData.fragment_data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const arrayBuffer = bytes.buffer;

      // Load into fragments manager
      const model = await fragmentsRef.current.load(arrayBuffer, { modelId: fragment.id });
      model.useCamera(worldRef.current.camera.three);
      worldRef.current.scene.three.add(model.object);
      await fragmentsRef.current.update(true);

      // Calculate bounding box to position model side by side
      const box = new THREE.Box3();
      box.setFromObject(model.object);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      // Position the model at the current offset
      // Move it so its left edge is at the offset position
      const offsetX = modelOffsetRef.current - center.x + (size.x / 2);
      model.object.position.x = offsetX;

      // Update offset for next model (add current model width + spacing)
      const spacing = 5; // Space between models
      modelOffsetRef.current += size.x + spacing;

      setLoadedModels(prev => [...prev, { 
        id: fragment.id, 
        name: fragment.name,
        position: offsetX,
        size: size.x 
      }]);

      console.log('✅ Model loaded into scene:', fragment.name, 'at X offset:', offsetX);
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading fragment to scene:', error);
      alert('Error loading fragment: ' + error.message);
      setIsLoading(false);
    }
  };

  const removeFragmentFromScene = async (fragmentId) => {
    try {
      setIsLoading(true);
      setLoadingMessage('Removing model from scene...');

      const modelToRemove = loadedModels.find(m => m.id === fragmentId);
      await fragmentsRef.current.disposeModel(fragmentId);
      
      // Update the list of loaded models
      const updatedModels = loadedModels.filter(m => m.id !== fragmentId);
      setLoadedModels(updatedModels);

      // Recalculate positions for remaining models
      if (modelToRemove && updatedModels.length > 0) {
        repositionModels(updatedModels);
      } else if (updatedModels.length === 0) {
        // Reset offset if no models left
        modelOffsetRef.current = 0;
      }

      console.log('✅ Model removed from scene');
      setIsLoading(false);
    } catch (error) {
      console.error('Error removing model:', error);
      alert('Error removing model: ' + error.message);
      setIsLoading(false);
    }
  };

  const repositionModels = (models) => {
    // Reposition all models side by side from the beginning
    let currentOffset = 0;
    const spacing = 5;

    models.forEach((modelInfo) => {
      const model = fragmentsRef.current.list.get(modelInfo.id);
      if (model && model.object) {
        // Calculate bounding box
        const box = new THREE.Box3();
        box.setFromObject(model.object);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        // Position the model
        const offsetX = currentOffset - center.x + (size.x / 2);
        model.object.position.x = offsetX;

        // Update offset for next model
        currentOffset += size.x + spacing;

        // Update model info
        modelInfo.position = offsetX;
        modelInfo.size = size.x;
      }
    });

    // Update the total offset for the next new model
    modelOffsetRef.current = currentOffset;
  };

  const deleteFragmentFromDatabase = async (fragmentId) => {
    if (!window.confirm('Are you sure you want to delete this fragment from the database? This action cannot be undone.')) {
      return;
    }

    try {
      setIsLoading(true);
      setLoadingMessage('Deleting from database...');

      // Remove from scene if loaded
      const modelToRemove = loadedModels.find(m => m.id === fragmentId);
      if (modelToRemove) {
        await fragmentsRef.current.disposeModel(fragmentId);
        const updatedModels = loadedModels.filter(m => m.id !== fragmentId);
        setLoadedModels(updatedModels);
        
        // Reposition remaining models
        if (updatedModels.length > 0) {
          repositionModels(updatedModels);
        } else {
          modelOffsetRef.current = 0;
        }
      }

      // Delete from database
      const { error } = await supabase
        .from('ifc_fragments')
        .delete()
        .eq('id', fragmentId);

      if (error) throw error;

      // Refresh the list
      await loadSavedFragments();

      console.log('✅ Fragment deleted from database');
      setIsLoading(false);
    } catch (error) {
      console.error('Error deleting fragment:', error);
      alert('Error deleting fragment: ' + error.message);
      setIsLoading(false);
    }
  };

  const downloadFragment = async (fragment) => {
    try {
      setIsLoading(true);
      setLoadingMessage(`Downloading ${fragment.name}...`);

      // Fetch the fragment data
      const { data: fragmentData, error } = await supabase
        .from('ifc_fragments')
        .select('fragment_data')
        .eq('id', fragment.id)
        .single();

      if (error) throw error;
      if (!fragmentData) throw new Error('Fragment data not found');

      // Decode Base64 back to Uint8Array
      const binaryString = atob(fragmentData.fragment_data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const file = new File([bytes], `${fragment.name}.frag`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(a.href);

      setIsLoading(false);
    } catch (error) {
      console.error('Error downloading fragment:', error);
      alert('Error downloading fragment: ' + error.message);
      setIsLoading(false);
    }
  };

  const clearAllModels = async () => {
    if (!window.confirm('Remove all models from the scene?')) {
      return;
    }

    try {
      setIsLoading(true);
      setLoadingMessage('Clearing all models...');

      for (const model of loadedModels) {
        await fragmentsRef.current.disposeModel(model.id);
      }

      setLoadedModels([]);
      modelOffsetRef.current = 0; // Reset offset
      console.log('✅ All models cleared from scene');
      setIsLoading(false);
    } catch (error) {
      console.error('Error clearing models:', error);
      alert('Error clearing models: ' + error.message);
      setIsLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const startEditing = (fragmentId) => {
    navigate(`/edit/${fragmentId}`);
  };

  const exploreModel = (fragmentId) => {
    navigate(`/explore/${fragmentId}`);
  };

  const createPostproductionPanel = (renderer, scene, grid) => {
    const { aoPass, outlinePass, edgesPass } = renderer.postproduction;

    const aoParameters = {
      radius: 0.25,
      distanceExponent: 1,
      thickness: 1,
      scale: 1,
      samples: 16,
      distanceFallOff: 1,
      screenSpaceRadius: true,
    };

    const pdParameters = {
      lumaPhi: 10,
      depthPhi: 2,
      normalPhi: 3,
      radius: 4,
      radiusExponent: 1,
      rings: 2,
      samples: 16,
    };

    aoPass.updateGtaoMaterial(aoParameters);
    aoPass.updatePdMaterial(pdParameters);

    const postProdPanel = BUI.Component.create(() => {
      return BUI.html`
      <bim-panel id="postproduction-panel" active label="Viewer Style 🎨" class="postproduction-menu">

        <bim-panel-section label="General" collapsed>

          <bim-checkbox checked label="Postproduction enabled"
            @change="${({ target }) => {
              renderer.postproduction.enabled = target.value;
            }}">
          </bim-checkbox>

          <bim-color-input label="Background color"
            color="#${scene.three.background.getHexString()}"
            @input="${({ target }) => {
              scene.three.background.set(target.value.color);
            }}">
          </bim-color-input>

          <bim-checkbox checked label="Show grid"
            @change="${({ target }) => {
              grid.three.visible = target.value;
            }}">
          </bim-checkbox>

          <bim-checkbox label="Outlines enabled"
            ?checked=${renderer.postproduction.outlinesEnabled}
            @change="${({ target }) => {
              renderer.postproduction.outlinesEnabled = target.value;
            }}">
          </bim-checkbox>

          <bim-dropdown required label="Postproduction style"
            @change="${({ target }) => {
              const result = target.value[0];
              renderer.postproduction.style = result;
            }}">

            <bim-option checked label="Basic" value="${OBF.PostproductionAspect.COLOR}"></bim-option>
            <bim-option label="Pen" value="${OBF.PostproductionAspect.PEN}"></bim-option>
            <bim-option label="Shadowed Pen" value="${OBF.PostproductionAspect.PEN_SHADOWS}"></bim-option>
            <bim-option label="Color Pen" value="${OBF.PostproductionAspect.COLOR_PEN}"></bim-option>
            <bim-option label="Color Shadows" value="${OBF.PostproductionAspect.COLOR_SHADOWS}"></bim-option>
            <bim-option label="Color Pen Shadows" value="${OBF.PostproductionAspect.COLOR_PEN_SHADOWS}"></bim-option>
          </bim-dropdown>

        </bim-panel-section>

        <bim-panel-section label="Edges" collapsed>

          <bim-number-input
              slider step="0.1" label="Width"
              value="${renderer.postproduction.edgesPass.width}" min="1" max="3"
              @change="${({ target }) => {
                renderer.postproduction.edgesPass.width = target.value;
              }}">
          </bim-number-input>

          <bim-color-input label="Edges color"
            color="#${edgesPass.color.getHexString()}"
            @input="${({ target }) => {
              edgesPass.color.set(target.value.color);
            }}">
          </bim-color-input>

        </bim-panel-section>

        <bim-panel-section label="Outline" collapsed>

          <bim-number-input
              slider step="0.1" label="Outline thickness"
              value="${outlinePass.thickness}" min="1" max="10"
              @change="${({ target }) => {
                outlinePass.thickness = target.value;
              }}">
          </bim-number-input>

          <bim-number-input
              slider step="0.01" label="Fill opacity"
              value="${outlinePass.fillOpacity}" min="0" max="1"
              @change="${({ target }) => {
                outlinePass.fillOpacity = target.value;
              }}">
          </bim-number-input>

          <bim-color-input label="Line color"
            color="#${outlinePass.outlineColor.getHexString()}"
            @input="${({ target }) => {
              outlinePass.outlineColor.set(target.value.color);
            }}">
          </bim-color-input>

          <bim-color-input label="Fill color"
            color="#${outlinePass.fillColor.getHexString()}"
            @input="${({ target }) => {
              outlinePass.fillColor.set(target.value.color);
            }}">
          </bim-color-input>

        </bim-panel-section>

        <bim-panel-section label="Ambient Occlusion" collapsed>

            <bim-checkbox checked label="Screen Space Radius"
              ?checked=${aoParameters.screenSpaceRadius}
              @change="${({ target }) => {
                aoParameters.screenSpaceRadius = target.value;
                aoPass.updateGtaoMaterial(aoParameters);
              }}">
            </bim-checkbox>

            <bim-number-input
              slider step="0.01" label="Blend intensity"
              value="${aoPass.blendIntensity}" min="0" max="1"
              @change="${({ target }) => {
                aoPass.blendIntensity = target.value;
              }}">
            </bim-number-input>

            <bim-number-input
              slider step="0.01" label="Radius"
              value="${aoParameters.radius}" min="0.01" max="1"
              @change="${({ target }) => {
                aoParameters.radius = target.value;
                aoPass.updateGtaoMaterial(aoParameters);
              }}">
            </bim-number-input>

            <bim-number-input
              slider step="0.01" label="Distance exponent"
              value="${aoParameters.distanceExponent}" min="1" max="4"
              @change="${({ target }) => {
                aoParameters.distanceExponent = target.value;
                aoPass.updateGtaoMaterial(aoParameters);
              }}">
            </bim-number-input>

            <bim-number-input
              slider step="0.01" label="Thickness"
              value="${aoParameters.thickness}" min="0.01" max="10"
              @change="${({ target }) => {
                aoParameters.thickness = target.value;
                aoPass.updateGtaoMaterial(aoParameters);
              }}">
            </bim-number-input>

            <bim-number-input
              slider step="0.01" label="Distance falloff"
              value="${aoParameters.distanceFallOff}" min="0" max="1"
              @change="${({ target }) => {
                aoParameters.distanceFallOff = target.value;
                aoPass.updateGtaoMaterial(aoParameters);
              }}">
            </bim-number-input>

            <bim-number-input
              slider step="0.01" label="Scale"
              value="${aoParameters.scale}" min="0.01" max="2"
              @change="${({ target }) => {
                aoParameters.scale = target.value;
                aoPass.updateGtaoMaterial(aoParameters);
              }}">
            </bim-number-input>

            <bim-number-input
              slider step="1" label="Samples"
              value="${aoParameters.samples}" min="2" max="32"
              @change="${({ target }) => {
                aoParameters.samples = target.value;
                aoPass.updateGtaoMaterial(aoParameters);
              }}">
            </bim-number-input>

            <bim-number-input
              slider step="0.1" label="PD Luma Phi"
              value="${pdParameters.lumaPhi}" min="0" max="20"
              @change="${({ target }) => {
                pdParameters.lumaPhi = target.value;
                aoPass.updatePdMaterial(pdParameters);
              }}">
            </bim-number-input>

            <bim-number-input
              slider step="0.1" label="PD Depth Phi"
              value="${pdParameters.depthPhi}" min="0.01" max="20"
              @change="${({ target }) => {
                pdParameters.depthPhi = target.value;
                aoPass.updatePdMaterial(pdParameters);
              }}">
            </bim-number-input>

            <bim-number-input
              slider step="0.1" label="PD Normal Phi"
              value="${pdParameters.normalPhi}" min="0.01" max="20"
              @change="${({ target }) => {
                pdParameters.normalPhi = target.value;
                aoPass.updatePdMaterial(pdParameters);
              }}">
            </bim-number-input>

            <bim-number-input
              slider step="1" label="PD Radius"
              value="${pdParameters.radius}" min="0" max="32"
              @change="${({ target }) => {
                pdParameters.radius = target.value;
                aoPass.updatePdMaterial(pdParameters);
              }}">
            </bim-number-input>

            <bim-number-input
              slider step="0.1" label="PD Radius Exponent"
              value="${pdParameters.radiusExponent}" min="0.1" max="4"
              @change="${({ target }) => {
                pdParameters.radiusExponent = target.value;
                aoPass.updatePdMaterial(pdParameters);
              }}">
            </bim-number-input>

            <bim-number-input
              slider step="0.125" label="PD Rings"
              value="${pdParameters.rings}" min="1" max="16"
              @change="${({ target }) => {
                pdParameters.rings = target.value;
                aoPass.updatePdMaterial(pdParameters);
              }}">
            </bim-number-input>

            <bim-number-input
              slider step="1" label="PD Samples"
              value="${pdParameters.samples}" min="2" max="32"
              @change="${({ target }) => {
                pdParameters.samples = target.value;
                aoPass.updatePdMaterial(pdParameters);
              }}">
            </bim-number-input>

          </bim-panel-section>

        </bim-panel>
        `;
    });

    document.body.append(postProdPanel);
    postProdPanelRef.current = postProdPanel;
  };

  // Create/update UI based on current state
  useEffect(() => {
    if (!componentsRef.current) return;

    // Remove old panel if exists
    if (panelRef.current && panelRef.current.parentNode) {
      panelRef.current.parentNode.removeChild(panelRef.current);
      panelRef.current = null;
    }

    // Create new panel with current state
    const panel = BUI.Component.create(() => {
      const fragmentItems = savedFragments.map(fragment => {
        const isLoaded = loadedModels.find(m => m.id === fragment.id);
        
        return BUI.html`
          <div class="fragment-item">
            <div class="fragment-info">
              <strong>${fragment.name}</strong>
              <div class="fragment-meta">
                <span>📦 ${formatFileSize(fragment.file_size)}</span>
                <span>📅 ${formatDate(fragment.created_at)}</span>
              </div>
            </div>
            <div class="fragment-actions">
              ${isLoaded 
                ? BUI.html`<bim-button label="Unload" @click=${() => removeFragmentFromScene(fragment.id)}></bim-button>`
                : BUI.html`<bim-button label="Load" @click=${() => loadFragmentToScene(fragment)}></bim-button>`
              }
              <bim-button label="Explore Model" @click=${() => exploreModel(fragment.id)}></bim-button>
              <bim-button label="Start Editing" @click=${() => startEditing(fragment.id)}></bim-button>
              <bim-button label="Download" @click=${() => downloadFragment(fragment)}></bim-button>
              <bim-button label="Delete" @click=${() => deleteFragmentFromDatabase(fragment.id)}></bim-button>
            </div>
          </div>
        `;
      });

      const content = savedFragments.length > 0 
        ? BUI.html`
            <bim-label style="white-space: normal;">
              📚 ${savedFragments.length} fragment(s) in library | ${loadedModels.length} loaded in scene
            </bim-label>
            ${loadedModels.length > 0 ? BUI.html`
              <bim-button label="Clear All Models" @click=${clearAllModels}></bim-button>
            ` : ''}
            <bim-button label="Refresh List" @click=${loadSavedFragments}></bim-button>
            <div class="fragment-list">
              ${fragmentItems}
            </div>
          `
        : BUI.html`
            <bim-label style="white-space: normal;">
              📂 No fragments saved yet. Go to the IFC Importer page to convert and save IFC files.
            </bim-label>
            <bim-button label="Refresh List" @click=${loadSavedFragments}></bim-button>
          `;

      return BUI.html`
        <bim-panel id="fragment-library-panel" active label="Fragment Library 📚" class="options-menu">
          <bim-panel-section label="Saved Fragments">
            ${content}
          </bim-panel-section>
        </bim-panel>
      `;
    });

    document.body.append(panel);
    panelRef.current = panel;

    // Create phone menu button only once
    if (!buttonRef.current) {
      const button = BUI.Component.create(() => {
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
      buttonRef.current = button;
    }
  }, [savedFragments, loadedModels]);

  return (
    <div className="FragmentLibrary">
      {isLoading && <LoadingSpinner message={loadingMessage} />}
      <div 
        ref={containerRef} 
        id="container" 
        style={{ width: '100%', height: '100vh' }}
      />
    </div>
  );
}

export default FragmentLibrary;

