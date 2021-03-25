import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { fromEvent, Subject } from 'rxjs';
import { filter, finalize, switchMap, takeUntil, tap } from 'rxjs/operators';
import { CanvasLine } from 'src/app/model/canvas-line';
import { DrawingMode } from 'src/app/model/canvas-mode';
import { CanvasPoint } from 'src/app/model/canvas-point';
import { CanvasRectangle } from 'src/app/model/canvas-rectangle';
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

  @ViewChild('canvas')
  private _canvas?: ElementRef<HTMLCanvasElement>;

  @ViewChild('canvasPreview')
  private _canvasPreview?: ElementRef<HTMLCanvasElement>;

  //#region Component config
  private _width: number = 700;
  private _height: number = 500;
  //#endregion

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
  ) { }

  ngAfterViewInit(): void {
    try {
      this.initializeContexts();
      this.observeDrawingModeChange();
      this.observeCanvasClear();
      this.observeSettingsChanges();
    } catch (exc) {
      this.openSnackBar(`Canvas were not initalized properly. Please try to reload the page`);
    }
  }

  //#region Initializers
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

      case DrawingMode.EDIT:
        this.initializeEditListeners();
        break;

      case DrawingMode.RECTANGLE:
        this.initializeRectangleListener();
        break;

      default:
        this.openSnackBar('Selected mode is not supported yet');
    }
  }
  //#endregion

  //#region Actions listeners
  private observeCanvasClear(): void {
    this._canvasStateService.clear$
      .pipe(
        tap(() => {
          this._drawingManager!.clearCanvasPreview();
          this._drawingManager!.clearCanvas(true);
          this.clearPreviousPoint();
        })
      ).subscribe();
  }
  //#endregion

  //#region Mouse listeners
  // Curved line
  private initializeDrawingListener() {
    fromEvent<MouseEvent>(this._canvas?.nativeElement!, 'mousedown')
      .pipe(
        tap(e => this.onDrawPoint(e)),
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

  // Straight line
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
        tap(e => this.onDrawStraightLinePreview(e)),
        takeUntil(this._drawingModeChange$)
      )
      .subscribe();
  }

  // Rectangle
  private initializeRectangleListener(): void {
    fromEvent<MouseEvent>(this._canvas?.nativeElement!, 'mousedown')
      .pipe(
        tap(e => this.assingPreviousPointFromEvent(e)),
        switchMap(() => fromEvent<MouseEvent>(this._canvas?.nativeElement!, 'mousemove')
          .pipe(
            takeUntil(fromEvent<MouseEvent>(this._canvas?.nativeElement!, 'mouseup')
              .pipe(
                tap(e => this.onRectangleMouseUp(e)),
              )))
        ),
        tap(e => this.onDrawRectanglePreview(e)),
        takeUntil(this._drawingModeChange$)
      )
      .subscribe();
  }

  // Edit line
  private initializeEditListeners(): void {
    this.initializeHoverPathSelectionListener();
    this.initializeEditedLineResizeListener();
  }

  // Edit line detection
  private initializeHoverPathSelectionListener(): void {
    fromEvent<MouseEvent>(this._canvas?.nativeElement!, 'mousemove')
      .pipe(
        tap((e: MouseEvent) => {
          const point = { x: e.offsetX, y: e.offsetY };
          const line = this._drawingManager!.getLineByPoint(point);
          if (!!line) {
            this._drawingManager!.selectLineForEdit(line);
          }
        }),
        takeUntil(this._drawingModeChange$),
        finalize(() => this._drawingManager!.onCancelCurrentLineEdit())
      ).subscribe();
  }

  // Edit line manipulation
  private initializeEditedLineResizeListener() {
    fromEvent<MouseEvent>(this._canvas?.nativeElement!, 'mousedown')
      .pipe(
        filter((e: MouseEvent) => {
          const point = { x: e.offsetX, y: e.offsetY };
          const isInBoundaryPoint = this._drawingManager!.isInBoundaryPoint(point);
          if (isInBoundaryPoint) {
            this._drawingManager?.setDraggablePoint(point);
          }
          return isInBoundaryPoint;
        }),
        tap(() => {
          this._drawingManager?.removeEditedLineFromStorage();
          this._drawingManager?.redrawCanvas();
        }),
        switchMap(() => fromEvent<MouseEvent>(this._canvas?.nativeElement!, 'mousemove')
          .pipe(
            takeUntil(fromEvent<MouseEvent>(this._canvas?.nativeElement!, 'mouseup')
              .pipe(
                tap(e => this.onStraightLineEditMouseUp(e)),
              )))
        ),
        tap(e => this.onDrawEditLinePreview(e)),
        takeUntil(this._drawingModeChange$)
      )
      .subscribe();
  }
  //#endregion

  // ==============================================================================
  // ======== Below are parts of code that can be moved to another classes ========
  // ==============================================================================

  //#region Curved line
  private onMouseUp(event: MouseEvent): void {
    const newPoint = { x: event.offsetX, y: event.offsetY };

    if (event.shiftKey) {
      this._drawingManager!.drawSubline(this._prevPoint!, newPoint);
    }
  }

  private onDrawLine(event: MouseEvent): void {
    const newPoint = { x: event.offsetX, y: event.offsetY };
    if (!this._prevPoint) {
      this.assingPreviousPointFromPoint(newPoint);
    }

    this._drawingManager!.drawSubline(this._prevPoint!, newPoint);
    this.assingPreviousPointFromPoint(newPoint);
  }
  //#endregion

  //#region Straight line
  private onStraightLineMouseUp(event: MouseEvent): void {
    const newPoint = { x: event.offsetX, y: event.offsetY };

    this._drawingManager!.drawStraightLine(this._prevPoint!, newPoint);
    this.assingPreviousPointFromPoint(newPoint);
    this._drawingManager!.clearCanvasPreview();
  }

  private onDrawStraightLinePreview(event: MouseEvent): void {
    const newPoint = { x: event.offsetX, y: event.offsetY };

    this._drawingManager!.clearCanvasPreview();
    this._drawingManager!.drawStraightLinePreview(this._prevPoint!, newPoint);
  }
  //#endregion

  //#region Rectangle
  private onRectangleMouseUp(event: MouseEvent): void {
    const newPoint = { x: event.offsetX, y: event.offsetY };
    this._drawingManager!.drawRectangle(this._prevPoint!, newPoint);
    this.assingPreviousPointFromPoint(newPoint);
    this._drawingManager!.clearCanvasPreview();
  }

  private onDrawRectanglePreview(event: MouseEvent): void {
    const newPoint = { x: event.offsetX, y: event.offsetY };
    this._drawingManager!.clearCanvasPreview();
    this._drawingManager!.drawRectanglePreview(this._prevPoint!, newPoint);
  }
  //#endregion

  //#region Edit straight line
  private onDrawEditLinePreview(event: MouseEvent): void {
    const newPoint = { x: event.offsetX, y: event.offsetY };
    this._drawingManager!.drawEditLinePreview(newPoint);
  }

  private onStraightLineEditMouseUp(event: MouseEvent): void {
    const newPoint = { x: event.offsetX, y: event.offsetY };
    this._drawingManager!.drawEditedStraightLine(newPoint);
    this._drawingManager!.clearCanvasPreview();
  }
  //#endregion

  //#region Point
  private onDrawPoint(event: MouseEvent): void {
    const newPoint = {
      x: event.offsetX,
      y: event.offsetY,
      color: this.strokeColor,
      width: this.strokeSize
    } as CanvasPoint;

    if (event.shiftKey && this._prevPoint) {
      this._drawingManager!.drawSubline(this._prevPoint!, newPoint);
    } else {
      this._drawingManager!.drawPoint(newPoint)
    }

    this._prevPoint = { x: newPoint.x, y: newPoint.y };
  }
  //#endregion

  //#region Helpers
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
  //#endregion
}
