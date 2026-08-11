import { useQuery } from "@tanstack/react-query";
import {
  favoriteCategory,
  getPlayerLibrary,
  unfavoriteCategory,
  type ActiveQuizResume,
  type ContinuePlaying,
  type PlayerLibrary,
} from "@workspace/api-client-react";

export type { ActiveQuizResume, ContinuePlaying, PlayerLibrary };

export const PLAYER_LIBRARY_QUERY_KEY = ["player-library"] as const;

export function usePlayerLibrary(enabled: boolean) {
  return useQuery({
    queryKey: PLAYER_LIBRARY_QUERY_KEY,
    queryFn: getPlayerLibrary,
    enabled,
    staleTime: 30_000,
  });
}

export async function updateCategoryFavorite(categoryId: string, favorited: boolean): Promise<void> {
  if (favorited) await favoriteCategory(categoryId);
  else await unfavoriteCategory(categoryId);
}
