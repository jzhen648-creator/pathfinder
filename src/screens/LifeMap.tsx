/**
 * SCREEN — Life Map
 *
 * This is the main full-screen life map experience users see on the homepage.
 *
 * EDIT THIS FILE WHEN:
 * - You want to change which component powers the life map screen.
 * - You want to wrap the map screen with additional screen-level logic.
 *
 * AFFECTS:
 * - Homepage (`/`)
 * - Life Map page (`/life-map`)
 */

import { PathfinderHome } from "@/components/life-map/pathfinder-home";

export default function LifeMapScreen() {
  return <PathfinderHome />;
}

