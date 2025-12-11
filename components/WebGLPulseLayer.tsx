
import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { ChatMessage } from '../types';

interface WebGLPulseLayerProps {
  lastNewMessage: ChatMessage | null;
}

const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER_SOURCE = `
  precision mediump float;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform int u_pulseCount;
  uniform vec4 u_pulses[32]; // x, y, startTime, duration
  uniform float u_zoomRadius; // Dynamic radius based on zoom level

  void main() {
    vec2 st = gl_FragCoord.xy; // pixel coordinates
    vec3 color = vec3(0.0);
    
    for (int i = 0; i < 32; i++) {
      if (i >= u_pulseCount) break;
      
      vec4 p = u_pulses[i];
      vec2 center = p.xy;
      float startTime = p.z;
      float duration = p.w;
      
      float t = (u_time - startTime) / duration;
      
      if (t >= 0.0 && t <= 1.0) {
         // Current radius grows from 0 to u_zoomRadius
         float maxRadius = u_zoomRadius;
         float currentRadius = mix(0.0, maxRadius, t);
         
         float dist = distance(st, center);
         
         // Soft ring logic
         // Make the ring thickness proportional to radius but capped
         // Decreased factor to 0.2 for slightly sharper rings at size
         float edge = max(2.0, maxRadius * 0.2); 
         
         // Outer Fade: 1.0 at (radius - edge) -> 0.0 at (radius)
         // Correct GLSL: smoothstep(min, max, value)
         float outer = 1.0 - smoothstep(currentRadius - edge, currentRadius, dist);
         
         // Inner Fade: 0.0 at (radius - edge*2) -> 1.0 at (radius - edge)
         // Creates the hole in the center
         float inner = smoothstep(currentRadius - edge * 2.5, currentRadius - edge * 0.5, dist);
         
         // Fade out over time
         float alpha = 1.0 - t;
         // Non-linear fade for punchier start
         alpha = pow(alpha, 0.5);
         
         // Kaiku Blue: 0.3, 0.65, 1.0
         // Accumulate color
         // Increased intensity to 1.0
         color += vec3(0.2, 0.8, 1.0) * outer * inner * alpha * 1.0; 
      }
    }
    
    // Simple transparency handling: if color is black, alpha is 0
    float alpha = max(color.r, max(color.g, color.b));
    // Clamp alpha to prevent weird blending artifacts
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

const MAX_PULSES = 32;

const WebGLPulseLayer: React.FC<WebGLPulseLayerProps> = ({ lastNewMessage }) => {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  // Initialize with empty array, but type it correctly
  const pulsesRef = useRef<{ lat: number; lng: number; startTime: number; duration: number }[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // 1. Setup Canvas
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute'; // Absolute within the map pane
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '900'; // Above map tiles/overlay pane
    
    const mapContainer = map.getContainer();
    mapContainer.appendChild(canvas);
    canvasRef.current = canvas;

    // 2. Setup WebGL
    // PremultipliedAlpha: false allows manual alpha control in shader
    const gl = canvas.getContext('webgl', { alpha: true, depth: false, antialias: true, premultipliedAlpha: false });
    if (!gl) {
        console.error("WebGL 1 not supported");
        return;
    }
    glRef.current = gl;

    // Enable Blending for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // 3. Compile Shaders
    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertShader = createShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fragShader = createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vertShader || !fragShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);
    programRef.current = program;

    // 4. Setup Buffers (Full Screen Quad)
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // 5. Cleanup
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (canvasRef.current && mapContainer.contains(canvasRef.current)) {
        mapContainer.removeChild(canvasRef.current);
      }
    };
  }, [map]);

  // Handle New Pulses
  useEffect(() => {
    if (lastNewMessage) {
      if (pulsesRef.current.length >= MAX_PULSES) {
        pulsesRef.current.shift(); // Remove oldest
      }

      // PRIVACY ENFORCEMENT: Snap to Grid (approx 1.1km precision)
      // This ensures the pulse appears at the general area center, not exact user location.
      const snappedLat = Math.round(lastNewMessage.location.lat * 100) / 100;
      const snappedLng = Math.round(lastNewMessage.location.lng * 100) / 100;

      pulsesRef.current.push({
        lat: snappedLat,
        lng: snappedLng,
        startTime: performance.now() / 1000,
        duration: 2.5 // Increased duration for smoother ripple
      });
    }
  }, [lastNewMessage]);

  // Render Loop
  useEffect(() => {
    const gl = glRef.current;
    const program = programRef.current;
    const canvas = canvasRef.current;
    if (!gl || !program || !canvas) return;

    const uResolutionLoc = gl.getUniformLocation(program, "u_resolution");
    const uTimeLoc = gl.getUniformLocation(program, "u_time");
    const uPulseCountLoc = gl.getUniformLocation(program, "u_pulseCount");
    const uPulsesLoc = gl.getUniformLocation(program, "u_pulses");
    const uZoomRadiusLoc = gl.getUniformLocation(program, "u_zoomRadius");

    const render = (time: number) => {
      const now = time / 1000;
      
      // Clean up old pulses
      pulsesRef.current = pulsesRef.current.filter(p => now - p.startTime < p.duration);

      // Resize Canvas if needed
      const displayWidth = canvas.clientWidth * window.devicePixelRatio;
      const displayHeight = canvas.clientHeight * window.devicePixelRatio;
      
      // Safety check for 0 dimensions (iframe init issue)
      if (displayWidth === 0 || displayHeight === 0) {
          animationFrameRef.current = requestAnimationFrame(render);
          return;
      }

      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
      }

      gl.useProgram(program);
      // Clear the canvas to transparent before drawing
      gl.clearColor(0, 0, 0, 0); 
      gl.clear(gl.COLOR_BUFFER_BIT);

      // --- DYNAMIC ZOOM RADIUS LOGIC (Pixel Based) ---
      const zoom = map.getZoom();
      let targetRadius = 30.0;
      
      // We want pulses to be tiny dots when zoomed out, and large cinematic glows when zoomed in.
      if (zoom < 5) {
          // Zoom 0-4 (World View): Start bigger (30px - 50px)
          targetRadius = 30.0 + (zoom * 5.0); 
      } else if (zoom < 10) {
          // Zoom 5-9 (Continent/Country): Clearly visible (50px - 100px)
          targetRadius = 50.0 + ((zoom - 5.0) * 10.0);
      } else if (zoom < 15) {
          // Zoom 10-14 (Region/City): Significant glow (100px - 200px)
          targetRadius = 100.0 + ((zoom - 10.0) * 20.0);
      } else {
          // Zoom 15+ (Street): Cinematic Large (200px - 350px)
          targetRadius = 200.0 + ((Math.min(zoom, 18.0) - 15.0) * 50.0);
      }
      
      // Clamp strictly between 30px and 350px
      targetRadius = Math.max(30.0, Math.min(350.0, targetRadius));
      
      gl.uniform1f(uZoomRadiusLoc, targetRadius * window.devicePixelRatio); // Scale radius for DPI
      // -----------------------------------------------

      gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
      gl.uniform1f(uTimeLoc, now);
      gl.uniform1i(uPulseCountLoc, pulsesRef.current.length);

      // Upload Pulse Data
      const pulseData = new Float32Array(MAX_PULSES * 4);
      pulsesRef.current.forEach((p, i) => {
        // Project LatLng to Container Point (Pixels)
        const point = map.latLngToContainerPoint([p.lat, p.lng]);
        const x = point.x * window.devicePixelRatio;
        const y = (canvas.clientHeight - point.y) * window.devicePixelRatio; // GL y is inverted

        pulseData[i * 4 + 0] = x;
        pulseData[i * 4 + 1] = y;
        pulseData[i * 4 + 2] = p.startTime;
        pulseData[i * 4 + 3] = p.duration;
      });

      gl.uniform4fv(uPulsesLoc, pulseData);

      // Draw
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);
  }, [map]);

  return null;
};

export default WebGLPulseLayer;
