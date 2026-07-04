// Builds an Android Intent URI that opens Street View inside the Google Maps app,
// already facing the computed heading (so corner properties face the building
// front). Because the OS/Google Maps app makes the request — not our app — this
// requires no data-sharing disclosure.
export const buildStreetViewIntentUrl = (lat: number, lng: number, heading: number = 0) => {
  const safeHeading = Number.isFinite(heading) ? Math.round(((heading % 360) + 360) % 360) : 0;
  return `google.streetview:cbll=${lat},${lng}&cbp=0,${safeHeading},0,0,1`;
};

export const buildFallbackStaticMapUrl = (
  lat: number,
  lng: number,
  width: number = 600,
  height: number = 300,
  zoom: number = 17,
) =>
  `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&markers=${lat},${lng},red-pushpin`;

export const buildLocationPreviewImageUrl = (
  lat: number,
  lng: number,
  _heading: number = 0,
  _panoId?: string | null,
  width: number = 640,
  height: number = 480,
) => buildFallbackStaticMapUrl(lat, lng, width, height, 17);

export const buildBaseMapUrl = (
  lat: number,
  lng: number,
  zoom: number,
  _mapType: string,
  _mapStyleParams: string,
) => buildFallbackStaticMapUrl(lat, lng, 600, 600, zoom);

// Small static map used as the top portion of the chat location thumbnail.
// Renders the same red pin marker that appears in the Update Location panel,
// anchored at the address coords that would be sent if the user hit Send.
// Zoomed in tight so the building and adjacent street are clearly visible.
export const buildLocationPreviewMapUrl = (
  lat: number,
  lng: number,
  zoom: number = 19,
) => buildFallbackStaticMapUrl(lat, lng, 600, 420, zoom);

// Renders a Leaflet map using official OSM tile servers — no API key required.
// interactive=true: tap places/moves pin; exposes window.setPin(lat,lng) and
//   window.setView(lat,lng,zoom) for JS injection from the native side.
// interactive=false: gesture-locked thumbnail (all map touch events disabled).
export const buildLeafletMapHtml = (
  lat: number,
  lng: number,
  zoom: number = 17,
  interactive: boolean = true,
  pinLat?: number,
  pinLng?: number,
  satellite: boolean = false,
): string => {
  const pLat = (pinLat ?? lat).toFixed(7);
  const pLng = (pinLng ?? lng).toFixed(7);
  const disableJs = interactive ? '' : 'map.dragging.disable();map.touchZoom.disable();map.doubleClickZoom.disable();map.scrollWheelZoom.disable();if(map.tap)map.tap.disable();';
  const clickJs = !interactive ? '' : `map.on('click',function(e){if(pinMarker)map.removeLayer(pinMarker);pinMarker=L.marker([e.latlng.lat,e.latlng.lng],{icon:redIcon}).addTo(map);window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'map_click',lat:e.latlng.lat,lng:e.latlng.lng}));});window.setPin=function(la,ln){if(pinMarker)map.removeLayer(pinMarker);pinMarker=L.marker([la,ln],{icon:redIcon}).addTo(map);};window.setView=function(la,ln,z){map.setView([la,ln],z||map.getZoom());};`;
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>*{margin:0;padding:0;box-sizing:border-box}html,body,#map{width:100%;height:100%;background:#2a2a3e}.leaflet-control-attribution,.leaflet-control-zoom{display:none!important}</style><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin=""/><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script></head><body><div id="map"></div><script>var map=L.map('map',{attributionControl:false,zoomControl:false}).setView([${lat.toFixed(7)},${lng.toFixed(7)}],${zoom});var osmLayer=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,crossOrigin:true});var satLayer=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,crossOrigin:true});var curLayer=${satellite ? 'satLayer' : 'osmLayer'};curLayer.addTo(map);window.setTileType=function(t){var next=(t==='satellite')?satLayer:osmLayer;if(next===curLayer)return;map.removeLayer(curLayer);curLayer=next;curLayer.addTo(map);};var redIcon=L.divIcon({html:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 40" width="24" height="40"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 28 12 28s12-19 12-28C24 5.4 18.6 0 12 0z" fill="#e74c3c" stroke="#c0392b" stroke-width="1.5"/><circle cx="12" cy="12" r="4.5" fill="white"/></svg>',iconSize:[24,40],iconAnchor:[12,40],className:''});var pinMarker=L.marker([${pLat},${pLng}],{icon:redIcon}).addTo(map);${disableJs}${clickJs}</script></body></html>`;
};
