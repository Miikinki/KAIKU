import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import * as L from 'leaflet';

interface HeatmapLayerProps {
    polygons: { coords: [number, number][], count: number }[]; 
}

/**
 * ANIMATED H3 RENDERER (SVG)
 * 
 * Update: Switched to SVG renderer (default) to allow CSS animations.
 * Added 'living-hex' class for the neon breath effect.
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

    // 2. Update Data
    useEffect(() => {
        if (!layerGroupRef.current) return;

        const group = layerGroupRef.current;
        
        // Clear existing shapes
        group.clearLayers();

        // Draw new polygons
        polygons.forEach(poly => {
            const shape = L.polygon(poly.coords, {
                className: 'living-hex', // CSS Animation trigger (see index.html)
                color: '#22d3ee',        // Fallback color
                weight: 1,
                fillColor: '#06b6d4',
                fillOpacity: 0.2,        // Base opacity, animation modulates this
                interactive: false,
                smoothFactor: 1
            });
            group.addLayer(shape);
        });

    }, [polygons]);

    return null;
};

export default HeatmapLayer;