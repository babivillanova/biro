import { useEffect, useRef, useState } from 'react';
import '../App.css';
import './IfcImporter.css';
import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as FRAGS from "@thatopen/fragments";
import Stats from "stats.js";
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../common/loadingSpinner';

function IfcImporter() {
  const containerRef = useRef(null);
  const componentsRef = useRef(null);
  const fragmentsRef = useRef(null);
  const serializerRef = useRef(null);
  const worldRef = useRef(null);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const statsRef = useRef(null);
  
  const [fragmentBytes, setFragmentBytes] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [modelName, setModelName] = useState('');
  const [currentModelId, setCurrentModelId] = useState(null);

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

    // Initialize IFC Serializer
    const serializer = new FRAGS.IfcImporter();
    serializer.wasm = { absolute: true, path: "https://unpkg.com/web-ifc@0.0.72/" };
    serializerRef.current = serializer;

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

  const convertIFC = async (file) => {
    try {
      setIsLoading(true);
      setLoadingMessage('Converting IFC to Fragments...');
      
      const arrayBuffer = await file.arrayBuffer();
      const ifcBytes = new Uint8Array(arrayBuffer);
      
      const fragmentData = await serializerRef.current.process({
        bytes: ifcBytes,
        progressCallback: (progress, data) => {
          console.log(`Conversion progress: ${progress}%`, data);
          setLoadingMessage(`Converting IFC to Fragments... ${Math.round(progress)}%`);
        },
      });

      setFragmentBytes(fragmentData);
      setModelName(file.name.replace('.ifc', ''));
      
      console.log('✅ IFC conversion completed');
      setIsLoading(false);
      updateUI();
    } catch (error) {
      console.error('Error converting IFC:', error);
      alert('Error converting IFC file: ' + error.message);
      setIsLoading(false);
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      convertIFC(file);
    }
  };

  const loadModel = async () => {
    if (!fragmentBytes) return;

    try {
      setIsLoading(true);
      setLoadingMessage('Loading model into scene...');

      const modelId = `model_${Date.now()}`;
      setCurrentModelId(modelId);

      const model = await fragmentsRef.current.load(fragmentBytes, { modelId });
      model.useCamera(worldRef.current.camera.three);
      worldRef.current.scene.three.add(model.object);
      await fragmentsRef.current.update(true);

      console.log('✅ Model loaded into scene');
      setIsLoading(false);
      updateUI();
    } catch (error) {
      console.error('Error loading model:', error);
      alert('Error loading model: ' + error.message);
      setIsLoading(false);
    }
  };

  const removeModel = async () => {
    if (!currentModelId) return;

    try {
      setIsLoading(true);
      setLoadingMessage('Removing model from scene...');

      await fragmentsRef.current.disposeModel(currentModelId);
      setCurrentModelId(null);

      console.log('✅ Model removed from scene');
      setIsLoading(false);
      updateUI();
    } catch (error) {
      console.error('Error removing model:', error);
      alert('Error removing model: ' + error.message);
      setIsLoading(false);
    }
  };

  const saveToDatabase = async () => {
    if (!fragmentBytes) return;

    try {
      setIsLoading(true);
      setLoadingMessage('Saving to database...');

      // Convert ArrayBuffer to Base64 for storage
      const base64Data = btoa(
        new Uint8Array(fragmentBytes).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ''
        )
      );

      // Prepare the data to save
      const fragmentData = {
        name: modelName || 'Untitled Model',
        fragment_data: base64Data,
        file_size: fragmentBytes.byteLength,
        created_at: new Date().toISOString(),
      };

      // Insert into Supabase
      const { data, error } = await supabase
        .from('ifc_fragments')
        .insert([fragmentData])
        .select();

      if (error) throw error;

      console.log('✅ Fragment saved to database:', data);
      alert('Fragment successfully saved to database!');
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error saving to database:', error);
      alert('Error saving to database: ' + error.message);
      setIsLoading(false);
    }
  };

  const downloadFragments = () => {
    if (!fragmentBytes) return;

    const file = new File([fragmentBytes], `${modelName || 'sample'}.frag`);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const updateUI = () => {
    // Force re-render of UI components
    if (panelRef.current && panelRef.current.parentNode) {
      panelRef.current.parentNode.removeChild(panelRef.current);
    }
    createUI();
  };

  const createUI = () => {
    const panel = BUI.Component.create(() => {
      let content;

      if (!fragmentBytes) {
        content = BUI.html`
          <bim-label style="white-space: normal;">💡 Select an IFC file to convert it to Fragments</bim-label>
          <bim-label style="white-space: normal; font-size: 12px; color: #666;">
            Open the browser console to see detailed conversion progress
          </bim-label>
          <div class="file-upload-container">
            <input 
              type="file" 
              id="ifc-file-input" 
              accept=".ifc" 
              style="display: none;"
              @change=${handleFileUpload}
            />
            <bim-button 
              label="Select IFC File" 
              @click=${() => document.getElementById('ifc-file-input').click()}
            ></bim-button>
          </div>
        `;
      } else {
        content = BUI.html`
          <bim-label style="white-space: normal;">🚀 IFC converted to Fragments! Choose an action:</bim-label>
          <bim-label style="white-space: normal; font-size: 12px; color: #666;">
            Model: ${modelName || 'Untitled'} | Size: ${(fragmentBytes.byteLength / 1024 / 1024).toFixed(2)} MB
          </bim-label>
          <bim-button label="Add Model to Scene" @click=${loadModel}></bim-button>
          ${currentModelId ? BUI.html`<bim-button label="Remove Model" @click=${removeModel}></bim-button>` : ''}
          <bim-button label="Save to Database" @click=${saveToDatabase}></bim-button>
          <bim-button label="Download Fragments" @click=${downloadFragments}></bim-button>
          <bim-button 
            label="Convert Another IFC" 
            @click=${() => {
              setFragmentBytes(null);
              setModelName('');
              setCurrentModelId(null);
              updateUI();
            }}
          ></bim-button>
        `;
      }

      return BUI.html`
        <bim-panel id="controls-panel" active label="IFC Importer 😀" class="options-menu">
          <bim-panel-section label="Controls">
            ${content}
          </bim-panel-section>
        </bim-panel>
      `;
    });

    document.body.append(panel);
    panelRef.current = panel;

    // Create phone menu button
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
  };

  useEffect(() => {
    if (componentsRef.current) {
      createUI();
    }
  }, [fragmentBytes, currentModelId]);

  return (
    <div className="IfcImporter">
      {isLoading && <LoadingSpinner message={loadingMessage} />}
      <div 
        ref={containerRef} 
        id="container" 
        style={{ width: '100%', height: '100vh' }}
      />
    </div>
  );
}

export default IfcImporter;

