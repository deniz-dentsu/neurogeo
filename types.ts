export enum GeometryType {
  CUBE = 'CUBE',
  ICOSPHERE = 'ICOSPHERE',
  TORUS = 'TORUS',
  TETRAHEDRON = 'TETRAHEDRON',
  KNOT = 'KNOT',
  OCTAHEDRON = 'OCTAHEDRON'
}

export interface VisualParams {
  geometry: GeometryType;
  detail: number; // 0-5
  wireframe: boolean;
  rotationSpeed: number; // 0-10
  colorHex: string;
  metalness: number; // 0-1
  roughness: number; // 0-1
  distortionFactor: number; // 0-2 (How much audio affects it)
}

export interface SystemStatus {
  isConnected: boolean;
  isStreaming: boolean;
  audioActive: boolean;
  fps: number;
  lastInstruction: string;
}
