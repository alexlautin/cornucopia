// Add your API key to a .env file or constants
const GOOGLE_PLACES_API_KEY = 'YOUR_API_KEY_HERE';

export interface PlaceDetails {
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  openingHours?: string[];
  photos?: string[];
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,website,rating,opening_hours,photos&key=${GOOGLE_PLACES_API_KEY}`
    );
    const data = await response.json();
    
    if (data.status === 'OK' && data.result) {
      const place = data.result;
      return {
        name: place.name,
        address: place.formatted_address,
        phone: place.formatted_phone_number,
        website: place.website,
        rating: place.rating,
        openingHours: place.opening_hours?.weekday_text,
        photos: place.photos?.map((photo: any) => 
          `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photo.photo_reference}&key=${GOOGLE_PLACES_API_KEY}`
        ),
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching place details:', error);
    return null;
  }
}

// Search for nearby food banks/pantries
export async function searchNearbyFoodLocations(
  latitude: number,
  longitude: number,
  radius: number = 5000
) {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&keyword=food+bank+pantry+market&key=${GOOGLE_PLACES_API_KEY}`
    );
    const data = await response.json();
    return data.results;
  } catch (error) {
    console.error('Error searching places:', error);
    return [];
  }
}
