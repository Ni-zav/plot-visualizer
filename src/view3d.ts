import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { padBounds, polygonCentroid, projectBounds } from "./geometry";
import type { PlotProject, PlotStatus } from "./types";

const STATUS_COLORS: Record<PlotStatus, number> = {
  available: 0x6fc49a,
  reserved: 0xe8bd55,
  booked: 0xd88a57,
  sold: 0x8c94a0,
};

export class Plot3DView {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly plotMeshes: THREE.Mesh[] = [];
  private readonly contentGroup = new THREE.Group();
  private readonly resizeObserver: ResizeObserver;
  private animationFrame = 0;
  private pointerDown?: { x: number; y: number };

  constructor(
    private readonly container: HTMLElement,
    private readonly onSelect: (plotId: string) => void,
  ) {
    this.scene.background = new THREE.Color(0xf2f3ef);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.replaceChildren(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 600;

    const ambient = new THREE.HemisphereLight(0xffffff, 0xa7aa9d, 2.5);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 3.4);
    sun.position.set(40, 80, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(sun);

    this.scene.add(this.contentGroup);

    this.renderer.domElement.addEventListener("pointerdown", (event) => {
      this.pointerDown = { x: event.clientX, y: event.clientY };
    });

    this.renderer.domElement.addEventListener("pointerup", (event) => {
      if (!this.pointerDown) return;
      const distance = Math.hypot(
        event.clientX - this.pointerDown.x,
        event.clientY - this.pointerDown.y,
      );
      this.pointerDown = undefined;
      if (distance > 5) return;
      this.pick(event);
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.animate();
  }

  render(
    project: PlotProject,
    selectedPlotId: string | undefined,
    visibleStatuses: Set<PlotStatus>,
  ): void {
    this.clearContent();

    const bounds = padBounds(projectBounds(project), 0.12);
    const width = Math.max(bounds.maxX - bounds.minX, 10);
    const depth = Math.max(bounds.maxY - bounds.minY, 10);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(width + 12, 0.35, depth + 12),
      new THREE.MeshStandardMaterial({
        color: 0xd9dbd3,
        roughness: 1,
        metalness: 0,
      }),
    );
    ground.position.set(centerX, -0.22, -centerY);
    ground.receiveShadow = true;
    this.contentGroup.add(ground);

    const roadWidth = 10;
    if (depth >= 35) {
      const road = new THREE.Mesh(
        new THREE.BoxGeometry(width + 6, 0.08, roadWidth),
        new THREE.MeshStandardMaterial({
          color: 0x6e7477,
          roughness: 0.95,
          metalness: 0,
        }),
      );
      road.position.set(centerX, 0.01, -25);
      road.receiveShadow = true;
      this.contentGroup.add(road);
    }

    for (const plot of project.plots) {
      if (!visibleStatuses.has(plot.status) || plot.polygon.length < 3) continue;

      const shape = new THREE.Shape();
      plot.polygon.forEach((point, index) => {
        if (index === 0) shape.moveTo(point.x, point.y);
        else shape.lineTo(point.x, point.y);
      });
      shape.closePath();

      const height = Math.max(plot.extrusionM ?? 0.5, 0.08);
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: height,
        bevelEnabled: false,
        steps: 1,
        curveSegments: 1,
      });
      geometry.computeVertexNormals();

      const isSelected = plot.id === selectedPlotId;
      const material = new THREE.MeshStandardMaterial({
        color: isSelected ? 0x6596ff : STATUS_COLORS[plot.status],
        roughness: 0.78,
        metalness: 0,
        emissive: isSelected ? 0x122247 : 0x000000,
        emissiveIntensity: isSelected ? 0.35 : 0,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.plotId = plot.id;

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0x293037 }),
      );
      mesh.add(edges);

      this.contentGroup.add(mesh);
      this.plotMeshes.push(mesh);

      const centroid = polygonCentroid(plot.polygon);
      const label = this.createLabel(plot.label, isSelected);
      label.position.set(centroid.x, height + 0.7, -centroid.y);
      this.contentGroup.add(label);
    }

    const span = Math.max(width, depth);
    this.controls.target.set(centerX, 0, -centerY);
    this.camera.position.set(
      centerX + span * 0.65,
      Math.max(span * 0.9, 28),
      -centerY + span * 0.95,
    );
    this.camera.near = Math.max(span / 1000, 0.05);
    this.camera.far = Math.max(span * 30, 1000);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private clearContent(): void {
    this.plotMeshes.splice(0, this.plotMeshes.length);

    while (this.contentGroup.children.length > 0) {
      const object = this.contentGroup.children.pop();
      if (!object) continue;
      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose?.();
        if (material instanceof THREE.SpriteMaterial) {
          material.map?.dispose();
        }
      });
    }
  }

  private createLabel(text: string, selected: boolean): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return new THREE.Sprite();

    const scale = 2;
    canvas.width = 160 * scale;
    canvas.height = 58 * scale;
    context.scale(scale, scale);
    context.fillStyle = selected ? "#172345" : "#ffffff";
    context.strokeStyle = "#2f353a";
    context.lineWidth = 1.5;
    context.beginPath();
    context.roundRect(4, 4, 152, 50, 10);
    context.fill();
    context.stroke();
    context.fillStyle = selected ? "#ffffff" : "#1f2529";
    context.font = "700 20px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 80, 29);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(8, 2.9, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  private pick(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hit = this.raycaster.intersectObjects(this.plotMeshes, false)[0];
    const plotId = hit?.object.userData.plotId as string | undefined;
    if (plotId) this.onSelect(plotId);
  }

  private resize(): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private animate = (): void => {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.animate);
  };
}
