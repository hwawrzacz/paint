import { tap } from 'rxjs/operators';
import { CanvasStateService } from '../services/canvas-state.service';
import { CanvasLine } from './canvas-line';
import { CanvasPoint } from './canvas-point';
import { CanvasSnapshot } from './canvas-snapshot';
import { CurvedLine } from './curved-line';

export class CanvasStorage {
  private _straightLines: CanvasLine[] = [];
  private _curvedLines: CurvedLine[] = [];
  private _points: CanvasPoint[] = [];

  constructor() { }

  //#region Straight lines
  public addStraightLine(line: CanvasLine): void {
    this._straightLines.push(line);
  }

  public removeStraightLine(lineToDelete: CanvasLine): void {
    this._straightLines = this._straightLines.filter(line => this.areLinesIdentical(line, lineToDelete));
  }
  //#endregion

  //#region Curved lines
  public addCurvedLine(line: CurvedLine): void {
    this._curvedLines.push(line);
  }
  //#endregion

  //#region Points
  public addPoint(point: CanvasPoint): void {
    this._points.push(point);
  }
  //#endregion

  //#region Storage management
  private print(): void {
    const snapshot = {
      points: this._points,
      curvedLines: this._curvedLines,
      straightLines: this._straightLines,
    } as CanvasSnapshot;

    console.log(snapshot);
  }

  public getSnapshot(): CanvasSnapshot {
    const snapshot = {
      points: this._points,
      curvedLines: this._curvedLines,
      straightLines: this._straightLines,
    } as CanvasSnapshot;

    return snapshot;
  }
  //#endregion

  //#region Helpers
  public areLinesIdentical(l1: CanvasLine, l2: CanvasLine): boolean {
    return (
      l1.color === l2.color &&
      l1.width === l2.width &&
      l1.p1.x === l2.p1.x &&
      l1.p1.y === l2.p1.y &&
      l1.p2.x === l2.p2.x &&
      l1.p2.y === l2.p2.y
    );
  }
  //#endregion
}