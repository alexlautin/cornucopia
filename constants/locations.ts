export interface FoodLocation {
  id: string;
  name: string;
  address: string;
  type: string;
  snap?: boolean;
  priceLevel?: 1 | 2 | 3;
  // Preserve the raw OSM/shop/amenity tag for better filtering and icon mapping
  rawType?: string;
  coordinate: {
    latitude: number;
    longitude: number;
  };
  distance?: string;
  phone?: string;
  website?: string;
  hours?: string[];
}

// Fallback static locations if API fails
export const foodLocations: FoodLocation[] = [
  {
    id: '1',
    name: 'Atlanta Community Food Bank',
    address: '732 Joseph E Lowery Blvd NW, Atlanta, GA 30318',
    type: 'Food Bank',
    coordinate: { latitude: 33.7648, longitude: -84.4167 },
  },
  {
    id: '2',
    name: 'Ponce City Farmers Market',
    address: '675 Ponce De Leon Ave NE, Atlanta, GA 30308',
    type: 'Farmers Market',
    coordinate: { latitude: 33.7720, longitude: -84.3649 },
  },
  {
    id: '3',
    name: 'Sweet Auburn Curb Market',
    address: '209 Edgewood Ave SE, Atlanta, GA 30303',
    type: 'Market',
    coordinate: { latitude: 33.7551, longitude: -84.3838 },
  },
  {
    id: '4',
    name: 'Open Hand Atlanta',
    address: '1885 DeKalb Ave NE, Atlanta, GA 30307',
    type: 'Meal Delivery',
    coordinate: { latitude: 33.7679, longitude: -84.3397 },
  },
  {
    id: '5',
    name: 'Atlanta Mission Food Pantry',
    address: '2353 Bolton Rd NW, Atlanta, GA 30318',
    type: 'Food Pantry',
    coordinate: { latitude: 33.7711, longitude: -84.4441 },
  },
];
