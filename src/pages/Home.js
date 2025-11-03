import { useEffect, useRef } from 'react';
import '../App.css';
import * as THREE from "three";
import Stats from "stats.js";
import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";

function Home() {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    
    // Creating a components instance
    const components = new OBC.Components();

    // Setting up the world
    const worlds = components.get(OBC.Worlds);

    const world = worlds.create();

    world.scene = new OBC.SimpleScene(components);
    world.renderer = new OBC.SimpleRenderer(components, container);
    world.camera = new OBC.SimpleCamera(components);

    components.init();

    // Setup the scene
    world.scene.setup();

    // Make the background transparent
    world.scene.three.background = null;

    // Initialize and load everything asynchronously
    const initializeScene = async () => {
      try {
        // Initialize fragments manager - await the initialization
        const fragments = components.get(OBC.FragmentsManager);
        
        // Use local worker to avoid CORS issues
        const workerUrl = `${window.location.origin}/worker.mjs`;
        await fragments.init(workerUrl);

        world.camera.controls.addEventListener("rest", () => {
          fragments.core.update(true);
        });

        fragments.list.onItemSet.add(({ value: model }) => {
          model.useCamera(world.camera.three);
          world.scene.three.add(model.object);
          fragments.core.update(true);
        });

        // Load fragments
        const fragPaths = ["https://thatopen.github.io/engine_components/resources/frags/school_arq.frag"];

        await Promise.all(
          fragPaths.map(async (path) => {
            const modelId = path.split("/").pop()?.split(".").shift();
            if (!modelId) return null;

            const file = await fetch(path);
            const buffer = await file.arrayBuffer();
            return fragments.core.load(buffer, { modelId });
          })
        );

        // Set camera position
        await world.camera.controls.setLookAt(68, 23, -8.5, 21.5, -5.5, 23);
        await fragments.core.update(true);
      } catch (error) {
        console.error("Error initializing scene:", error);
      }
    };

    initializeScene();

    // Create panel
    const panel = BUI.Component.create(() => {
      return BUI.html`
        <bim-panel label="Worlds Tutorial" class="options-menu">
          <bim-panel-section label="Controls">
          
            <bim-color-input 
              label="Background Color" color="#202932" 
              @input="${({ target }) => {
                world.scene.config.backgroundColor = new THREE.Color(target.color);
              }}">
            </bim-color-input>
            
            <bim-number-input 
              slider step="0.1" label="Directional lights intensity" value="1.5" min="0.1" max="10"
              @change="${({ target }) => {
                world.scene.config.directionalLight.intensity = target.value;
              }}">
            </bim-number-input>
            
            <bim-number-input 
              slider step="0.1" label="Ambient light intensity" value="1" min="0.1" max="5"
              @change="${({ target }) => {
                world.scene.config.ambientLight.intensity = target.value;
              }}">
            </bim-number-input>
            
          </bim-panel-section>
        </bim-panel>
      `;
    });

    document.body.append(panel);

    // Create phone menu button
    const button = BUI.Component.create(() => {
      return BUI.html`
        <bim-button class="phone-menu-toggler" icon="solar:settings-bold"
          @click="${() => {
            if (panel.classList.contains("options-menu-visible")) {
              panel.classList.remove("options-menu-visible");
            } else {
              panel.classList.add("options-menu-visible");
            }
          }}">
        </bim-button>
      `;
    });

    document.body.append(button);

    // Add Stats.js for performance monitoring
    const stats = new Stats();
    stats.showPanel(2);
    document.body.append(stats.dom);
    stats.dom.style.left = "0px";
    stats.dom.style.zIndex = "unset";

    world.renderer.onBeforeUpdate.add(() => stats.begin());
    world.renderer.onAfterUpdate.add(() => stats.end());

    // Cleanup function
    return () => {
      components.dispose();
      if (panel.parentNode) panel.parentNode.removeChild(panel);
      if (button.parentNode) button.parentNode.removeChild(button);
      if (stats.dom.parentNode) stats.dom.parentNode.removeChild(stats.dom);
    };
  }, []);

  return (
    <div className="Home">
      <div 
        ref={containerRef} 
        id="container" 
        style={{ width: '100%', height: '100vh' }}
      />
    </div>
  );
}

export default Home;

