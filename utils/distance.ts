const EARTH_RADIUS_MILES = 3959;
const DEG_TO_RAD = Math.PI / 180;

const toRadians = (degrees: number) => degrees * DEG_TO_RAD;

export function getDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);
  const deltaLonRad = toRadians(lon2 - lon1);

  const centralAngle = Math.acos(
    Math.sin(lat1Rad) * Math.sin(lat2Rad) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLonRad)
  );

  return Math.round(EARTH_RADIUS_MILES * centralAngle * 10) / 10;
}

export function formatDistance(miles: number): string {
  return `${miles} mi`;
}
