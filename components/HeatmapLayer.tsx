import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import * as L from 'leaflet';

interface HeatmapLayerProps {
    polygons: { coords: [number, number][], count: number }[]; 
}

/**
 * HIGH-PERFORMANCE H3 RENDERER
 * 
 * Performance Fix:
 * 1. Reuses a single L.canvas() renderer instance via useRef.
 * 2. Does not destroy the LayerGroup on updates, just clears layers.
 */
const HeatmapLayer: React.FC<HeatmapLayerProps> = ({ polygons }) => {
    const map = useMap();
    const layerGroupRef = useRef<L.LayerGroup | null>(null);
    const rendererRef = useRef<L.Canvas | null>(null);

    // 1. Initialize LayerGroup & Renderer ONCE
    useEffect(() => {
        // Create a single shared canvas renderer for all polygons
        // This is critical for performance. Previous version created a new one on every render.
        rendererRef.current = L.canvas({ padding: 0.5 });
        
        const layerGroup = L.layerGroup().addTo(map);
        layerGroupRef.current = layerGroup;

        return () => {
            if (map.hasLayer(layerGroup)) {
                map.removeLayer(layerGroup);
            }
        };
    }, [map]);

    // 2. Update Data Smoothly
    useEffect(() => {
        if (!layerGroupRef.current || !rendererRef.current) return;

        const group = layerGroupRef.current;
        const renderer = rendererRef.current;
        
        // Clear existing shapes
        group.clearLayers();

        // Draw new polygons using the SHARED renderer
        polygons.forEach(poly => {
            const shape = L.polygon(poly.coords, {
                renderer: renderer, // Reuse the same canvas context
                stroke: true,
                color: '#22d3ee',
                weight: 1.5,
                fillColor: '#06b6d4',
                fillOpacity: 0.4 + (Math.min(poly.count, 20) * 0.02), 
                interactive: false,
                smoothFactor: 1
            });
            group.addLayer(shape);
        });

    }, [polygons]);

    return null;
};

export default HeatmapLayer;