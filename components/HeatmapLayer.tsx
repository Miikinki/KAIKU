import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { ChatMessage } from '../types';
import L from 'leaflet';

interface HeatmapLayerProps {
  messages: ChatMessage[];
}

// --- CUSTOM GLOW LAYER (HUD MODE) ---
// Renders a fixed canvas over the map container.
// Points are projected every frame to ensure they stick to the map 
// even during interaction, avoiding CSS transform artifacts.

// @ts-ignore
const GlowLayer = L.Layer.extend({
    initialize: function (data: ChatMessage[]) {
        this._data = data;
        this._animating = false;
        this._rafId = null;
    },

    setData: function (data: ChatMessage[]) {
        this._data = data;
    },

    onAdd: function (map: L.Map) {
        this._map = map;

        if (!this._canvas) {
            this._initCanvas();
        }

        // Append to the map container (Viewport), NOT the overlay pane.
        // This ensures the canvas doesn't move with the map drag (CSS Transform).
        // Instead, we project the points to the correct screen coordinates every frame.
        map.getContainer().appendChild(this._canvas);

        this._resizeBound = this._resize.bind(this);
        map.on('resize', this._resizeBound);
        
        // We don't need move/zoom listeners to reset canvas, 
        // because the canvas is fixed 100% width/height of container.
        // We just rely on the animation loop to project points.

        this._resize();
        this._startAnimation();
    },

    onRemove: function (map: L.Map) {
        this._stopAnimation();

        if (this._canvas) {
            // Remove from container
             const container = map.getContainer();
             if (container.contains(this._canvas)) {
                 container.removeChild(this._canvas);
             }
        }

        map.off('resize', this._resizeBound);
    },

    addTo: function (map: L.Map) {
        map.addLayer(this);
        return this;
    },

    _initCanvas: function () {
        const canvas = this._canvas = L.DomUtil.create('canvas', 'leaflet-glow-layer-hud') as HTMLCanvasElement;
        
        // Style: Fixed overlay, pass-through clicks
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '400'; // Above tiles, below UI
        // Mix-blend-mode 'screen' can be buggy on some mobile browsers with transparent canvas.
        // We'll use standard blending but with additive-like colors in the draw loop if needed.
        // canvas.style.mixBlendMode = 'screen'; 
    },

    _resize: function () {
        if (!this._map) return;
        
        const size = this._map.getSize();
        const dpr = window.devicePixelRatio || 1;

        this._canvas.width = size.x * dpr;
        this._canvas.height = size.y * dpr;
        this._canvas.style.width = size.x + 'px';
        this._canvas.style.height = size.y + 'px';
    },

    _startAnimation: function() {
        if (!this._animating) {
            this._animating = true;
            this._animate();
        }
    },

    _stopAnimation: function() {
        this._animating = false;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    },

    _animate: function () {
        if (!this._animating) return;
        this._redraw();
        this._rafId = requestAnimationFrame(this._animate.bind(this));
    },

    _redraw: function () {
        if (!this._map || !this._canvas) return;

        const ctx = this._canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const width = this._canvas.width;
        const height = this._canvas.height;

        // Clear
        ctx.clearRect(0, 0, width, height);

        // Visual Params
        const zoom = this._map.getZoom();
        const bounds = this._map.getBounds(); // Cull off-screen points
        const now = Date.now();

        // Scale tuning based on Zoom
        let baseRadius = 15 * dpr;
        let baseIntensity = 0.4;

        if (zoom < 5) { 
            baseRadius = 4 * dpr; 
            baseIntensity = 0.6; 
        }
        else if (zoom < 8) { 
            baseRadius = 10 * dpr; 
            baseIntensity = 0.5; 
        }
        else if (zoom < 10) { 
            // Regional
            baseRadius = 25 * dpr; 
            baseIntensity = 0.35; 
        }
        else { 
            // Max Zoom (10-11)
            // Render a large, soft "privacy blob" that obscures precise street location
            baseRadius = 55 * dpr; 
            baseIntensity = 0.25; 
        } 

        // Draw loop
        this._data.forEach((msg: ChatMessage) => {
            // Optimization: Skip if far off-screen
            // We use a loose check (no padding calculation) for speed
            if (!bounds.contains([msg.location.lat, msg.location.lng])) return;

            // Project to screen coordinates
            // latLngToContainerPoint returns pixels relative to the map container (viewport)
            const p = this._map.latLngToContainerPoint([msg.location.lat, msg.location.lng]);

            // Multiply by DPR for HiDPI canvas
            const x = p.x * dpr;
            const y = p.y * dpr;

            // --- PULSE ANIMATION ---
            const phase = (msg.timestamp % 5000) / 5000 * (Math.PI * 2);
            const breathing = 1.0 + Math.sin(now * 0.002 + phase) * 0.2;

            let radius = baseRadius * breathing;
            let intensity = baseIntensity * breathing;
            
            if (msg.score > 5) { radius *= 1.5; intensity += 0.2; }
            if (msg.score > 20) { radius *= 2.0; intensity = 0.8; }
            
            // New signal flash
            const ageHours = (now - msg.timestamp) / (1000 * 60 * 60);
            if (ageHours < 1) intensity += 0.2;

            intensity = Math.min(intensity, 1.0);

            // Manual additive blend simulation (Screen-ish)
            // Using radial gradient with transparency
            const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
            // Cyan: 34, 211, 238
            grad.addColorStop(0, `rgba(34, 211, 238, ${intensity})`);
            grad.addColorStop(0.4, `rgba(34, 211, 238, ${intensity * 0.4})`);
            grad.addColorStop(1, 'rgba(34, 211, 238, 0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        });
    }
});

const HeatmapLayer: React.FC<HeatmapLayerProps> = ({ messages }) => {
  const map = useMap();
  const layerRef = useRef<any>(null);

  useEffect(() => {
    if (!map) return;

    if (!layerRef.current) {
        // @ts-ignore
        layerRef.current = new GlowLayer(messages);
        map.addLayer(layerRef.current);
    } else {
        layerRef.current.setData(messages);
    }
  }, [map, messages]);

  // Clean up on unmount
  useEffect(() => {
      return () => {
          if (layerRef.current && map) {
              map.removeLayer(layerRef.current);
              layerRef.current = null;
          }
      }
  }, [map]);

  return null;
};

export default HeatmapLayer;