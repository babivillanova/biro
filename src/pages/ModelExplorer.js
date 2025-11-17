import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import '../App.css';
import './ModelExplorer.css';
import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as FRAGS from "@thatopen/fragments";
import * as OBF from "@thatopen/components-front";
import Stats from "stats.js";
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../common/loadingSpinner';

function ModelExplorer() {
  const { fragmentId } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const componentsRef = useRef(null);
  const fragmentsRef = useRef(null);
  const fragmentsManagerRef = useRef(null);
  const worldRef = useRef(null);
  const modelRef = useRef(null);
  const gridRef = useRef(null);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const statsRef = useRef(null);
  const localIdRef = useRef(null);
  const updatePanelRef = useRef(null);
  const outlinerRef = useRef(null);
  const highlighterRef = useRef(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [modelName, setModelName] = useState('');
  const [selectedItemName, setSelectedItemName] = useState('');
  const [logs, setLogs] = useState([]);

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
    world.camera.controls.setLookAt(58, 22, -25, 13, 0, 4.2);

    components.init();

    // Enable postproduction (no PEN style, just basic for outliner to work)
    world.renderer.postproduction.enabled = true;

    const grids = components.get(OBC.Grids);
    const grid = grids.create(world);
    gridRef.current = grid;

    // Initialize Fragments Manager (required for Outliner)
    const workerUrl = `${window.location.origin}/worker.mjs`;
    const fragmentsManager = components.get(OBC.FragmentsManager);
    fragmentsManager.init(workerUrl);
    fragmentsManagerRef.current = fragmentsManager;
    
    // Also keep FragmentsModels for our data operations
    const fragments = new FRAGS.FragmentsModels(workerUrl);
    fragmentsRef.current = fragments;

    // Setup camera update for FragmentsManager
    world.onCameraChanged.add((camera) => {
      for (const [, model] of fragmentsManager.list) {
        model.useCamera(camera.three);
      }
      fragmentsManager.core.update(true);
    });

    // Add models to scene when loaded
    fragmentsManager.list.onItemSet.add(({ value: model }) => {
      model.useCamera(world.camera.three);
      world.scene.three.add(model.object);
      fragmentsManager.core.update(true);
    });

    world.camera.controls.addEventListener("rest", () => {
      fragments.update(true);
      fragmentsManager.core.update(true);
    });

    // Setup Outliner
    const outliner = components.get(OBF.Outliner);
    outliner.world = world;
    outliner.color = new THREE.Color(0xff6b00); // Orange outline
    outliner.fillColor = new THREE.Color(0xff6b00); // Orange fill
    outliner.fillOpacity = 0.5;
    outliner.thickness = 3;
    outliner.enabled = true;
    outlinerRef.current = outliner;

    // Setup Highlighter
    components.get(OBC.Raycasters).get(world);
    
    const highlighter = components.get(OBF.Highlighter);
    highlighter.setup({
      world,
      selectMaterialDefinition: null,
    });
    highlighterRef.current = highlighter;

    // Connect Highlighter to Outliner
    highlighter.events.select.onHighlight.add((modelIdMap) => {
      outliner.addItems(modelIdMap);
      console.log('✅ Item highlighted, added to outliner');
    });

    highlighter.events.select.onClear.add((modelIdMap) => {
      outliner.removeItems(modelIdMap);
      console.log('🧹 Highlight cleared, removed from outliner');
    });

    // Stats.js for performance monitoring
    const stats = new Stats();
    stats.showPanel(2);
    document.body.append(stats.dom);
    stats.dom.style.left = "0px";
    stats.dom.style.zIndex = "unset";
    statsRef.current = stats;

    world.renderer.onBeforeUpdate.add(() => stats.begin());
    world.renderer.onAfterUpdate.add(() => stats.end());

    // Setup raycasting
    setupRaycasting(container);

    // Load the model (UI will be created after model loads)
    if (fragmentId) {
      loadModel(fragmentId);
    }

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up ModelExplorer component...');
      
      // Clean outliner
      if (outlinerRef.current) {
        outlinerRef.current.clean();
      }
      
      if (componentsRef.current) {
        componentsRef.current.dispose();
      }
      
      if (panelRef.current && panelRef.current.parentNode) {
        panelRef.current.parentNode.removeChild(panelRef.current);
      }
      
      if (buttonRef.current && buttonRef.current.parentNode) {
        buttonRef.current.parentNode.removeChild(buttonRef.current);
      }
      
      if (statsRef.current && statsRef.current.dom && statsRef.current.dom.parentNode) {
        statsRef.current.dom.parentNode.removeChild(statsRef.current.dom);
      }
      
      console.log('✅ ModelExplorer cleanup complete');
    };
  }, [fragmentId]);

  const loadModel = async (id) => {
    try {
      setIsLoading(true);
      setLoadingMessage('Loading model...');

      // Fetch model metadata and data
      const { data: fragmentData, error } = await supabase
        .from('ifc_fragments')
        .select('name, fragment_data')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!fragmentData) throw new Error('Fragment not found');

      setModelName(fragmentData.name);

      // Decode Base64 back to ArrayBuffer
      const binaryString = atob(fragmentData.fragment_data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Create two separate ArrayBuffers (can't reuse after transfer to worker)
      const arrayBuffer1 = bytes.buffer;
      const arrayBuffer2 = bytes.slice().buffer; // Create a copy

      // Load into FragmentsModels for our data operations (raycasting, queries)
      const model = await fragmentsRef.current.load(arrayBuffer1, { modelId: id });
      model.useCamera(worldRef.current.camera.three);
      worldRef.current.scene.three.add(model.object);
      modelRef.current = model;
      await fragmentsRef.current.update(true);
      
      // Also load into FragmentsManager for Outliner/Highlighter integration
      await fragmentsManagerRef.current.core.load(arrayBuffer2, { modelId: id });
      await fragmentsManagerRef.current.core.update(true);

      console.log('✅ Model loaded successfully');
      
      // Create UI after model is loaded
      await createUI();
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading model:', error);
      alert('Error loading model: ' + error.message);
      setIsLoading(false);
    }
  };

  const setupRaycasting = (container) => {
    container.addEventListener("click", async (event) => {
      if (!modelRef.current || !highlighterRef.current || !fragmentsManagerRef.current) return;

      const mouse = new THREE.Vector2();
      mouse.x = event.clientX;
      mouse.y = event.clientY;
      
      // Raycast on FragmentsModels to get the localId
      const result = await modelRef.current.raycast({
        camera: worldRef.current.camera.three,
        mouse,
        dom: worldRef.current.renderer.three.domElement,
      });

      if (result) {
        localIdRef.current = result.localId;
        console.log('✅ Item selected:', result.localId);
        
        // Create ModelIdMap for Highlighter
        const modelIdMap = {};
        // Get the model UUID from FragmentsManager
        const models = Array.from(fragmentsManagerRef.current.list.values());
        if (models.length > 0) {
          const modelUUID = models[0].uuid;
          modelIdMap[modelUUID] = new Set([result.localId]);
          
          // Use Highlighter to select the item (which triggers Outliner via event)
          await highlighterRef.current.highlight("select", modelIdMap);
        }
        
        // Get name of selected item
        const name = await getName();
        setSelectedItemName(name || 'Unknown');
        
        // Update UI
        if (updatePanelRef.current) {
          updatePanelRef.current();
        }
      } else {
        // Clear selection when clicking empty space
        await highlighterRef.current.clear("select");
        localIdRef.current = null;
        setSelectedItemName('');
        
        // Update UI
        if (updatePanelRef.current) {
          updatePanelRef.current();
        }
        
        console.log('🧹 Selection cleared');
      }
    });
  };

  // Log helper function
  const addLog = (emoji, title, data) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      id: Date.now(),
      timestamp,
      emoji,
      title,
      data: JSON.stringify(data, null, 2)
    };
    setLogs(prev => [logEntry, ...prev]);
    console.log(`${emoji} ${title}:`, data);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  // Data retrieval functions
  const getAttributes = async (attributes) => {
    if (!localIdRef.current || !modelRef.current) return null;
    const [data] = await modelRef.current.getItemsData([localIdRef.current], {
      attributesDefault: !attributes,
      attributes,
    });
    return data;
  };

  const getName = async () => {
    const attributes = await getAttributes(["Name"]);
    const Name = attributes?.Name;
    if (!(Name && "value" in Name)) return null;
    return Name.value;
  };

  const getItemPropertySets = async () => {
    if (!localIdRef.current || !modelRef.current) return null;
    const [data] = await modelRef.current.getItemsData([localIdRef.current], {
      attributesDefault: false,
      attributes: ["Name", "NominalValue"],
      relations: {
        IsDefinedBy: { attributes: true, relations: true },
        DefinesOcurrence: { attributes: false, relations: false },
      },
    });
    return data.IsDefinedBy || [];
  };

  const formatItemPsets = (rawPsets) => {
    const result = {};
    for (const pset of rawPsets) {
      const { Name: psetName, HasProperties } = pset;
      if (!("value" in psetName && Array.isArray(HasProperties))) continue;
      const props = {};
      for (const prop of HasProperties) {
        const { Name, NominalValue } = prop;
        if (!("value" in Name && "value" in NominalValue)) continue;
        const name = Name.value;
        const nominalValue = NominalValue.value;
        if (!(name && nominalValue !== undefined)) continue;
        props[name] = nominalValue;
      }
      result[psetName.value] = props;
    }
    return result;
  };

  const getNamesFromCategory = async (category, unique = false) => {
    if (!modelRef.current) return [];
    const categoryIds = await modelRef.current.getItemsOfCategories([
      new RegExp(`^${category}$`),
    ]);
    const localIds = categoryIds[category];

    const data = await modelRef.current.getItemsData(localIds, {
      attributesDefault: false,
      attributes: ["Name"],
    });

    const names = data
      .map((d) => {
        const { Name } = d;
        if (!(Name && !Array.isArray(Name))) return null;
        return Name.value;
      })
      .filter((name) => name);

    return unique ? [...new Set(names)] : names;
  };

  const getSpatialStructure = async () => {
    if (!modelRef.current) return null;
    const result = await modelRef.current.getSpatialStructure();
    return result;
  };

  const getFirstLevelChildren = async () => {
    if (!modelRef.current) return null;
    const categoryIds = await modelRef.current.getItemsOfCategories([/BUILDINGSTOREY/]);
    const localIds = categoryIds.IFCBUILDINGSTOREY;

    const attributes = await modelRef.current.getItemsData(localIds, {
      attributesDefault: false,
      attributes: ["Name"],
    });

    let firstLevelLocalId = null;

    for (const [index, data] of attributes.entries()) {
      if (!("Name" in data && "value" in data.Name)) continue;
      if (data.Name.value === "01 - Entry Level") {
        firstLevelLocalId = localIds[index];
      }
    }

    if (firstLevelLocalId === null) return null;

    const children = await modelRef.current.getItemsChildren([firstLevelLocalId]);
    return children;
  };

  const getItemGeometry = async () => {
    if (!localIdRef.current || !modelRef.current) return null;
    const [geometryCollection] = await modelRef.current.getItemsGeometry([localIdRef.current]);
    return geometryCollection;
  };

  const getGeometriesFromCategory = async (category) => {
    if (!modelRef.current) return { localIds: [], geometries: [] };
    const items = await modelRef.current.getItemsOfCategories([new RegExp(`^${category}$`)]);

    const localIds = Object.values(items).flat();
    const geometries = await modelRef.current.getItemsGeometry(localIds);
    return { localIds, geometries };
  };

  const createUI = async () => {
    if (!modelRef.current) {
      console.error('❌ Cannot create UI: model not loaded');
      return;
    }

    try {
      const categories = await modelRef.current.getCategories();
      const categoriesDropdown = BUI.Component.create(() => BUI.html`
        <bim-dropdown name="categories">
          ${categories.map(
            (category) => BUI.html`<bim-option label=${category}></bim-option>`,
          )}
        </bim-dropdown>
      `);

      const [panel, updatePanel] = BUI.Component.create((_) => {
        const onLogAttributes = async () => {
          const data = await getAttributes();
          if (!data) return;
          addLog('📋', 'Item Attributes', data);
        };

        const onLogPsets = async () => {
          const data = await getItemPropertySets();
          if (!data) return;
          const panelElement = document.getElementById('controls-panel');
          const checkbox = panelElement?.querySelector('[name="format"]');
          const result = checkbox?.value ? formatItemPsets(data) : data;
          addLog('📦', 'Property Sets', result);
        };

        const onLogGeometry = async ({ target }) => {
          target.loading = true;
          const data = await getItemGeometry();
          if (!data) {
            target.loading = false;
            return;
          }
          target.loading = false;
          addLog('📐', 'Item Geometry', data);
        };

        const onNamesFromCategory = async ({ target }) => {
          const panelElement = document.getElementById('controls-panel');
          const [category] = categoriesDropdown.value;
          if (!category) return;
          target.loading = true;
          const checkbox = panelElement?.querySelector('[name="unique"]');
          const data = await getNamesFromCategory(category, checkbox?.value);
          target.loading = false;
          addLog('📝', `Names from ${category}`, data);
        };

        const onGeometriesFromCategory = async ({ target }) => {
          const [category] = categoriesDropdown.value;
          if (!category) return;
          target.loading = true;
          const { geometries: data } = await getGeometriesFromCategory(category);
          target.loading = false;
          addLog('🔷', `Geometries from ${category}`, data);
        };

        const onLogStructure = async ({ target }) => {
          target.loading = true;
          const result = await getSpatialStructure();
          addLog('🏗️', 'Spatial Structure', result);
          target.loading = false;
        };

        const onLogLevelItems = async ({ target }) => {
          target.loading = true;
          const result = await getFirstLevelChildren();
          if (!result) {
            target.loading = false;
            return;
          }
          const panelElement = document.getElementById('controls-panel');
          const checkbox = panelElement?.querySelector('[name="displayNames"]');
          if (checkbox?.value) {
            const attrs = await modelRef.current.getItemsData(result, {
              attributesDefault: false,
              attributes: ["Name"],
            });
            const names = attrs.map((data) => {
              if (!("Name" in data && "value" in data.Name)) return null;
              return data.Name.value;
            });
            addLog('🏢', 'First Level Items (Names)', names);
          } else {
            addLog('🏢', 'First Level Items (IDs)', result);
          }
          target.loading = false;
        };

        return BUI.html`
          <bim-panel id="controls-panel" active label="Model Information 🗒️" class="options-menu">
            <bim-panel-section fixed label="Info">
              <bim-label style="white-space: normal;">
                💡 Click any element in the viewer to activate the data log options. Logs appear on the right panel.
              </bim-label>
              <bim-label style="white-space: normal; font-weight: bold;">
                📦 Model: ${modelName}
              </bim-label>
            </bim-panel-section>
            
            <bim-panel-section label="Selected Item">
              <bim-label style=${BUI.styleMap({ 
                whiteSpace: "normal", 
                display: !localIdRef.current ? "unset" : "none" 
              })}>
                💡 Click any element in the viewer to select it.
              </bim-label>
              <bim-label style=${BUI.styleMap({ 
                whiteSpace: "normal", 
                display: localIdRef.current ? "unset" : "none",
                fontWeight: "bold",
                color: "#d4af37"
              })}>
                🎯 Selected: ${selectedItemName}
              </bim-label>
              <bim-button ?disabled=${!localIdRef.current} label="Log Attributes" @click=${onLogAttributes}></bim-button>
              <div style="display: flex; gap: 0.5rem">
                <bim-button ?disabled=${!localIdRef.current} label="Log Psets" @click=${onLogPsets}></bim-button>
                <bim-checkbox name="format" label="Format" inverted checked></bim-checkbox>
              </div>
              <bim-button ?disabled=${!localIdRef.current} label="Log Geometry" @click=${onLogGeometry}></bim-button>
            </bim-panel-section>
            
            <bim-panel-section label="Categories">
              ${categoriesDropdown}
              <div style="display: flex; gap: 0.5rem">
                <bim-button label="Log Names" @click=${onNamesFromCategory}></bim-button>
                <bim-checkbox name="unique" label="Unique" inverted></bim-checkbox>
              </div>
              <bim-button label="Log Geometries" @click=${onGeometriesFromCategory}></bim-button>
            </bim-panel-section>
            
            <bim-panel-section label="Spatial Structure">
              <bim-button label="Log Spatial Structure" @click=${onLogStructure}></bim-button>
              <div style="display: flex; gap: 0.5rem">
                <bim-button label="Log First Level Items" @click=${onLogLevelItems}></bim-button>
                <bim-checkbox name="displayNames" label="Names" inverted></bim-checkbox>
              </div>
            </bim-panel-section>
            
            <bim-panel-section label="Navigation">
              <bim-button label="← Back to Library" @click=${() => navigate('/library')}></bim-button>
            </bim-panel-section>
          </bim-panel>
        `;
      }, {});

      updatePanelRef.current = updatePanel;
      document.body.append(panel);
      panelRef.current = panel;

      // Create phone menu button
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
      
      console.log('✅ UI created successfully');
    } catch (error) {
      console.error('❌ Error creating UI:', error);
    }
  };

  return (
    <div className="ModelExplorer">
      {isLoading && <LoadingSpinner message={loadingMessage} />}
      <div 
        ref={containerRef} 
        id="container"
      />
      
      {/* Log Display */}
      <div className="log-display">
        <div className="log-header">
          <h3>📊 Data Logs</h3>
          <button className="clear-logs-btn" onClick={clearLogs}>Clear Logs</button>
        </div>
        <div className="log-content">
          {logs.length === 0 ? (
            <div className="no-logs">No logs yet. Start exploring elements to see data here.</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="log-entry">
                <div className="log-entry-header">
                  <span className="log-title">{log.emoji} {log.title}</span>
                  <span className="log-timestamp">{log.timestamp}</span>
                </div>
                <pre className="log-data">{log.data}</pre>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default ModelExplorer;

