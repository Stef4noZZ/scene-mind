// 'three' resolves via the import map declared in the template; the jsm
// add-ons below also import the bare 'three' specifier, so they share this
// single module instance.
import * as THREE from 'three';
import { GLTFLoader } from './three.js-master/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from './three.js-master/examples/jsm/controls/OrbitControls.js';

const canvas = document.querySelector('.webgl');
const modelNameElement = document.getElementById('model-name');
const modelSelector = document.getElementById('model-selector');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x120818);

// Size the renderer to the canvas's own box, not the whole window — otherwise
// the WebGL buffer overflows the viewer column and the (centered) model ends
// up rendered outside the visible area.
function getViewSize() {
  const parent = canvas.parentElement;
  const width = canvas.clientWidth || (parent ? parent.clientWidth : window.innerWidth);
  const height = canvas.clientHeight || 450;
  return { width: Math.max(width, 1), height: Math.max(height, 1) };
}

const sizes = getViewSize();

const camera = new THREE.PerspectiveCamera(45, sizes.width / sizes.height, 0.1, 1000);
camera.position.set(0, 1.8, 4.5);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false
});
renderer.setSize(sizes.width, sizes.height, false);  // false: keep CSS-driven display size
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

// The backend injects SCENE_MIND_MODELS with absolute static URLs. This
// fallback (used only if that injection is missing) mirrors that format.
const models = window.SCENE_MIND_MODELS || [
  {
    key: 'angelica',
    label: 'Angelica',
    path: '/static/scene/assets/angelica/scene.gltf',
    description: 'The original Angelica 3D model.',
  },
];

const defaultModelKey = window.SCENE_MIND_DEFAULT_MODEL || (models[0] && models[0].key) || 'angelica';
const modelDescriptionElement = document.getElementById('model-description');
const modelPaths = Object.fromEntries(models.map(model => [model.key, model.path]));

let currentModel = null;
const loader = new GLTFLoader();

function createMaleHeadReplacement() {
  const group = new THREE.Group();

  const skinMaterial = new THREE.MeshStandardMaterial({
    color: 0xe6b08a,
    roughness: 0.95,
    metalness: 0.0,
  });
  const hairMaterial = new THREE.MeshStandardMaterial({
    color: 0x1d1617,
    roughness: 0.95,
    metalness: 0.0,
  });
  const eyebrowMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d1d14,
    roughness: 0.95,
    metalness: 0.0,
  });
  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.4,
    metalness: 0.0,
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 28, 24), skinMaterial);
  head.scale.set(1.02, 1.04, 0.95);
  head.position.set(0, 0.02, 0.02);
  group.add(head);

  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.16, 0.30), skinMaterial);
  jaw.position.set(0, -0.17, 0.02);
  group.add(jaw);

  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.34), hairMaterial);
  hairTop.position.set(0, 0.16, 0.01);
  hairTop.scale.set(1.06, 1.12, 1.05);
  group.add(hairTop);

  const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.2, 0.26), hairMaterial);
  hairBack.position.set(0, 0.12, -0.16);
  hairBack.scale.set(1.08, 1.12, 0.85);
  group.add(hairBack);

  const beard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.18), hairMaterial);
  beard.position.set(0, -0.12, 0.12);
  group.add(beard);

  const eyebrowLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.02), eyebrowMaterial);
  eyebrowLeft.position.set(-0.09, 0.05, 0.29);
  group.add(eyebrowLeft);

  const eyebrowRight = eyebrowLeft.clone();
  eyebrowRight.position.x = 0.09;
  group.add(eyebrowRight);

  const eyeLeft = new THREE.Mesh(new THREE.SphereGeometry(0.036, 16, 16), eyeMaterial);
  eyeLeft.position.set(-0.09, 0.01, 0.30);
  group.add(eyeLeft);

  const eyeRight = eyeLeft.clone();
  eyeRight.position.x = 0.09;
  group.add(eyeRight);

  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.12, 16), skinMaterial);
  nose.position.set(0, -0.02, 0.31);
  nose.rotation.x = Math.PI / 2;
  group.add(nose);

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.022, 0.03), new THREE.MeshStandardMaterial({
    color: 0x7a3e3e,
    roughness: 0.95,
    metalness: 0.0,
  }));
  mouth.position.set(0, -0.11, 0.28);
  group.add(mouth);

  group.scale.setScalar(1.15);
  return group;
}

function applyModelCharacterStyle(model, modelKey) {
  if (modelKey !== 'iasonas') {
    return;
  }

  const replacementHead = createMaleHeadReplacement();
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const headAnchor = new THREE.Group();
  headAnchor.position.set(0, size.y * 0.43, 0.02);
  headAnchor.add(replacementHead);
  model.add(headAnchor);

  replacementHead.scale.setScalar(Math.max(size.y * 0.18, 0.65));

  model.updateMatrixWorld(true);
  const modelWorldPos = new THREE.Vector3();
  model.getWorldPosition(modelWorldPos);
  const upperHeadThreshold = modelWorldPos.y + size.y * 0.58;
  const tempVec = new THREE.Vector3();

  model.traverse(object => {
    if (!object.isMesh && !object.isSkinnedMesh) {
      return;
    }

    object.getWorldPosition(tempVec);
    if (tempVec.y > upperHeadThreshold) {
      object.visible = false;
    }
  });

  headAnchor.visible = true;
}

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
  // Tell the chat client which character is active so it can pick a matching
  // (female/male) set of TTS voices.
  window.SCENE_MIND_CURRENT_MODEL = model || null;
  window.dispatchEvent(new CustomEvent('scene-mind:model', {
    detail: { key: modelKey, gender: (model && model.gender) || '' },
  }));
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
      applyModelCharacterStyle(model, modelKey);

      // 1. Normalize the model to a known size regardless of its source units.
      const TARGET_SIZE = 1.8;
      const rawBox = new THREE.Box3().setFromObject(model);
      const rawMax = Math.max(...rawBox.getSize(new THREE.Vector3()).toArray()) || 1;
      model.scale.setScalar(TARGET_SIZE / rawMax);

      // 2. Re-measure after scaling and recenter the model on the origin.
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);

      // 3. Frame the camera to fit the normalized size for the current FOV,
      //    accounting for the canvas aspect ratio, with a little padding.
      const fov = (camera.fov * Math.PI) / 180;
      const fitHeightDist = (size.y / 2) / Math.tan(fov / 2);
      const fitWidthDist = (size.x / 2) / (Math.tan(fov / 2) * camera.aspect);
      const distance = Math.max(fitHeightDist, fitWidthDist) * 1.5 || TARGET_SIZE * 2;

      camera.position.set(distance * 0.2, distance * 0.25, distance);
      camera.near = Math.max(distance / 100, 0.01);
      camera.far = distance * 100;
      camera.updateProjectionMatrix();

      controls.target.set(0, 0, 0);
      controls.minDistance = distance * 0.3;
      controls.maxDistance = distance * 4;
      controls.update();

      // Remember the resting transform so the "speaking" animation can offset
      // from it and restore cleanly when speech stops.
      model.userData.baseY = model.position.y;
      model.userData.baseScale = model.scale.x;

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
  const next = getViewSize();
  sizes.width = next.width;
  sizes.height = next.height;

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

window.addEventListener('resize', resize);

// React to layout changes (column reflow, fonts loading) — not just window resizes.
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(resize).observe(canvas);
}

canvas.addEventListener('dblclick', async () => {
  if (!document.fullscreenElement) {
    await canvas.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
});

// Talking motion while the assistant speaks. window.SCENE_MIND_SPEAKING gates it
// and window.SCENE_MIND_MOUTH (0..1) spikes on each spoken word (from the TTS
// boundary events), giving speech-synced movement. Full viseme lip-sync would
// need morph targets the models don't ship; this approximates it without them.
let mouth = 0; // smoothed openness

function applySpeakingMotion() {
  if (!currentModel || currentModel.userData.baseScale === undefined) return;
  const base = currentModel.userData;

  // Ease the smoothed mouth value toward the latest pulse, then decay it.
  const target = window.SCENE_MIND_MOUTH || 0;
  mouth += (target - mouth) * 0.35;
  window.SCENE_MIND_MOUTH = target * 0.82; // decay the pulse between words

  if (window.SCENE_MIND_SPEAKING) {
    const t = performance.now() / 1000;
    const talk = 0.5 + mouth * 0.5; // amplitude tracks word pulses
    currentModel.position.y = base.baseY + Math.sin(t * 12) * 0.012 * talk;
    currentModel.scale.setScalar(base.baseScale * (1 + (0.010 + mouth * 0.020) * Math.abs(Math.sin(t * 22))));
  } else if (mouth > 0.01) {
    currentModel.scale.setScalar(base.baseScale * (1 + mouth * 0.02));
  } else {
    currentModel.position.y = base.baseY;
    currentModel.scale.setScalar(base.baseScale);
  }
}

function animate() {
  controls.update();
  applySpeakingMotion();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
loadModel(defaultModelKey);
