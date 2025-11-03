import { useEffect, useRef, useState } from 'react';
import '../App.css';
import './FragmentLibrary.css';
import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as FRAGS from "@thatopen/fragments";
import Stats from "stats.js";
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../common/loadingSpinner';

function FragmentLibrary() {
  const containerRef = useRef(null);
  const componentsRef = useRef(null);
  const fragmentsRef = useRef(null);
  const worldRef = useRef(null);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const statsRef = useRef(null);
  
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
    world.scene.three.background = null;

    world.renderer = new OBC.SimpleRenderer(components, container);
    world.camera = new OBC.SimpleCamera(components);
    world.camera.controls.setLookAt(74, 16, 0.2, 30, -4, 27);

    components.init();

    const grids = components.get(OBC.Grids);
    grids.create(world);

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

    // Cleanup function
    return () => {
      if (componentsRef.current) {
        componentsRef.current.dispose();
      }
      if (panelRef.current && panelRef.current.parentNode) {
        panelRef.current.parentNode.removeChild(panelRef.current);
      }
      if (buttonRef.current && buttonRef.current.parentNode) {
        buttonRef.current.parentNode.removeChild(buttonRef.current);
      }
      if (statsRef.current && statsRef.current.dom.parentNode) {
        statsRef.current.dom.parentNode.removeChild(statsRef.current.dom);
      }
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

      // Decode Base64 back to ArrayBuffer
      const binaryString = atob(fragment.fragment_data);
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

      setLoadedModels(prev => [...prev, { id: fragment.id, name: fragment.name }]);

      console.log('✅ Model loaded into scene:', fragment.name);
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

      await fragmentsRef.current.disposeModel(fragmentId);
      setLoadedModels(prev => prev.filter(m => m.id !== fragmentId));

      console.log('✅ Model removed from scene');
      setIsLoading(false);
    } catch (error) {
      console.error('Error removing model:', error);
      alert('Error removing model: ' + error.message);
      setIsLoading(false);
    }
  };

  const deleteFragmentFromDatabase = async (fragmentId) => {
    if (!window.confirm('Are you sure you want to delete this fragment from the database? This action cannot be undone.')) {
      return;
    }

    try {
      setIsLoading(true);
      setLoadingMessage('Deleting from database...');

      // Remove from scene if loaded
      if (loadedModels.find(m => m.id === fragmentId)) {
        await fragmentsRef.current.disposeModel(fragmentId);
        setLoadedModels(prev => prev.filter(m => m.id !== fragmentId));
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

  const downloadFragment = (fragment) => {
    // Decode Base64 back to Uint8Array
    const binaryString = atob(fragment.fragment_data);
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
        <bim-panel id="controls-panel" active label="Fragment Library 📚" class="options-menu">
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

