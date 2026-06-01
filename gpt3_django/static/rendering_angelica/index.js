import * as THREE from './three.js-master/build/three.module.js';
import { GLTFLoader } from './three.js-master/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from './three.js-master/examples/jsm/controls/OrbitControls.js';

const canvas = document.querySelector('.webgl');
const modelNameElement = document.getElementById('model-name');
const modelSelector = document.getElementById('model-selector');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x120818);

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight
};

const camera = new THREE.PerspectiveCamera(45, sizes.width / sizes.height, 0.1, 1000);
camera.position.set(0, 1.8, 4.5);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.physicallyCorrectLights = true;
renderer.setClearColor(0x120818);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1;
controls.maxDistance = 10;
controls.maxPolarAngle = Math.PI * 0.95;
controls.target.set(0, 1, 0);

const lights = {
  hemisphere: new THREE.HemisphereLight(0xddeeff, 0x111122, 0.85),
  directional: new THREE.DirectionalLight(0xffffff, 1.3)
};

lights.directional.position.set(3, 5, 3);
lights.directional.castShadow = true;
lights.directional.shadow.mapSize.set(1024, 1024);
lights.directional.shadow.camera.near = 0.5;
lights.directional.shadow.camera.far = 20;
lights.directional.shadow.camera.left = -4;
lights.directional.shadow.camera.right = 4;
lights.directional.shadow.camera.top = 4;
lights.directional.shadow.camera.bottom = -4;

scene.add(lights.hemisphere, lights.directional);

const gridHelper = new THREE.GridHelper(8, 8, 0x333333, 0x111111);
gridHelper.material.opacity = 0.35;
gridHelper.material.transparent = true;
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(1.5);
scene.add(axesHelper);

const models = window.SCENE_MIND_MODELS || [
  {
    key: 'angelica',
    label: 'Angelica',
    path: './assets/angelica/scene.gltf',
    description: 'The original Angelica 3D model.',
  },
  {
    key: 'fem_head',
    label: 'Fem Head',
    path: './assets/fem_head/scene.gltf',
    description: 'A detailed head model with an expressive face.',
  },
  {
    key: 'fem_face',
    label: 'Fem Face',
    path: './assets/fem_face/scene.gltf',
    description: 'A face study model with refined textures.',
  },
  {
    key: 'wraith',
    label: 'Wraith',
    path: './assets/wraith/gltf/wraith.gltf',
    description: 'A stylized wraith model with atmospheric details.',
  },
];

const defaultModelKey = window.SCENE_MIND_DEFAULT_MODEL || (models[0] && models[0].key) || 'angelica';
const modelDescriptionElement = document.getElementById('model-description');
const modelPaths = Object.fromEntries(models.map(model => [model.key, model.path]));

let currentModel = null;
const loader = new GLTFLoader();

function updateStatus(text) {
  if (modelNameElement) {
    modelNameElement.textContent = text;
  }
}

function updateModelInfo(modelKey) {
  const model = models.find(item => item.key === modelKey);
  if (modelNameElement) {
    modelNameElement.textContent = model ? model.label : modelKey;
  }
  if (modelDescriptionElement) {
    modelDescriptionElement.textContent = model ? model.description : '';
  }
}

function loadModel(modelKey) {
  const modelUrl = modelPaths[modelKey] || modelPaths.angelica;
  const modelInfo = models.find(item => item.key === modelKey) || {};
  updateStatus(`Loading ${modelInfo.label || modelKey}...`);

  if (currentModel) {
    scene.remove(currentModel);
    currentModel.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => mat.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    currentModel = null;
  }

  loader.load(
    modelUrl,
    gltf => {
      const model = gltf.scene || gltf.scenes[0];
      if (!model) {
        console.error('GLTF model has no scene object.');
        updateStatus('Model load error');
        return;
      }

      currentModel = model;
      scene.add(model);

      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z);
      const scale = maxDimension > 0 ? 1.6 / maxDimension : 1;
      model.scale.setScalar(scale);
      model.position.sub(center.multiplyScalar(scale));

      const cameraDistance = Math.max(2.3, maxDimension * 2.1);
      camera.position.set(cameraDistance * 0.25, cameraDistance * 0.8, cameraDistance * 1.2);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, Math.max(size.y, 1) * 0.2, 0);
      controls.update();

      updateModelInfo(modelKey);
    },
    xhr => {
      if (xhr.lengthComputable) {
        console.log(`Loading model: ${((xhr.loaded / xhr.total) * 100).toFixed(1)}%`);
      }
    },
    error => {
      console.error('Model loading error:', error);
      updateStatus(`Failed to load ${modelKey}`);
    }
  );
}

if (modelSelector) {
  modelSelector.addEventListener('change', event => loadModel(event.target.value));
}

function resize() {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

window.addEventListener('resize', resize);

canvas.addEventListener('dblclick', async () => {
  if (!document.fullscreenElement) {
    await canvas.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
});

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
loadModel(defaultModelKey);
