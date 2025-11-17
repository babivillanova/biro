import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';
import './StressTest.css';
import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as FRAGS from "@thatopen/fragments";
import * as OBF from "@thatopen/components-front";
import Stats from "stats.js";
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../common/loadingSpinner';

function StressTest() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const componentsRef = useRef(null);
  const fragmentsRef = useRef(null);
  const worldRef = useRef(null);
  const gridRef = useRef(null);
  const panelRef = useRef(null);
  const statsRef = useRef(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [savedFragments, setSavedFragments] = useState([]);
  const [selectedFragment, setSelectedFragment] = useState(null);
  const [instanceCount, setInstanceCount] = useState(1);
  const [currentInstances, setCurrentInstances] = useState(0);
  const [modelData, setModelData] = useState(null);

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
    world.scene.three.background = new THREE.Color(0x202020);

    world.renderer = new OBF.PostproductionRenderer(components, container);
    world.camera = new OBC.OrthoPerspectiveCamera(components);
    world.camera.controls.setLookAt(50, 50, 50, 0, 0, 0);

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
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb
    document.body.append(stats.dom);
    stats.dom.style.left = "0px";
    stats.dom.style.top = "0px";
    stats.dom.style.zIndex = "unset";
    statsRef.current = stats;

    world.renderer.onBeforeUpdate.add(() => stats.begin());
    world.renderer.onAfterUpdate.add(() => stats.end());

    // Load saved fragments from database
    loadSavedFragments();

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up StressTest component...');
      
      if (componentsRef.current) {
        componentsRef.current.dispose();
      }
      
      if (panelRef.current && panelRef.current.parentNode) {
        console.log('🗑️ Removing StressTest panel');
        panelRef.current.parentNode.removeChild(panelRef.current);
      }
      
      if (statsRef.current && statsRef.current.dom && statsRef.current.dom.parentNode) {
        console.log('🗑️ Removing StressTest stats');
        statsRef.current.dom.parentNode.removeChild(statsRef.current.dom);
      }
      
      console.log('✅ StressTest cleanup complete');
    };
  }, []);

  const loadSavedFragments = async () => {
    try {
      setIsLoading(true);
      setLoadingMessage('Loading fragments from database...');

      const { data, error } = await supabase
        .from('ifc_fragments')
        .select('*')
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

  const loadFragmentData = async (fragment) => {
    try {
      setIsLoading(true);
      setLoadingMessage(`Loading ${fragment.name} data...`);

      // Decode Base64 back to ArrayBuffer
      const binaryString = atob(fragment.fragment_data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const arrayBuffer = bytes.buffer;

      setModelData({ 
        arrayBuffer, 
        name: fragment.name,
        id: fragment.id 
      });
      setSelectedFragment(fragment);
      
      console.log('✅ Fragment data loaded:', fragment.name);
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading fragment data:', error);
      alert('Error loading fragment: ' + error.message);
      setIsLoading(false);
    }
  };

  const clearScene = async () => {
    try {
      setIsLoading(true);
      setLoadingMessage('Clearing scene...');

      const modelIds = Array.from(fragmentsRef.current.list.keys());
      for (const modelId of modelIds) {
        await fragmentsRef.current.disposeModel(modelId);
      }

      setCurrentInstances(0);
      console.log('✅ Scene cleared');
      setIsLoading(false);
    } catch (error) {
      console.error('Error clearing scene:', error);
      alert('Error clearing scene: ' + error.message);
      setIsLoading(false);
    }
  };

  const applyInstances = async () => {
    if (!modelData) {
      alert('Please select a model first!');
      return;
    }

    try {
      setIsLoading(true);
      setLoadingMessage(`Adding ${instanceCount} instances to scene...`);

      // Clear existing instances
      await clearScene();

      const spacing = 5; // Space between models
      let currentOffset = 0;

      // Load instances side by side
      for (let i = 0; i < instanceCount; i++) {
        // Load the model
        const modelId = `${modelData.id}_instance_${i}`;
        const model = await fragmentsRef.current.load(modelData.arrayBuffer, { modelId });
        model.useCamera(worldRef.current.camera.three);
        worldRef.current.scene.three.add(model.object);

        // Calculate bounding box to position model side by side
        const box = new THREE.Box3();
        box.setFromObject(model.object);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        // Position the model at the current offset
        // Move it so its left edge is at the offset position
        const offsetX = currentOffset - center.x + (size.x / 2);
        model.object.position.x = offsetX;

        // Update offset for next model (add current model width + spacing)
        currentOffset += size.x + spacing;
      }

      await fragmentsRef.current.update(true);
      setCurrentInstances(instanceCount);

      console.log(`✅ Added ${instanceCount} instances to scene in a row`);
      setIsLoading(false);
    } catch (error) {
      console.error('Error adding instances:', error);
      alert('Error adding instances: ' + error.message);
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

  // Create/update UI panel
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
        const isSelected = selectedFragment?.id === fragment.id;
        
        return BUI.html`
          <div class="fragment-item ${isSelected ? 'selected' : ''}">
            <div class="fragment-info">
              <strong>${fragment.name}</strong>
              <div class="fragment-meta">
                <span>📦 ${formatFileSize(fragment.file_size)}</span>
              </div>
            </div>
            <div class="fragment-actions">
              <bim-button 
                label="${isSelected ? '✓ Selected' : 'Select'}" 
                @click=${() => loadFragmentData(fragment)}
              ></bim-button>
            </div>
          </div>
        `;
      });

      const content = savedFragments.length > 0 
        ? BUI.html`
            <bim-label style="white-space: normal;">
              📚 Select a model for stress testing
            </bim-label>
            
            ${selectedFragment ? BUI.html`
              <div class="selected-model-info">
                <bim-label style="white-space: normal; font-weight: bold;">
                  Selected: ${selectedFragment.name}
                </bim-label>
              </div>

              <bim-number-input
                slider
                label="Instance Count"
                value="${instanceCount}"
                min="1"
                max="500"
                step="1"
                @change="${({ target }) => {
                  setInstanceCount(target.value);
                }}">
              </bim-number-input>

              <bim-label style="white-space: normal; font-size: 12px; color: #666;">
                Current instances in scene: ${currentInstances}
              </bim-label>

              <div class="action-buttons">
                <bim-button 
                  label="Apply (${instanceCount} instances)" 
                  @click=${applyInstances}
                ></bim-button>
                <bim-button 
                  label="Clear Scene" 
                  @click=${clearScene}
                ></bim-button>
              </div>

              <bim-label style="white-space: normal; font-size: 11px; color: #999; margin-top: 10px;">
                💡 Tip: Watch the FPS counter in the top-left corner to see performance impact.
              </bim-label>
            ` : ''}

            <div class="fragment-list">
              ${fragmentItems}
            </div>
          `
        : BUI.html`
            <bim-label style="white-space: normal;">
              📂 No fragments saved yet. Go to the IFC Importer page to convert and save IFC files.
            </bim-label>
            <bim-button 
              label="Go to IFC Importer" 
              @click=${() => navigate('/ifc-importer')}
            ></bim-button>
          `;

      return BUI.html`
        <bim-panel id="stress-test-panel" active label="Stress Test 🔥" class="options-menu">
          <bim-panel-section label="Model Selection & Controls">
            ${content}
          </bim-panel-section>
        </bim-panel>
      `;
    });

    document.body.append(panel);
    panelRef.current = panel;
  }, [savedFragments, selectedFragment, instanceCount, currentInstances]);

  return (
    <div className="StressTest">
      {isLoading && <LoadingSpinner message={loadingMessage} />}
      <div 
        ref={containerRef} 
        id="container" 
        style={{ width: '100%', height: '100vh' }}
      />
    </div>
  );
}

export default StressTest;

