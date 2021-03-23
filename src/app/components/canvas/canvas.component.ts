import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { fromEvent, Subject } from 'rxjs';
import { switchMap, takeUntil, tap } from 'rxjs/operators';
import { CanvasLine } from 'src/app/model/canvas-line';
import { DrawingMode } from 'src/app/model/canvas-mode';
import { CanvasPoint } from 'src/app/model/canvas-point';
import { CanvasStorage } from 'src/app/model/canvas-storage';
import { CurvedLine } from 'src/app/model/curved-line';
import { Point } from 'src/app/model/point';
import { CanvasStateService } from 'src/app/services/canvas-state.service';
import { DrawingManager } from './drawing-manager';

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.scss']
})
export class CanvasComponent implements AfterViewInit {
  private _context?: CanvasRenderingContext2D | null;
  private _contextPreview?: CanvasRenderingContext2D | null;
  private _prevPoint?: Point;
  private _drawingModeChange$ = new Subject();
  private _drawingManager?: DrawingManager;
  private _canvasStorage: CanvasStorage;
  private _currentCurvedLine: CurvedLine;

  @ViewChild('canvas')
  private _canvas?: ElementRef<HTMLCanvasElement>;

  @ViewChild('canvasPreview')
  private _canvasPreview?: ElementRef<HTMLCanvasElement>;

  // Config
  private _width: number = 500;
  private _height: number = 300;

  //#region Getters and setters
  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  get drawingMode(): DrawingMode {
    return this._canvasStateService.drawingMode$.value;
  }

  get strokeSize(): number {
    return this._canvasStateService.strokeWidth$.value;
  };
  get strokeColor(): string {
    return this._canvasStateService.strokeColor$.value;
  };
  //#endregion

  constructor(
    private _canvasStateService: CanvasStateService,
    private _snackBar: MatSnackBar,
  ) {
    this._canvasStorage = new CanvasStorage();
    this._currentCurvedLine = new CurvedLine();
  }

  ngAfterViewInit(): void {
    try {
      this.initializeContexts();
      this.observeDrawingModeChange();
      this.observeCanvasClear();
      this.observeSettingsChanges();
      this.observeActtionEmissions();
    } catch (exc) {
      this.openSnackBar(`Canvas were not initalized properly. Please try to reload the page`);
    }
  }

  private initializeContexts(): void {
    this._context = this._canvas!.nativeElement.getContext('2d');
    this._contextPreview = this._canvasPreview!.nativeElement.getContext('2d');
    this._drawingManager = new DrawingManager(this._context!, this._contextPreview!);
  }

  private observeDrawingModeChange(): void {
    this._canvasStateService.drawingMode$
      .pipe(
        tap(mode => {
          this._drawingModeChange$.next();
          this.switchMode(mode);
        })
      ).subscribe();
  }

  private observeSettingsChanges(): void {
    this._canvasStateService.strokeColor$.pipe(tap(color => this._drawingManager!.strokeColor = color)).subscribe();
    this._canvasStateService.strokeWidth$.pipe(tap(width => this._drawingManager!.strokeWidth = width)).subscribe();
  }

  private switchMode(mode: DrawingMode): void {
    switch (mode) {
      case DrawingMode.DRAWING:
        this.initializeDrawingListener();
        break;

      case DrawingMode.STRAIGHT_LINE:
        this.initializeStraightLineListener();
        break;

      case DrawingMode.STRAIGHT_LINE:
        this.initializeEditListener();
        break;

      default:
        this.openSnackBar('Selected mode is not supported yet');
    }
  }

  private observeCanvasClear(): void {
    this._canvasStateService.clear$
      .pipe(
        tap(() => {
          this._drawingManager!.clearCanvas(this._width, this._height);
          this._drawingManager!.clearCanvasPreview(this._width, this._height);
          this.clearPreviousPoint()
        })
      ).subscribe();
  }

  private observeActtionEmissions(): void {
    this._canvasStateService.printCanvasStorage$.pipe(tap(() => this.onRedrawCanvas())).subscribe();
  }

  //#region Mouse listeners
  private initializeDrawingListener() {
    fromEvent<MouseEvent>(this._canvas?.nativeElement!, 'mousedown')
      .pipe(
        tap(e => {
          this._currentCurvedLine = new CurvedLine();
          this.onDrawPoint(e);
        }),
        switchMap(() => fromEvent<MouseEvent>(this._canvas?.nativeElement!, 'mousemove')
          .pipe(
            takeUntil(fromEvent<MouseEvent>(document, 'mouseup')
              .pipe(
                tap(e => this.onMouseUp(e)),
              )))
        ),
        tap(e => this.onDrawLine(e)),
        takeUntil(this._drawingModeChange$)
      )
      .subscribe();
  }

  private initializeStraightLineListener(): void {
    fromEvent<MouseEvent>(this._canvas?.nativeElement!, 'mousedown')
      .pipe(
        tap(e => this.assingPreviousPointFromEvent(e)),
        switchMap(() => fromEvent<MouseEvent>(this._canvas?.nativeElement!, 'mousemove')
          .pipe(
            takeUntil(fromEvent<MouseEvent>(this._canvas?.nativeElement!, 'mouseup')
              .pipe(
                tap(e => this.onStraightLineMouseUp(e)),
              )))
        ),
        tap(e => this.onDrawLinePreview(e)),
        takeUntil(this._drawingModeChange$)
      )
      .subscribe();
  }

  private initializeEditListener(): void {
  }
  //#endregion

  private onMouseUp(event: MouseEvent): void {
    const newPoint = { x: event.offsetX, y: event.offsetY };

    if (event.shiftKey) {
      const line = {
        p1: newPoint,
        p2: this._prevPoint,
        color: this.strokeColor,
        width: this.strokeSize
      } as CanvasLine;

      this._drawingManager!.drawLine(line);
    }

    this._canvasStorage.addCurvedLine(this._currentCurvedLine);
    this._context!.closePath();
  }

  private onStraightLineMouseUp(event: MouseEvent): void {
    const newPoint = { x: event.offsetX, y: event.offsetY };
    const line = {
      p1: newPoint,
      p2: this._prevPoint,
      color: this.strokeColor,
      width: this.strokeSize
    } as CanvasLine;

    this._drawingManager!.drawStraightLine(line);
    this.assingPreviousPointFromPoint(newPoint);
    this._drawingManager!.clearCanvasPreview(this._width, this._height);
  }

  private onDrawPoint(event: MouseEvent): void {
    const newPoint = {
      x: event.offsetX,
      y: event.offsetY,
      color: this.strokeColor,
      width: this.strokeSize
    } as CanvasPoint;

    if (event.shiftKey && this._prevPoint) {
      const line = {
        p1: newPoint,
        p2: this._prevPoint,
        color: this.strokeColor,
        width: this.strokeSize
      } as CanvasLine;
      this._drawingManager!.drawLine(line);
      this._canvasStorage.addStraightLine(line);
    } else {
      this._drawingManager!.drawPoint(newPoint)
      this._canvasStorage.addPoint(newPoint);
    }

    this._prevPoint = { x: newPoint.x, y: newPoint.y };
  }

  private onDrawLine(event: MouseEvent): void {
    const newPoint = { x: event.offsetX, y: event.offsetY };
    if (!this._prevPoint) {
      this.assingPreviousPointFromPoint(newPoint);
    }
    const line = {
      p1: newPoint,
      p2: this._prevPoint,
      color: this.strokeColor,
      width: this.strokeSize
    } as CanvasLine;

    this._drawingManager!.drawLine(line);
    this._currentCurvedLine.addSubLine(line);
    this.assingPreviousPointFromPoint(newPoint);
  }

  private onDrawLinePreview(event: MouseEvent): void {
    this._drawingManager!.clearCanvasPreview(this._width, this._height);
    const newPoint = { x: event.offsetX, y: event.offsetY };
    const line = {
      p1: newPoint,
      p2: this._prevPoint,
      color: this.strokeColor,
      width: this.strokeSize
    } as CanvasLine;

    this._drawingManager!.drawLinePreview(line);
  }

  private onRedrawCanvas(): void {
    const snapshot = this._canvasStorage.getSnapshot();
    this._drawingManager?.redrawFromSnapshot(snapshot);
  }

  private clearPreviousPoint() {
    this._prevPoint = undefined;
  }

  private assingPreviousPointFromEvent(event: MouseEvent): void {
    this._prevPoint = { x: event.offsetX, y: event.offsetY };
  }

  private assingPreviousPointFromPoint(point: Point): void {
    this._prevPoint = { x: point.x, y: point.y };
  }

  private openSnackBar(message: string): void {
    this._snackBar.open(message, undefined, { duration: 3000 });
  }
}
