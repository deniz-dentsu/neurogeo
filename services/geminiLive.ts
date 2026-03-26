import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from "@google/genai";
import { GeometryType, VisualParams } from "../types";

// Helper for Base64 encoding
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Function Declaration for the "Visual Control" tool
const updateVisualsFunction: FunctionDeclaration = {
  name: 'updateVisuals',
  description: 'Update the visualizer parameters based on hand gestures and environment.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      geometry: {
        type: Type.STRING,
        enum: Object.values(GeometryType),
        description: 'The geometric shape to render. Open palm = ICOSPHERE, Fist = CUBE, etc.',
      },
      detail: {
        type: Type.NUMBER,
        description: 'Mesh complexity level (0 to 5).',
      },
      wireframe: {
        type: Type.BOOLEAN,
        description: 'Whether to show wireframe mode.',
      },
      rotationSpeed: {
        type: Type.NUMBER,
        description: 'Speed of rotation (0 to 5).',
      },
      colorHex: {
        type: Type.STRING,
        description: 'Hex color code for the material.',
      },
      distortionFactor: {
        type: Type.NUMBER,
        description: 'How much the mesh distorts to audio (0.0 to 2.0).',
      },
      statusMessage: {
        type: Type.STRING,
        description: 'A short technical status message describing what you see (e.g. "Hand Detected: Open Palm").',
      }
    },
    required: ['geometry', 'detail', 'rotationSpeed', 'colorHex', 'statusMessage'],
  },
};

export class GeminiLiveService {
  private client: GoogleGenAI;
  private session: any = null;
  private onUpdate: (params: Partial<VisualParams>, message: string) => void;

  constructor(apiKey: string, onUpdate: (params: Partial<VisualParams>, message: string) => void) {
    this.client = new GoogleGenAI({ apiKey });
    this.onUpdate = onUpdate;
  }

  async connect() {
    const config = {
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      callbacks: {
        onopen: () => {
          console.log('[Gemini] Session Opened');
        },
        onmessage: (message: LiveServerMessage) => {
          this.handleMessage(message);
        },
        onclose: () => {
          console.log('[Gemini] Session Closed');
        },
        onerror: (e: any) => {
          console.error('[Gemini] Error:', e);
        }
      },
      config: {
        responseModalities: [Modality.AUDIO], // We mostly want tool calls, but audio is required
        tools: [{ functionDeclarations: [updateVisualsFunction] }],
        systemInstruction: `
          You are the core logic of a "TouchDesigner" style audio-visualizer. 
          Your input is a video stream of a user.
          Analyze the user's hand gestures to control the visual parameters:
          
          1. **Geometry**: 
             - Closed Fist -> CUBE
             - Open Palm / Spread Fingers -> ICOSPHERE
             - Peace Sign (V) -> TORUS
             - 1 Finger -> TETRAHEDRON
          
          2. **Complexity (Detail)**:
             - Closer to camera -> Lower detail
             - Further from camera -> Higher detail
          
          3. **Rotation Speed**:
             - Fast hand movement -> Fast rotation
             - Still hand -> Slow rotation
             
          4. **Color**:
             - Change color based on the position of the hand in the frame (Left=Cool colors, Right=Warm colors).
             
          Call the 'updateVisuals' tool frequently (every 1-2 seconds) to reflect changes. 
          Be precise and responsive.
        `,
      }
    };

    this.session = await this.client.live.connect(config);
  }

  async sendVideoFrame(base64Data: string) {
    if (!this.session) return;
    
    // Clean base64 string if it has the prefix
    const data = base64Data.replace(/^data:image\/(png|jpeg);base64,/, "");

    try {
      await this.session.sendRealtimeInput({
        video: {
          mimeType: 'image/jpeg',
          data: data
        }
      });
    } catch (e) {
      console.error("Error sending frame", e);
    }
  }

  private handleMessage(message: LiveServerMessage) {
    // Check for Tool Calls
    if (message.toolCall) {
      for (const fc of message.toolCall.functionCalls) {
        if (fc.name === 'updateVisuals') {
          const args = fc.args as any;
          this.onUpdate(args, args.statusMessage || "Updating...");
          
          // Must send response back
          this.session.sendToolResponse({
            functionResponses: [{
              id: fc.id,
              name: fc.name,
              response: { result: "ok" }
            }]
          });
        }
      }
    }
  }

  disconnect() {
    // There is no explicit disconnect on the session object in the current SDK version shown in docs,
    // usually we just stop sending data or let it timeout, but if close exists:
    // @ts-ignore
    if (this.session && typeof this.session.close === 'function') {
      // @ts-ignore
      this.session.close();
    }
    this.session = null;
  }
}
