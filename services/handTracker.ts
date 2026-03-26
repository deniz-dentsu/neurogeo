import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';

export class HandTracker {
  private handLandmarker: HandLandmarker | null = null;
  private isInitialized = false;

  async initialize() {
    if (this.isInitialized) return;
    
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    
    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 2
    });
    
    this.isInitialized = true;
  }

  detect(video: HTMLVideoElement, timestamp: number): HandLandmarkerResult | null {
    if (!this.handLandmarker || !this.isInitialized) return null;
    return this.handLandmarker.detectForVideo(video, timestamp);
  }

  cleanup() {
    if (this.handLandmarker) {
      this.handLandmarker.close();
      this.handLandmarker = null;
    }
    this.isInitialized = false;
  }
}
