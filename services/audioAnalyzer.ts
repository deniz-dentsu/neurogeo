export class AudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  async initialize(stream: MediaStream): Promise<void> {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256; // Balance between resolution and performance
    this.source = this.audioContext.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    
    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);
  }

  getFrequencyData(): number {
    if (!this.analyser || !this.dataArray) return 0;
    
    this.analyser.getByteFrequencyData(this.dataArray);
    
    // Calculate average volume/energy
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    return sum / this.dataArray.length; // 0 - 255
  }

  getBassEnergy(): number {
    if (!this.analyser || !this.dataArray) return 0;
    this.analyser.getByteFrequencyData(this.dataArray);
    // Simple bass extraction (first few bins)
    return this.dataArray[0] || 0;
  }

  resume() {
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  cleanup() {
    this.analyser?.disconnect();
    this.source?.disconnect();
    this.audioContext?.close();
  }
}