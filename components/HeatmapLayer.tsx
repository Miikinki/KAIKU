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
        this._points = []; // Cache for screen coordinates
        this._animating = false;
        this._rafId = null;
    },

    setData: function (data: ChatMessage[]) {
        this._data = data;
        // Update points immediately if map is available, otherwise waiting for onAdd
        if (this._map) {
             this._updatePoints();
             if (!this._animating) this._redraw();
        }
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

        this._resetBound = this._reset.bind(this);
        this._animateZoomBound = this._animateZoom.bind(this);
        this._pauseBound = this._pause.bind(this);
        this._resumeBound = this._resume.bind(this);

        // Events
        map.on('zoomstart', this._pauseBound); // Pause during zoom for perf
        map.on('zoomend', this._resumeBound);
        map.on('zoomend', this._resetBound);
        
        // CRITICAL FIX: We recalculate points ONLY when map stops moving.
        // During drag (move), we let the CSS transform handle the position.
        // We do NOT pause animation during drag anymore, as cached points prevent drift.
        map.on('moveend', this._resetBound); 

        if (map.options.zoomAnimation && L.Browser.any3d) {
            map.on('zoomanim', this._animateZoomBound);
        }

        this._reset();
        this._resume(); 
    },

    onRemove: function (map: L.Map) {
        this._pause(); 

        if (this.options.pane) {
            this.getPane().removeChild(this._canvas);
        } else {
            map.getPanes().overlayPane.removeChild(this._canvas);
        }

        map.off('zoomstart', this._pauseBound);
        map.off('zoomend', this._resumeBound);
        map.off('zoomend', this._resetBound);
        map.off('moveend', this._resetBound);

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

        canvas.style.mixBlendMode = 'screen'; 
        
        const animated = this._map.options.zoomAnimation && L.Browser.any3d;
        L.DomUtil.addClass(canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'));
    },

    _updatePoints: function() {
        if (!this._map) return;
        
        // Cache screen coordinates to decouple from map state during animation frames
        const bounds = this._map.getBounds().pad(0.1); // Small padding for edge smoothness
        this._points = [];

        for (const msg of this._data) {
            if (bounds.contains([msg.location.lat, msg.location.lng])) {
                const p = this._map.latLngToContainerPoint([msg.location.lat, msg.location.lng]);
                this._points.push({
                    x: p.x,
                    y: p.y,
                    timestamp: msg.timestamp,
                    score: msg.score
                });
            }
        }
    },

    _reset: function () {
        const topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);

        const size = this._map.getSize();
        const dpr = window.devicePixelRatio || 1;

        if (this._canvas.width !== size.x * dpr) {
            this._canvas.width = size.x * dpr;
            this._canvas.height = size.y * dpr;
            this._canvas.style.width = size.x + 'px';
            this._canvas.style.height = size.y + 'px';
            
            // Apply scale to context to work with logical pixels
            const ctx = this._canvas.getContext('2d');
            ctx.scale(dpr, dpr);
        }

        this._updatePoints();
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

        // Clear using logical pixels (scale is already set in _reset)
        const size = this._map.getSize();
        ctx.clearRect(0, 0, size.x, size.y);
        
        // Composite op reset (just in case)
        ctx.globalCompositeOperation = 'screen';

        const zoom = this._map.getZoom();
        const now = Date.now();

        // Visual Tuning
        let baseRadius = 15;
        let baseIntensity = 0.4;

        if (zoom < 5) { baseRadius = 4; baseIntensity = 0.6; }
        else if (zoom < 8) { baseRadius = 8; baseIntensity = 0.5; }
        else if (zoom < 12) { baseRadius = 25; baseIntensity = 0.3; }
        else { baseRadius = 60; baseIntensity = 0.2; } 

        // Draw from CACHED points
        this._points.forEach((p: any) => {
            // --- PULSE ANIMATION ---
            const phase = (p.timestamp % 5000) / 5000 * (Math.PI * 2);
            const breathing = 1.0 + Math.sin(now * 0.002 + phase) * 0.2;

            let radius = baseRadius * breathing;
            let intensity = baseIntensity * breathing;
            
            if (p.score > 5) { radius *= 1.5; intensity += 0.2; }
            if (p.score > 20) { radius *= 2.0; intensity = 0.8; }
            
            const ageHours = (Date.now() - p.timestamp) / (1000 * 60 * 60);
            if (ageHours < 1) intensity += 0.2;

            intensity = Math.min(intensity, 1.0);

            // Draw Gradient
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