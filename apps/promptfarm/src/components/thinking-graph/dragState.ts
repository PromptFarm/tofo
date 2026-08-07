 /**
 * Module-level flag that FlowEdge sets during pivot drag.
 * ThinkingGraph reads it to skip the setEdges() call that would overwrite
 * waypoints mid-drag.
 */
export let isPivotDragging = false;

export function setPivotDragging(value: boolean) {
  isPivotDragging = value;
}

