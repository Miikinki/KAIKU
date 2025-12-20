import React, { useEffect, useRef, forwardRef } from 'react';
import { useMap } from 'react-leaflet';
import { ChatMessage } from '../types';
import L from 'leaflet';
import { HIGH_SIGNAL_THRESHOLD, LOW_SIGNAL_THRESHOLD } from '../constants';

interface HeatmapLayerProps {
  messages: ChatMessage[];
}

export interface HeatmapLayerRef {}

// @ts-ignore
const GlowLayer = L.Layer.extend({
    initialize: function (data: ChatMessage[]) {
        this._data = data;
        this._buffer = 50; 
        this._hidden = false;
    },

    setData: function (data: ChatMessage[]) {
        this._data = data;
        this._redraw();
    },

    onAdd: function (map: L.Map) {
        this._map = map;

        if (!this._canvas) {
            this._initCanvas();
        }

        this.getPane().appendChild(this._canvas);

        map.on('moveend', this._reset, this);
        map.on('zoomanim', this._animateZoom, this);
        map.on('movestart', this._hide, this);
        map.on('zoomstart', this._hide, this);
        
        this._reset();
    },

    onRemove: function (map: L.Map) {
        if (this._canvas) {
             L.DomUtil.remove(this._canvas);
        }
        map.off('moveend', this._reset, this);
        map.off('zoomanim', this._animateZoom, this);
        map.off('movestart', this._hide, this);
        map.off('zoomstart', this._hide, this);
    },

    addTo: function (map: L.Map) {
        map.addLayer(this);
        return this;
    },

    _initCanvas: function () {
        const canvas = this._canvas = L.DomUtil.create('canvas', 'leaflet-glow-layer-hud leaflet-zoom-animated');
        canvas.style.position = 'absolute';
        canvas.style.transformOrigin = '0 0'; 
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '350'; // Below clusters/markers (400+)
        canvas.style.transition = 'opacity 0.2s linear';
        canvas.style.opacity = '1';
    },

    _hide: function() {
        if (this._canvas) {
            this._canvas.style.opacity = '0';
            this._hidden = true;
        }
    },

    _reset: function () {
        const map = this._map;
        const size = map.getSize();
        const dpr = window.devicePixelRatio || 1;
        const buffer = this._buffer;

        this._topLeftLatLng = map.containerPointToLatLng([-buffer, -buffer]);
        
        const topLeft = map.containerPointToLayerPoint([-buffer, -buffer]);
        L.DomUtil.setPosition(this._canvas, topLeft);

        const width = size.x + (buffer * 2);
        const height = size.y + (buffer * 2);

        if (this._canvas.width !== width * dpr || this._canvas.height !== height * dpr) {
            this._canvas.width = width * dpr;
            this._canvas.height = height * dpr;
            this._canvas.style.width = width + 'px';
            this._canvas.style.height = height + 'px';
        }

        this._redraw();
        
        if (this._canvas) {
            this._canvas.style.opacity = '1';
            this._hidden = false;
        }
    },

    _redraw: function () {
        if (!this._map || !this._canvas) return;

        const ctx = this._canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const width = this._canvas.width;
        const height = this._canvas.height;
        const buffer = this._buffer;

        ctx.clearRect(0, 0, width, height);

        const zoom = this._map.getZoom();
        
        // --- VISIBILITY FILTER ---
        // Hide the fog effect when zoomed out to reduce clutter.
        // It only appears when closer to "Ground Level" (Zoom 13+).
        if (zoom < 13) {
            return;
        }

        const bounds = this._map.getBounds();

        // SIGNAL FOG STYLE CONFIGURATION
        let baseRadius = 60 * dpr; 
        let baseIntensity = 0.25;   

        // Adjust based on zoom to keep density consistent across levels
        if (zoom < 13) {
            // Should be caught by return above, but fallback safely
            baseRadius = 50 * dpr;
            baseIntensity = 0;
        }
        else if (zoom < 15) { 
            // City View (Zoomed in)
            baseRadius = 80 * dpr; 
            baseIntensity = 0.2; 
        }
        else if (zoom < 17) { 
            // Street View
            baseRadius = 120 * dpr; 
            baseIntensity = 0.15; 
        }
        else { 
            // Max Zoom
            baseRadius = 180 * dpr; 
            baseIntensity = 0.15; 
        }

        // Additive blending for "Glowing" effect
        ctx.globalCompositeOperation = 'lighter'; 

        this._data.forEach((msg: ChatMessage) => {
            // FILTER: Show everything that isn't heavily downvoted
            if (msg.score <= LOW_SIGNAL_THRESHOLD) return;

            const margin = 0.5; 
            if (msg.location.lat > bounds.getNorth() + margin || 
                msg.location.lat < bounds.getSouth() - margin ||
                msg.location.lng > bounds.getEast() + margin || 
                msg.location.lng < bounds.getWest() - margin) return;

            const p = this._map.latLngToContainerPoint([msg.location.lat, msg.location.lng]);
            
            const x = (p.x + buffer) * dpr;
            const y = (p.y + buffer) * dpr;

            if (x < -baseRadius || x > width + baseRadius || y < -baseRadius || y > height + baseRadius) return;

            // COLOR: Cyan-400 (34, 211, 238)
            const r=34, g=211, b=238; 

            let radius = baseRadius;
            let intensity = baseIntensity;
            
            // SCORE BOOST: Make high score messages significantly larger/brighter
            if (msg.score >= HIGH_SIGNAL_THRESHOLD) { 
                radius *= 1.8; 
                intensity *= 1.5; 
            } else if (msg.score >= 1) {
                radius *= 1.2;
                intensity *= 1.2;
            }

            // Cap intensity to prevent blowing out the screen
            intensity = Math.min(intensity, 0.8);

            // Draw Gradient
            const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
            // Core (Bright)
            grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${intensity})`);
            // Mid (Fade)
            grad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${intensity * 0.4})`);
            // Edge (Transparent)
            grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.globalCompositeOperation = 'source-over';
    },
    
    _animateZoom: function (e: any) {
        if (!this._hidden && this._canvas) {
             this._canvas.style.opacity = '0';
             this._hidden = true;
        }

        if (!this._topLeftLatLng) return;

        const scale = this._map.getZoomScale(e.zoom);
        const offset = this._map._latLngToNewLayerPoint(this._topLeftLatLng, e.zoom, e.center);

        L.DomUtil.setTransform(this._canvas, offset, scale);
    }
});

const HeatmapLayer = forwardRef<HeatmapLayerRef, HeatmapLayerProps>(({ messages }, ref) => {
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
  
  useEffect(() => {
      return () => {
          if (layerRef.current && map) {
              map.removeLayer(layerRef.current);
              layerRef.current = null;
          }
      }
  }, [map]);

  return null;
});

export default HeatmapLayer;