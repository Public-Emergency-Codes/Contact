/**
 * Detects whether a GPS coordinate is inside or outside a building.
 * Returns 'inside' | 'outside' rather than setting state directly.
 */
export const detectIndoorOutdoorValue = async (
  _lat: number,
  _lng: number,
  gpsAccuracy: number | null = null,
  geocodeResults: any[] | null = null,
): Promise<'inside' | 'outside'> => {
  if (geocodeResults && geocodeResults.length > 0) {
    const buildingTypes = ['premise', 'establishment', 'point_of_interest', 'airport',
      'shopping_mall', 'hospital', 'university', 'school', 'stadium', 'museum',
      'library', 'place_of_worship', 'subway_station', 'train_station'];
    const outdoorTypes = ['route', 'street_address', 'intersection', 'natural_feature',
      'park', 'parking', 'neighborhood', 'political',
      'administrative_area_level_1', 'administrative_area_level_2',
      'administrative_area_level_3', 'country', 'postal_code',
      'postal_code_suffix', 'locality', 'sublocality', 'sublocality_level_1'];
    const allTypes: string[] = geocodeResults.flatMap((r: any) => r.types as string[]);
    const hasBuildingType = buildingTypes.some(t => allTypes.includes(t));
    const isOutdoorOnly = allTypes.every(t => outdoorTypes.includes(t));
    if (hasBuildingType) return 'inside';
    if (isOutdoorOnly) return 'outside';
  }
  if (gpsAccuracy !== null) {
    return gpsAccuracy > 20 ? 'inside' : 'outside';
  }
  return 'outside';
};
