import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { DrawingMode } from '../model/canvas-mode';

@Injectable({
  providedIn: 'root'
})
export class CanvasStateService {
  public drawingMode$ = new BehaviorSubject<DrawingMode>(DrawingMode.DRAWING);
  public clear$ = new Subject();

  constructor() { }
}