/**
 * GEOMETRY — Map Position Calculations
 *
 * This file contains the maths that decides
 * where every node appears on the life map.
 *
 * EDIT THIS FILE WHEN:
 * - Branches are overlapping
 * - Nodes are in wrong positions
 * - You need to change spacing between nodes
 *
 * THE KEY FORMULA:
 * getPos(angle, distance) returns {x, y}
 * angle 0 = straight up
 * angle -90 = left
 * angle 90 = right
 * All y values are negative = upward
 */

export function getPos(angleDeg: number, distance: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.sin(rad) * distance,
    y: -Math.abs(Math.cos(rad)) * distance,
  };
}

