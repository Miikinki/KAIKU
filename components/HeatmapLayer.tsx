import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { ChatMessage } from '../types';
import L from 'leaflet';

interface HeatmapLayerProps {
  messages: ChatMessage[];
}

// --- CUSTOM GLOW LAYER IMPLEMENTATION ---
// Adds a living "breathing" effect to the signals.

// @ts-ignore
const GlowLayer = L.Layer.extend({
    initialize: function (data: ChatMessage[]) {
        this._data = data;
        this._animating = false;
        this._rafId = null;
    },

    setData: function (data: ChatMessage[]) {
        this._data = data;
        // If not animating (e.g. static mode or paused), force a redraw to update positions
        if (!this._animating) this._redraw();
    },

    onAdd: function (map: L.Map) {
        this._map = map;

        if (!this._canvas) {
            this._initCanvas();
        }

        if (this.options.pane) {
            this.getPane().appendChild(this._canvas);
        } else {
            map.getPanes().overlayPane.appendChild(this._canvas);
        }

        // --- CRITICAL FIX FOR FLOATING DOTS ---
        // We MUST pause the animation loop during 'drag' and 'zoom' interactions.
        // Why? Because during drag, Leaflet moves the canvas container using CSS Transforms.
        // If we try to redraw the points using coordinate calculations during this transform,
        // we apply the movement twice (Double Transformation), causing the dots to "slide" or "float".
        // By pausing, we let CSS handle the movement perfectly, and resume pulsing when stopped.

        this._pauseBound = this._pause.bind(this);
        this._resumeBound = this._resume.bind(this);
        this._resetBound = this._reset.bind(this);
        this._animateZoomBound = this._animateZoom.bind(this);

        // Stop on interaction start
        map.on('movestart', this._pauseBound);
        map.on('zoomstart', this._pauseBound);

        // Resume and Reset on interaction end
        map.on('moveend', this._resetBound);
        map.on('moveend', this._resumeBound);
        map.on('zoomend', this._resetBound);
        map.on('zoomend', this._resumeBound);

        if (map.options.zoomAnimation && L.Browser.any3d) {
            map.on('zoomanim', this._animateZoomBound);
        }

        this._reset();
        this._resume(); // Start loop
    },

    onRemove: function (map: L.Map) {
        this._pause(); // Stop loop

        if (this.options.pane) {
            this.getPane().removeChild(this._canvas);
        } else {
            map.getPanes().overlayPane.removeChild(this._canvas);
        }

        map.off('movestart', this._pauseBound);
        map.off('zoomstart', this._pauseBound);
        map.off('moveend', this._resetBound);
        map.off('moveend', this._resumeBound);
        map.off('zoomend', this._resetBound);
        map.off('zoomend', this._resumeBound);

        if (map.options.zoomAnimation) {
            map.off('zoomanim', this._animateZoomBound);
        }
    },

    addTo: function (map: L.Map) {
        map.addLayer(this);
        return this;
    },

    _initCanvas: function () {
        const canvas = this._canvas = L.DomUtil.create('canvas', 'leaflet-glow-layer leaflet-layer') as HTMLCanvasElement;
        
        const originProp = L.DomUtil.testProp(['transformOrigin', 'WebkitTransformOrigin', 'msTransformOrigin']);
        if (originProp) {
            (canvas.style as any)[originProp] = '0 0';
        }

        // CRITICAL: Screen blending for additive light
        canvas.style.mixBlendMode = 'screen'; 
        
        const size = this._map.getSize();
        canvas.width = size.x;
        canvas.height = size.y;
        canvas.style.width = size.x + 'px';
        canvas.style.height = size.y + 'px';

        const animated = this._map.options.zoomAnimation && L.Browser.any3d;
        L.DomUtil.addClass(canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'));
    },

    _reset: function () {
        const topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);

        const size = this._map.getSize();

        if (this._canvas.width !== size.x) {
            this._canvas.width = size.x;
            this._canvas.style.width = size.x + 'px';
        }
        if (this._canvas.height !== size.y) {
            this._canvas.height = size.y;
            this._canvas.style.height = size.y + 'px';
        }

        this._redraw();
    },

    _pause: function() {
        this._animating = false;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    },

    _resume: function() {
        if (!this._animating) {
            this._animating = true;
            this._animate();
        }
    },

    _animate: function () {
        if (!this._animating) return;
        this._redraw();
        this._rafId = requestAnimationFrame(this._animate.bind(this));
    },

    _redraw: function () {
        if (!this._map) return;

        const canvas = this._canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'screen';

        const bounds = this._map.getBounds();
        const zoom = this._map.getZoom();
        const now = Date.now();

        // Visual Tuning
        let baseRadius = 15;
        let baseIntensity = 0.4;

        if (zoom < 5) { baseRadius = 4; baseIntensity = 0.6; }
        else if (zoom < 8) { baseRadius = 8; baseIntensity = 0.5; }
        else if (zoom < 12) { baseRadius = 25; baseIntensity = 0.3; }
        else { baseRadius = 60; baseIntensity = 0.2; } 

        this._data.forEach((msg: ChatMessage) => {
            // Cull off-screen
            if (!bounds.contains([msg.location.lat, msg.location.lng])) return;

            const p = this._map.latLngToContainerPoint([msg.location.lat, msg.location.lng]);

            // --- PULSE ANIMATION ---
            const phase = (msg.timestamp % 5000) / 5000 * (Math.PI * 2);
            
            // Pulse logic
            const breathing = 1.0 + Math.sin(now * 0.002 + phase) * 0.2;

            let radius = baseRadius * breathing;
            let intensity = baseIntensity * breathing;
            
            if (msg.score > 5) { radius *= 1.5; intensity += 0.2; }
            if (msg.score > 20) { radius *= 2.0; intensity = 0.8; }
            
            const ageHours = (Date.now() - msg.timestamp) / (1000 * 60 * 60);
            if (ageHours < 1) intensity += 0.2;

            intensity = Math.min(intensity, 1.0);

            // Draw
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
            grad.addColorStop(0, `rgba(34, 211, 238, ${intensity})`);
            grad.addColorStop(0.4, `rgba(34, 211, 238, ${intensity * 0.5})`);
            grad.addColorStop(1, 'rgba(34, 211, 238, 0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fill();
        });
    },

    _animateZoom: function (e: any) {
        const scale = this._map.getZoomScale(e.zoom);
        const offset = this._map._latLngToNewLayerPoint(this._map.getBounds().getNorthWest(), e.zoom, e.center);

        L.DomUtil.setTransform(this._canvas, offset, scale);
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

    return () => {
        // Cleanup handled by onRemove in the layer itself
    };
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