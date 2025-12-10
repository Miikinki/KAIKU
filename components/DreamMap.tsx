import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents, GeoJSON } from 'react-leaflet';
import * as L from 'leaflet';
import { Dream, DreamCategory } from '../types';
import { CATEGORY_COLORS, MAP_TILE_URL, MAP_ATTRIBUTION, WORLD_GEOJSON_URL } from '../constants';
import { calculateRegionalStats } from '../services/aggregationService';

interface DreamMapProps {
  dreams: Dream[];
  filter: DreamCategory | 'ALL';
  onDreamClick: (dream: Dream) => void;
  onCountryClick?: (countryName: string, feature: any) => void;
  focusDream: Dream | null;
}

interface SpiderCluster {
  centerDream: Dream;
  legs: {
    dream: Dream;
    position: [number, number]; // LatLng
  }[];
}

// Function to create custom glowing icons
const createGlowingIcon = (color: string, isSpiderfied = false) => {
  if (!L || !L.divIcon) return undefined;

  const size = isSpiderfied ? 20 : 24; // Slightly smaller for spiderfied legs

  return L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div class="dream-marker-container" style="width: ${size}px; height: ${size}px; color: ${color};">
        <div class="dream-marker-ring"></div>
        <div class="dream-marker-dot"></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
};

// Component to handle Map invalidation and FlyTo animations
const MapController: React.FC<{ focusDream: Dream | null }> = ({ focusDream }) => {
  const map = useMap();
  
  useEffect(() => {
    // Force a resize calculation when the component mounts to prevent gray tiles
    const timer = setTimeout(() => {
        map.invalidateSize();
    }, 100);
    return () => clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (focusDream) {
      map.flyTo([focusDream.location.lat, focusDream.location.lng], 6, {
        duration: 2.5,
        easeLinearity: 0.25
      });
    }
  }, [focusDream, map]);

  return null;
};

// Component to handle World GeoJSON Layer with Dynamic Coloring
const WorldBordersLayer: React.FC<{ 
  onCountryClick?: (name: string, feature: any) => void;
  dreams: Dream[]; 
}> = ({ onCountryClick, dreams }) => {
  const [geoJsonData, setGeoJsonData] = useState<any>(null);
  const [countryThemes, setCountryThemes] = useState<Record<string, DreamCategory>>({});

  useEffect(() => {
    fetch(WORLD_GEOJSON_URL)
      .then(res => res.json())
      .then(data => setGeoJsonData(data))
      .catch(err => console.error("Failed to load world borders", err));
  }, []);

  // Calculate dominant themes for countries
  useEffect(() => {
    if (!geoJsonData || dreams.length === 0) return;

    // Use a timeout to avoid blocking the main thread immediately on render
    const timer = setTimeout(() => {
      const themes: Record<string, DreamCategory> = {};
      
      geoJsonData.features.forEach((feature: any) => {
        const name = feature.properties?.name || feature.properties?.NAME;
        if (name) {
          // We can optimize this by only calculating if there are dreams roughly in the area,
          // but for now we rely on the aggregation service's filter.
          const stats = calculateRegionalStats(name, feature, dreams);
          if (stats.totalDreams > 0 && stats.dominantTheme !== 'N/A') {
            themes[name] = stats.dominantTheme as DreamCategory;
          }
        }
      });
      
      setCountryThemes(themes);
    }, 500);

    return () => clearTimeout(timer);
  }, [geoJsonData, dreams]);

  if (!geoJsonData) return null;

  return (
    <GeoJSON 
      data={geoJsonData}
      style={(feature) => {
        const name = feature?.properties?.name || feature?.properties?.NAME;
        const theme = name ? countryThemes[name] : undefined;
        
        if (theme) {
          const color = CATEGORY_COLORS[theme];
          return {
            fillColor: color,
            fillOpacity: 0.03, // Almost transparent interior for dark aesthetic
            color: color,
            weight: 1.5, // Crisp outline
            opacity: 1, // Full opacity for the neon wireframe look
          };
        }

        return {
          fillColor: '#ffffff',
          fillOpacity: 0, // Invisible fill for hit detection
          color: '#ffffff',
          weight: 0.5, // Very subtle borders
          opacity: 0.1,
        };
      }}
      onEachFeature={(feature, layer) => {
        layer.on({
          click: (e) => {
            L.DomEvent.stopPropagation(e); // Prevent map click
            // Try to find name in common properties
            const name = feature.properties?.name || feature.properties?.NAME || 'Unknown Region';
            if (onCountryClick) {
              onCountryClick(name, feature);
            }
          },
          mouseover: (e) => {
            const l = e.target as any;
            const name = feature.properties?.name || feature.properties?.NAME;
            const theme = name ? countryThemes[name] : undefined;
            
            // Highlight style (brighter if themed, else blueish)
            l.setStyle({
              weight: 3, // Thicker on hover
              opacity: 1,
              fillOpacity: 0.1, // Slight fill to indicate selection area
              color: theme ? CATEGORY_COLORS[theme] : '#3b82f6'
            });

            // Add CSS drop-shadow for a true glowing effect
            if (l.getElement()) {
              const color = theme ? CATEGORY_COLORS[theme] : '#3b82f6';
              l.getElement().style.filter = `drop-shadow(0 0 8px ${color})`;
              l.getElement().style.transition = 'all 0.3s ease';
            }
          },
          mouseout: (e) => {
             const l = e.target as any;
             const name = feature.properties?.name || feature.properties?.NAME;
             const theme = name ? countryThemes[name] : undefined;
             
             // Reset style
             if (theme) {
               l.setStyle({
                 weight: 1.5,
                 opacity: 1,
                 fillOpacity: 0.03,
                 color: CATEGORY_COLORS[theme]
               });
             } else {
               l.setStyle({
                  weight: 0.5,
                  opacity: 0.1,
                  fillOpacity: 0,
                  color: '#ffffff'
               });
             }

             // Remove glow
             if (l.getElement()) {
               l.getElement().style.filter = '';
             }
          }
        });
      }}
    />
  );
};

// Inner component to handle markers, logic, and spiderfy state using map context
const DreamMarkers: React.FC<{
  dreams: Dream[];
  filter: DreamCategory | 'ALL';
  onDreamClick: (dream: Dream) => void;
}> = ({ dreams, filter, onDreamClick }) => {
  const map = useMap();
  const [spiderCluster, setSpiderCluster] = useState<SpiderCluster | null>(null);

  // Clear spiderfy on zoom, move, or background click
  useMapEvents({
    zoomstart: () => setSpiderCluster(null),
    movestart: () => setSpiderCluster(null),
    click: () => setSpiderCluster(null),
  });

  // Filter dreams based on prop
  const visibleDreams = useMemo(() => {
    if (filter === 'ALL') return dreams;
    return dreams.filter(d => d.category === filter);
  }, [dreams, filter]);

  const handleMarkerClick = (clickedDream: Dream, e: L.LeafletMouseEvent) => {
    // If already in a cluster and clicking a leg, just open it (handled by leg onclick)
    // This handler is for the main markers (clusters or singletons)

    L.DomEvent.stopPropagation(e);
    
    // Project clicked point to container pixels
    const clickedPoint = map.latLngToContainerPoint([clickedDream.location.lat, clickedDream.location.lng]);

    // Find all visible dreams close to this point (e.g., 30px radius)
    const CLUSTER_RADIUS_PX = 30;
    
    const nearbyDreams = visibleDreams.filter(d => {
      // Quick pre-filter by lat/lng to avoid heavy projection math on all points
      if (Math.abs(d.location.lat - clickedDream.location.lat) > 1) return false;
      if (Math.abs(d.location.lng - clickedDream.location.lng) > 1) return false;

      const p = map.latLngToContainerPoint([d.location.lat, d.location.lng]);
      return clickedPoint.distanceTo(p) < CLUSTER_RADIUS_PX;
    });

    if (nearbyDreams.length > 1) {
      // Trigger Spiderfy
      const count = nearbyDreams.length;
      const angleStep = (Math.PI * 2) / count;
      const legLengthPx = 70; // Distance from center

      const legs = nearbyDreams.map((d, index) => {
        const angle = index * angleStep;
        const offsetPoint = L.point(
          clickedPoint.x + legLengthPx * Math.cos(angle),
          clickedPoint.y + legLengthPx * Math.sin(angle)
        );
        const latLng = map.containerPointToLatLng(offsetPoint);
        return {
          dream: d,
          position: [latLng.lat, latLng.lng] as [number, number]
        };
      });

      setSpiderCluster({
        centerDream: clickedDream,
        legs: legs
      });

    } else {
      // It's a single dream, just open it
      onDreamClick(clickedDream);
    }
  };

  return (
    <>
      {/* Render Spiderfied Cluster (Lines & Legs) */}
      {spiderCluster && (
        <>
          {spiderCluster.legs.map((leg) => (
            <React.Fragment key={`spider-line-${leg.dream.id}`}>
              <Polyline
                positions={[
                  [spiderCluster.centerDream.location.lat, spiderCluster.centerDream.location.lng],
                  leg.position
                ]}
                pathOptions={{
                  color: 'white',
                  weight: 1,
                  opacity: 0.3,
                  dashArray: '4 6'
                }}
              />
              <Marker
                position={leg.position}
                icon={createGlowingIcon(CATEGORY_COLORS[leg.dream.category], true)}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    onDreamClick(leg.dream);
                  }
                }}
                riseOnHover={true}
              />
            </React.Fragment>
          ))}
        </>
      )}

      {/* Render Normal Markers */}
      {visibleDreams.map((dream) => {
        // If this dream is currently part of the active spider cluster, hide its original marker
        if (spiderCluster && spiderCluster.legs.some(leg => leg.dream.id === dream.id)) {
          return null;
        }

        const icon = createGlowingIcon(CATEGORY_COLORS[dream.category]);
        if (!icon) return null;

        return (
          <Marker
            key={dream.id}
            position={[dream.location.lat, dream.location.lng]}
            icon={icon}
            eventHandlers={{
              click: (e) => handleMarkerClick(dream, e),
            }}
            riseOnHover={true} // Bring to front on hover
          />
        );
      })}
    </>
  );
};

const DreamMap: React.FC<DreamMapProps> = ({ dreams, filter, onDreamClick, onCountryClick, focusDream }) => {
  return (
    <div className="fixed inset-0 z-0 bg-[#0a0a12]">
      <MapContainer
        center={[20, 0]}
        zoom={2.5}
        scrollWheelZoom={true}
        zoomControl={false}
        attributionControl={false}
        className="w-full h-full"
        style={{ width: '100vw', height: '100vh', background: '#0a0a12' }}
        minZoom={2}
        maxBounds={[[-90, -180], [90, 180]]}
        maxBoundsViscosity={1.0}
      >
        <TileLayer
          attribution={MAP_ATTRIBUTION}
          url={MAP_TILE_URL}
        />

        <WorldBordersLayer onCountryClick={onCountryClick} dreams={dreams} />
        
        <DreamMarkers 
          dreams={dreams} 
          filter={filter} 
          onDreamClick={onDreamClick} 
        />
        
        <MapController focusDream={focusDream} />
      </MapContainer>
    </div>
  );
};

export default DreamMap;