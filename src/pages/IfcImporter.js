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
  const [useAlternativeMethod, setUseAlternativeMethod] = useState(false);
  const ifcLoaderRef = useRef(null);

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

    // Initialize IFC Serializer (Method 1: Basic fragments)
    const serializer = new FRAGS.IfcImporter();
    serializer.wasm = { absolute: true, path: "https://unpkg.com/web-ifc@0.0.72/" };
    serializerRef.current = serializer;

    // Initialize IFC Loader (Method 2: Full IFC data - experimental)
    const initIfcLoader = async () => {
      try {
        const ifcLoader = components.get(OBC.IfcLoader);
        await ifcLoader.setup();
        ifcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = true;
        ifcLoader.settings.webIfc.OPTIMIZE_PROFILES = true;
        ifcLoaderRef.current = ifcLoader;
        console.log('✅ IfcLoader initialized (alternative method available)');
      } catch (error) {
        console.log('⚠️ IfcLoader not available:', error.message);
      }
    };
    initIfcLoader();

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
      console.log('🧹 Cleaning up IfcImporter component...');
      
      if (componentsRef.current) {
        componentsRef.current.dispose();
      }
      
      if (panelRef.current && panelRef.current.parentNode) {
        console.log('🗑️ Removing IfcImporter panel');
        panelRef.current.parentNode.removeChild(panelRef.current);
      }
      
      if (buttonRef.current && buttonRef.current.parentNode) {
        console.log('🗑️ Removing IfcImporter button');
        buttonRef.current.parentNode.removeChild(buttonRef.current);
      }
      
      if (statsRef.current && statsRef.current.dom && statsRef.current.dom.parentNode) {
        console.log('🗑️ Removing IfcImporter stats');
        statsRef.current.dom.parentNode.removeChild(statsRef.current.dom);
      }
      
      console.log('✅ IfcImporter cleanup complete');
    };
  }, []);

  const convertIFC = async (file, isUrl = false) => {
    try {
      setIsLoading(true);
      setLoadingMessage('Converting IFC to Fragments...');
      
      let arrayBuffer;
      let fileName;
      
      if (isUrl) {
        console.log('📥 Fetching IFC from URL:', file);
        const response = await fetch(file);
        arrayBuffer = await response.arrayBuffer();
        fileName = file.split('/').pop().replace('.ifc', '');
      } else {
        arrayBuffer = await file.arrayBuffer();
        fileName = file.name.replace('.ifc', '');
      }
      
      const ifcBytes = new Uint8Array(arrayBuffer);
      
      console.log('📊 IFC file size:', (arrayBuffer.byteLength / 1024 / 1024).toFixed(2), 'MB');
      
      if (useAlternativeMethod && ifcLoaderRef.current) {
        console.log('🔧 Using IfcLoader (Method 2: Full IFC data preservation)');
        setLoadingMessage('Converting with IfcLoader (preserving IFC metadata)...');
        
        try {
          // Load IFC with IfcLoader (preserves more metadata)
          const model = await ifcLoaderRef.current.load(ifcBytes);
          
          // Export to fragments
          const fragmentsManager = componentsRef.current.get(OBC.FragmentsManager);
          const fragmentData = await fragmentsManager.export(model);
          
          console.log('📦 Fragment data generated with IfcLoader:', {
            size: (fragmentData.byteLength / 1024 / 1024).toFixed(2) + ' MB',
            hasMetadata: true
          });
          
          setFragmentBytes(fragmentData);
          setModelName(fileName + '_full');
          
          console.log('✅ IFC conversion completed with FULL metadata');
          console.log('💡 This fragment should support editing features');
        } catch (loaderError) {
          console.error('❌ IfcLoader method failed:', loaderError);
          console.log('⚠️ Falling back to IfcImporter method...');
          setUseAlternativeMethod(false);
          throw loaderError;
        }
      } else {
        console.log('🔧 Using IfcImporter (Method 1: Basic fragments)');
        setLoadingMessage('Converting IFC to Fragments...');
        
        const fragmentData = await serializerRef.current.process({
          bytes: ifcBytes,
          progressCallback: (progress, data) => {
            console.log(`Conversion progress: ${progress}%`, data);
            setLoadingMessage(`Converting IFC to Fragments... ${Math.round(progress)}%`);
          },
        });

        console.log('📦 Fragment data generated:', {
          size: (fragmentData.byteLength / 1024 / 1024).toFixed(2) + ' MB',
          type: fragmentData.constructor.name
        });

        setFragmentBytes(fragmentData);
        setModelName(fileName);
        
        console.log('✅ IFC conversion completed');
        console.log('⚠️ NOTE: Fragments created with IfcImporter contain geometry only.');
        console.log('💡 For full editing capabilities, IFC metadata (profiles, transforms) must be preserved.');
        console.log('📖 See FRAGMENT_EDITING_LIMITATIONS.md for details.');
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error converting IFC:', error);
      alert('Error converting IFC file: ' + error.message);
      setIsLoading(false);
    }
  };

  const testTutorialSample = async () => {
    const tutorialUrl = "https://thatopen.github.io/engine_fragment/resources/ifc/school_str.ifc";
    await convertIFC(tutorialUrl, true);
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

  // Create/update UI based on current state - moved outside useEffect to access current state
  useEffect(() => {
    if (!componentsRef.current) return;

    // Remove old panel if exists
    if (panelRef.current && panelRef.current.parentNode) {
      panelRef.current.parentNode.removeChild(panelRef.current);
      panelRef.current = null;
    }

    // Create new panel with current state
    const panel = BUI.Component.create(() => {
      let content;

      if (!fragmentBytes) {
        content = BUI.html`
          <bim-label style="white-space: normal;">💡 Select an IFC file to convert it to Fragments</bim-label>
          <bim-label style="white-space: normal; font-size: 12px; color: #666;">
            Open the browser console to see detailed conversion progress
          </bim-label>
          
          <bim-label style="white-space: normal; font-size: 11px; color: #ff9800; margin-top: 10px;">
            ⚠️ Note: IfcImporter creates basic fragments (geometry only). For editing support, try the alternative method below.
          </bim-label>
          
          <div style="margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px;">
            <bim-label style="white-space: normal; font-size: 12px; font-weight: bold;">Conversion Method:</bim-label>
            <div style="margin-top: 5px;">
              <label style="display: flex; align-items: center; cursor: pointer;">
                <input 
                  type="radio" 
                  name="method" 
                  value="basic"
                  checked=${!useAlternativeMethod}
                  @change=${() => setUseAlternativeMethod(false)}
                  style="margin-right: 8px;"
                />
                <span style="font-size: 12px;">Method 1: IfcImporter (Tutorial method - basic fragments)</span>
              </label>
              <label style="display: flex; align-items: center; cursor: pointer; margin-top: 5px;">
                <input 
                  type="radio" 
                  name="method" 
                  value="full"
                  checked=${useAlternativeMethod}
                  @change=${() => setUseAlternativeMethod(true)}
                  style="margin-right: 8px;"
                />
                <span style="font-size: 12px;">Method 2: IfcLoader (Experimental - preserves metadata)</span>
              </label>
            </div>
          </div>
          
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
            <bim-button 
              label="Test Tutorial Sample" 
              @click=${testTutorialSample}
              style="margin-top: 10px;"
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
            }}
          ></bim-button>
        `;
      }

      return BUI.html`
        <bim-panel id="ifc-importer-panel" active label="IFC Importer 😀" class="options-menu">
          <bim-panel-section label="Controls">
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
  }, [fragmentBytes, currentModelId, modelName, useAlternativeMethod]);

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

