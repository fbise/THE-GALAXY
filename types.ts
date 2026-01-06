
export enum GalaxyGesture {
  ZOOM_IN = 'zoom_in',
  ZOOM_OUT = 'zoom_out',
  MOVE_LEFT = 'move_left',
  MOVE_RIGHT = 'move_right',
  MOVE_UP = 'move_up',
  MOVE_DOWN = 'move_down',
  STOP = 'stop',
  ROTATE = 'rotate'
}

export interface GalaxyState {
  zoom: number;
  rotationX: number;
  rotationY: number;
  isMoving: boolean;
  currentGesture: string;
}

export interface ControlArgs {
  gesture: GalaxyGesture;
  intensity?: number;
}
