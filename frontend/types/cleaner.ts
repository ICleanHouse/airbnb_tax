export interface PublicCleaner {
  id: number;
  user_id: number;
  kind: string;
  display_name: string;
  bio: string;
  city: string;
  service_areas: string[];
  native_language: string;
  other_languages: string[];
  personal_preferences: string[];
  experience_level: string;
  has_driving_license: boolean | null;
  has_own_car: boolean | null;
  profile_image: string;
  average_rating: string;
  completed_jobs_count: number;
  is_verified: boolean;
}

export interface CleanerReview {
  id: number;
  rating: number;
  comment: string;
  reviewer_name: string;
  created_at: string;
}

export interface PublicCleanerDetail extends PublicCleaner {
  reviews: CleanerReview[];
}

export interface FavouriteCleaner {
  id: number;
  cleaner: number;
  cleaner_name: string;
  cleaner_profile_id: number | null;
  average_rating: number | null;
  completed_jobs_count: number;
  profile_image: string | null;
  service_areas: string[];
  created_at: string;
}
