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
         float edge = maxRadius * 0.4; 
         float ring = smoothstep(currentRadius, currentRadius - edge, dist);
         
         // Cut out inner to make it a ring
         float inner = smoothstep(currentRadius - edge * 0.5, currentRadius, dist);
         
         float alpha = 1.0 - t; // Fade out
         
         // Kaiku Blue: 0.3, 0.65, 1.0
         // Accumulate color
         color += vec3(0.3, 0.65, 1.0) * ring * inner * alpha; 
      }
    }
    
    // Simple transparency handling: if color is black, alpha is 0
    float alpha = max(color.r, max(color.g, color.b));
    gl_FragColor = vec4(color, alpha);
  }
`;

const MAX_PULSES = 32;

const WebGLPulseLayer: React.FC<WebGLPulseLayerProps> = ({ lastNewMessage }) => {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const pulsesRef = useRef<{ lat: number; lng: number; startTime: number; duration: number }[]>([]);
  // Fix: Initialize useRef with null to avoid "Expected 1 arguments, but got 0"
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // 1. Setup Canvas
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed'; // Fixed over the map container
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '900'; // Above map, below UI
    
    const mapContainer = map.getContainer();
    mapContainer.appendChild(canvas);
    canvasRef.current = canvas;

    // 2. Setup WebGL
    const gl = canvas.getContext('webgl', { alpha: true, depth: false, antialias: true });
    if (!gl) {
        console.error("WebGL 1 not supported");
        return;
    }
    glRef.current = gl;

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
      pulsesRef.current.push({
        lat: lastNewMessage.location.lat,
        lng: lastNewMessage.location.lng,
        startTime: performance.now() / 1000,
        duration: 1.4 // 1.4 seconds duration
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
      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
      }

      gl.useProgram(program);

      // --- DYNAMIC ZOOM RADIUS LOGIC (Pixel Based) ---
      const zoom = map.getZoom();
      let targetRadius = 20.0;
      
      if (zoom >= 15) {
        // Zoom 15-18 -> 180-220px
        targetRadius = 180.0 + (Math.min(zoom, 18) - 15) * (40.0/3.0);
      } else if (zoom >= 10) {
        // Zoom 10-14 -> 120-160px
        targetRadius = 120.0 + (zoom - 10) * (40.0/4.0);
      } else if (zoom >= 5) {
        // Zoom 5-9 -> 40-80px
        targetRadius = 40.0 + (zoom - 5) * (40.0/4.0);
      } else {
        // Zoom 1-4 -> 12-30px
        targetRadius = 12.0 + (Math.max(zoom, 1) - 1) * (18.0/3.0);
      }
      
      // Clamp just to be safe
      targetRadius = Math.max(12.0, Math.min(220.0, targetRadius));
      gl.uniform1f(uZoomRadiusLoc, targetRadius);
      // -----------------------------------------------

      gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
      gl.uniform1f(uTimeLoc, now);
      gl.uniform1i(uPulseCountLoc, pulsesRef.current.length);

      // Upload Pulse Data
      const pulseData = new Float32Array(MAX_PULSES * 4);
      pulsesRef.current.forEach((p, i) => {
        // Project LatLng to Container Point (Pixels)
        // We use map.latLngToContainerPoint to get x,y relative to the map container.
        // Since our canvas is fixed top:0 left:0 matching the container, this works.
        const point = map.latLngToContainerPoint([p.lat, p.lng]);
        // Adjust for devicePixelRatio because gl_FragCoord is in physical pixels
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