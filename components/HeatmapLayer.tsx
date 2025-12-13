import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import * as L from 'leaflet';

interface HeatmapLayerProps {
    polygons: { coords: [number, number][], count: number }[]; 
}

/**
 * OPTIMIZED H3 HEXAGON RENDERER
 * 
 * Fixes "buggy" feel by preventing layer thrashing.
 * Uses a persistent LayerGroup and updates contents rather than recreating the layer.
 */
const HeatmapLayer: React.FC<HeatmapLayerProps> = ({ polygons }) => {
    const map = useMap();
    const layerGroupRef = useRef<L.LayerGroup | null>(null);

    // 1. Initialize LayerGroup ONCE
    useEffect(() => {
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
        if (!layerGroupRef.current) return;

        const group = layerGroupRef.current;
        
        // Clear existing shapes without removing the layer from map (Prevents Flicker)
        group.clearLayers();

        // Use a shared canvas renderer for performance
        const canvasRenderer = L.canvas({ padding: 0.5 });

        polygons.forEach(poly => {
            const shape = L.polygon(poly.coords, {
                renderer: canvasRenderer,
                stroke: true,
                color: '#22d3ee', // Cyan-400
                weight: 1.5,
                fillColor: '#06b6d4', // Cyan-500
                fillOpacity: 0.4 + (Math.min(poly.count, 20) * 0.02), 
                interactive: false,
                smoothFactor: 1
            });
            group.addLayer(shape);
        });

    }, [polygons]); // Re-run only when polygon data changes

    return null;
};

export default HeatmapLayer;